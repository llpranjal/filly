import type { ExecutionDocument, FillPlan, FillStep, FillTransactionResult, ResumeMetadata, ScanResult, SemanticType, SiteTemplateRule } from "../domain/types";
import { buildFillPlan } from "../engine/planner";
import { stableHash } from "../core/normalize";
import { initializeState, loadState, saveState } from "../storage/local-state";
import { getResume } from "../storage/resume-store";

interface Session {
  tabId: number;
  plan: FillPlan;
  frames: Record<string, { pageFingerprint: string; origin: string }>;
  resumes: ResumeMetadata[];
  selectedResumeId?: string | undefined;
  lastTransaction?: FillTransactionResult;
}

const SESSION_PREFIX = "localapply.session.";
const ACTIVE_TAB_KEY = "localapply.activeTab";
const frameRegistry = new Map<number, number[]>();

chrome.runtime.onInstalled.addListener(() => {
  void initializeState();
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function injectAgent(tabId: number): Promise<void> {
  const injected = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["page-agent.js"] });
  frameRegistry.set(tabId, [...new Set(injected.map((result) => result.frameId))]);
}

async function activeTabId(): Promise<number> {
  const active = await chrome.storage.session.get(ACTIVE_TAB_KEY);
  if (typeof active[ACTIVE_TAB_KEY] === "number") return active[ACTIVE_TAB_KEY];
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error("No active tab is available");
  return tab.id;
}

async function scanTab(tabId: number): Promise<Session> {
  await injectAgent(tabId);
  const scans: Array<{ frameId: number; scan: ScanResult }> = [];
  for (const frameId of frameRegistry.get(tabId) ?? [0]) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "LOCALAPPLY_SCAN" }, { frameId }) as { ok: boolean; scan?: ScanResult; error?: string };
      if (response.ok && response.scan) scans.push({ frameId, scan: response.scan });
    } catch {
      // Restricted or transient frames are skipped; the top-level scan remains usable.
    }
  }
  if (!scans.length) throw new Error("Unable to scan this page or its accessible frames");
  const primary = scans.find((item) => item.frameId === 0) ?? scans[0]!;
  const combinedScan: ScanResult = {
    adapter: primary.scan.adapter,
    origin: primary.scan.origin,
    title: primary.scan.title,
    pageFingerprint: stableHash(scans.map((item) => `${item.frameId}:${item.scan.pageFingerprint}`).join("|")),
    fields: scans.flatMap((item) => item.scan.fields.map((field) => ({ ...field, fieldId: `f${item.frameId}:${field.fieldId}` }))),
    scanDurationMs: scans.reduce((total, item) => total + item.scan.scanDurationMs, 0)
  };
  const state = await loadState();
  const plan = buildFillPlan(combinedScan, state);
  const frames = Object.fromEntries(scans.map((item) => [String(item.frameId), { pageFingerprint: item.scan.pageFingerprint, origin: item.scan.origin }]));
  const session: Session = { tabId, plan, frames, resumes: state.resumes, selectedResumeId: state.profile.defaultResumeId };
  await chrome.storage.session.set({ [`${SESSION_PREFIX}${tabId}`]: session, [ACTIVE_TAB_KEY]: tabId });
  await chrome.action.setBadgeText({ tabId, text: plan.summary.ready ? String(plan.summary.ready) : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#166534" });
  return session;
}

async function prepareTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  await chrome.storage.session.set({ [ACTIVE_TAB_KEY]: tab.id });
  try {
    await injectAgent(tab.id);
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    console.warn("LocalApply could not access the page", error);
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  void chrome.sidePanel.open({ tabId: tab.id });
  void prepareTab(tab);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  const typed = message as {
    type: string;
    approvedStepIds?: string[];
    resumeId?: string;
    template?: { fieldFingerprint: string; control: FillStep["control"]; path?: SemanticType; skip?: boolean };
  };
  const run = async (): Promise<unknown> => {
    if (typed.type === "UI_SCAN") return { ok: true, session: await scanTab(await activeTabId()) };
    if (typed.type === "UI_GET_SESSION") {
      const tabId = await activeTabId();
      const stored = await chrome.storage.session.get(`${SESSION_PREFIX}${tabId}`);
      return { ok: true, session: stored[`${SESSION_PREFIX}${tabId}`] as Session | undefined };
    }
    if (typed.type === "UI_EXECUTE") {
      const tabId = await activeTabId();
      const stored = await chrome.storage.session.get(`${SESSION_PREFIX}${tabId}`);
      const session = stored[`${SESSION_PREFIX}${tabId}`] as Session | undefined;
      if (!session) throw new Error("Scan this page before filling it");
      const approved = new Set(typed.approvedStepIds ?? []);
      const steps: FillStep[] = session.plan.steps.filter((step) => step.category === "ready" || (step.category === "review" && approved.has(step.fieldId)));
      const documents: Record<string, ExecutionDocument> = {};
      for (const step of steps) {
        if (step.control !== "file" || typeof step.value !== "string" || documents[step.value]) continue;
        const storedDocument = await getResume(step.value);
        if (!storedDocument) continue;
        const bytes = new Uint8Array(storedDocument.bytes);
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        documents[step.value] = {
          id: step.value,
          filename: storedDocument.metadata.filename,
          mimeType: storedDocument.metadata.mimeType,
          base64: btoa(binary)
        };
      }
      const grouped = new Map<number, FillStep[]>();
      for (const step of steps) {
        const match = step.fieldId.match(/^f(\d+):(.+)$/);
        const frameId = match ? Number(match[1]) : 0;
        const localStep = { ...step, fieldId: match?.[2] ?? step.fieldId };
        grouped.set(frameId, [...(grouped.get(frameId) ?? []), localStep]);
      }
      const transaction: FillTransactionResult = { transactionId: `transaction-${Date.now().toString(36)}`, results: [] };
      for (const [frameId, frameSteps] of grouped) {
        const frame = session.frames[String(frameId)];
        if (!frame) continue;
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "LOCALAPPLY_EXECUTE",
          pageFingerprint: frame.pageFingerprint,
          steps: frameSteps,
          documents
        }, { frameId }) as { ok: boolean; transaction?: FillTransactionResult; error?: string };
        if (!response.ok || !response.transaction) throw new Error(response.error ?? `Fill failed in frame ${frameId}`);
        transaction.results.push(...response.transaction.results.map((result) => ({ ...result, fieldId: `f${frameId}:${result.fieldId}` })));
      }
      session.lastTransaction = transaction;
      try {
        const refreshed = await scanTab(tabId);
        refreshed.lastTransaction = transaction;
        refreshed.selectedResumeId = session.selectedResumeId;
        if (session.selectedResumeId) {
          const resume = refreshed.resumes.find((item) => item.id === session.selectedResumeId);
          if (resume) {
            for (const step of refreshed.plan.steps) {
              if (step.semanticType !== "application.resume") continue;
              step.value = resume.id;
              step.valueSummary = resume.filename;
            }
          }
        }
        await chrome.storage.session.set({ [`${SESSION_PREFIX}${tabId}`]: refreshed });
        return { ok: true, session: refreshed };
      } catch {
        await chrome.storage.session.set({ [`${SESSION_PREFIX}${tabId}`]: session });
        return { ok: true, session };
      }
    }
    if (typed.type === "UI_SELECT_RESUME") {
      const tabId = await activeTabId();
      const stored = await chrome.storage.session.get(`${SESSION_PREFIX}${tabId}`);
      const session = stored[`${SESSION_PREFIX}${tabId}`] as Session | undefined;
      if (!session || !typed.resumeId || !session.resumes.some((resume) => resume.id === typed.resumeId)) throw new Error("Selected resume is unavailable");
      const resume = session.resumes.find((item) => item.id === typed.resumeId)!;
      session.selectedResumeId = typed.resumeId;
      for (const step of session.plan.steps) {
        if (step.semanticType !== "application.resume") continue;
        step.value = typed.resumeId;
        step.valueSummary = resume.filename;
        step.category = "ready";
        delete step.reason;
      }
      session.plan.summary = { ready: 0, review: 0, blocked: 0, missing: 0 };
      for (const step of session.plan.steps) session.plan.summary[step.category] += 1;
      await chrome.storage.session.set({ [`${SESSION_PREFIX}${tabId}`]: session });
      return { ok: true, session };
    }
    if (typed.type === "UI_TOGGLE_PAUSE") {
      const tabId = await activeTabId();
      const stored = await chrome.storage.session.get(`${SESSION_PREFIX}${tabId}`);
      const session = stored[`${SESSION_PREFIX}${tabId}`] as Session | undefined;
      if (!session) throw new Error("Scan the page before changing its pause state");
      const state = await loadState();
      const paused = state.preferences.disabledOrigins.includes(session.plan.origin);
      state.preferences.disabledOrigins = paused
        ? state.preferences.disabledOrigins.filter((origin) => origin !== session.plan.origin)
        : [...state.preferences.disabledOrigins, session.plan.origin];
      await saveState(state);
      return { ok: true, paused: !paused, session: await scanTab(tabId) };
    }
    if (typed.type === "UI_UNDO") {
      const tabId = await activeTabId();
      const stored = await chrome.storage.session.get(`${SESSION_PREFIX}${tabId}`);
      const session = stored[`${SESSION_PREFIX}${tabId}`] as Session | undefined;
      const responses = [];
      for (const frameId of Object.keys(session?.frames ?? { 0: true }).map(Number)) {
        try {
          responses.push(await chrome.tabs.sendMessage(tabId, { type: "LOCALAPPLY_UNDO" }, { frameId }));
        } catch {
          // A frame may have navigated away after fill; other frames can still undo.
        }
      }
      return { ok: true, responses };
    }
    if (typed.type === "UI_OPEN_OPTIONS") {
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    }
    if (typed.type === "UI_SAVE_TEMPLATE") {
      const tabId = await activeTabId();
      const stored = await chrome.storage.session.get(`${SESSION_PREFIX}${tabId}`);
      const session = stored[`${SESSION_PREFIX}${tabId}`] as Session | undefined;
      if (!session || !typed.template) throw new Error("Scan the page before teaching a field");
      const state = await loadState();
      const rule: SiteTemplateRule = {
        id: `template-${Date.now().toString(36)}`,
        ats: session.plan.adapter,
        origin: session.plan.origin,
        fieldFingerprint: typed.template.fieldFingerprint,
        action: typed.template.skip ? { kind: "skip" } : { kind: "profile", path: typed.template.path! },
        expectedControl: typed.template.control,
        enabled: true,
        confirmedAt: Date.now()
      };
      state.templates = [...state.templates.filter((item) => !(item.origin === rule.origin && item.fieldFingerprint === rule.fieldFingerprint)), rule];
      await saveState(state);
      return { ok: true, session: await scanTab(tabId) };
    }
    throw new Error("Unknown LocalApply message");
  };
  void run().then(
    (response) => sendResponse(response),
    (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unexpected extension error" })
  );
  return true;
});
