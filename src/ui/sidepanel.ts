import type { FillPlan, ResumeMetadata, SemanticType } from "../domain/types";

interface SessionView {
  tabId: number;
  plan: FillPlan;
  resumes: ResumeMetadata[];
  selectedResumeId?: string;
  lastTransaction?: { results: Array<{ fieldId: string; status: string; message?: string }> };
}

const status = document.querySelector<HTMLElement>("#status")!;
const summary = document.querySelector<HTMLElement>("#summary")!;
const results = document.querySelector<HTMLElement>("#results")!;
const scanButton = document.querySelector<HTMLButtonElement>("#scan")!;
const fillButton = document.querySelector<HTMLButtonElement>("#fill")!;
const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
const pauseButton = document.querySelector<HTMLButtonElement>("#pause")!;
const settingsButton = document.querySelector<HTMLButtonElement>("#settings")!;
const resumeControl = document.querySelector<HTMLElement>("#resume-control")!;
const resumeSelect = document.querySelector<HTMLSelectElement>("#resume-select")!;
let currentSession: SessionView | undefined;

const teachPaths: Array<{ value: SemanticType; label: string }> = [
  { value: "person.first_name", label: "First name" },
  { value: "person.preferred_name", label: "Preferred name" },
  { value: "person.middle_name", label: "Middle name" },
  { value: "person.last_name", label: "Last name" },
  { value: "person.full_name", label: "Full name" },
  { value: "contact.email", label: "Email" },
  { value: "contact.phone", label: "Phone" },
  { value: "address.line1", label: "Address line 1" },
  { value: "address.line2", label: "Address line 2" },
  { value: "address.city", label: "City" },
  { value: "address.region", label: "State / region" },
  { value: "address.postal_code", label: "Postal code" },
  { value: "address.country", label: "Country" },
  { value: "links.linkedin", label: "LinkedIn" },
  { value: "links.github", label: "GitHub" },
  { value: "links.portfolio", label: "Portfolio" },
  { value: "employment.0.company", label: "Most recent employer" },
  { value: "employment.0.title", label: "Most recent title" },
  { value: "education.0.school", label: "Most recent school" },
  { value: "education.0.degree", label: "Most recent degree" }
];

async function send<T>(message: object): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as { ok: boolean; error?: string } & T;
  if (!response.ok) throw new Error(response.error ?? "LocalApply request failed");
  return response;
}

function setBusy(busy: boolean): void {
  scanButton.disabled = busy;
  fillButton.disabled = busy || !currentSession || currentSession.plan.summary.ready === 0;
}

function statusMessage(title: string, detail: string, kind: "normal" | "error" | "success" = "normal"): void {
  status.innerHTML = "";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  span.className = kind === "error" ? "error" : kind === "success" ? "success" : "muted";
  status.append(strong, span);
}

function renderSession(session: SessionView): void {
  currentSession = session;
  const plan = session.plan;
  statusMessage(`${plan.adapter[0]!.toUpperCase()}${plan.adapter.slice(1)} application`, `${plan.steps.length} fields scanned in ${(plan.scanDurationMs + plan.planDurationMs).toFixed(1)} ms`);
  summary.hidden = false;
  summary.innerHTML = (["ready", "review", "blocked", "missing"] as const).map((category) =>
    `<div class="metric"><strong>${plan.summary[category]}</strong>${category}</div>`).join("");
  resumeControl.hidden = session.resumes.length === 0;
  resumeSelect.innerHTML = "";
  for (const resume of session.resumes) {
    const option = document.createElement("option");
    option.value = resume.id;
    option.textContent = resume.filename;
    option.selected = resume.id === session.selectedResumeId;
    resumeSelect.append(option);
  }
  results.innerHTML = "";
  const execution = new Map(session.lastTransaction?.results.map((item) => [item.fieldId, item]) ?? []);
  for (const category of ["ready", "review", "blocked", "missing"] as const) {
    const steps = plan.steps.filter((step) => step.category === category);
    if (!steps.length) continue;
    const group = document.createElement("div");
    group.className = "group";
    const heading = document.createElement("h2");
    heading.textContent = category;
    group.append(heading);
    for (const step of steps) {
      const item = document.createElement("article");
      const executed = execution.get(step.fieldId);
      item.className = `card field ${executed?.status === "verified" ? "result-ok" : executed?.status === "failed" ? "result-fail" : ""}`;
      const head = document.createElement("div");
      head.className = "field-head";
      const label = document.createElement("span");
      label.className = "field-label";
      label.textContent = step.labelText;
      const confidence = document.createElement("span");
      confidence.className = "confidence";
      confidence.textContent = step.confidence ? `${Math.round(step.confidence * 100)}%` : "—";
      head.append(label, confidence);
      item.append(head);
      if (step.valueSummary) {
        const value = document.createElement("div");
        value.className = "value";
        value.textContent = step.valueSummary;
        item.append(value);
      }
      if (step.reason || executed?.message) {
        const reason = document.createElement("div");
        reason.className = executed?.status === "failed" ? "error" : "reason";
        reason.textContent = executed?.message ?? step.reason ?? "";
        item.append(reason);
      }
      if (step.evidence.length) {
        const evidence = document.createElement("div");
        evidence.className = "evidence";
        evidence.textContent = step.evidence.join(" · ");
        item.append(evidence);
      }
      if (category === "review") {
        const choice = document.createElement("label");
        choice.className = "evidence";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.dataset.approve = step.fieldId;
        check.style.width = "auto";
        choice.append(check, document.createTextNode(" Approve this suggestion"));
        item.append(choice);
      }
      if (category === "review" || category === "missing") {
        const teach = document.createElement("div");
        teach.className = "teach";
        const select = document.createElement("select");
        select.setAttribute("aria-label", `Teach mapping for ${step.labelText}`);
        for (const path of teachPaths) {
          const option = document.createElement("option");
          option.value = path.value;
          option.textContent = path.label;
          if (step.profilePath === path.value) option.selected = true;
          select.append(option);
        }
        const skip = document.createElement("option");
        skip.value = "__skip__";
        skip.textContent = "Always skip this field";
        select.append(skip);
        const save = document.createElement("button");
        save.className = "secondary";
        save.textContent = "Teach";
        save.addEventListener("click", () => void teachField(step.fingerprint, step.control, select.value as SemanticType | "__skip__"));
        teach.append(select, save);
        item.append(teach);
      }
      group.append(item);
    }
    results.append(group);
  }
  fillButton.disabled = plan.summary.ready === 0;
  undoButton.disabled = !session.lastTransaction;
  pauseButton.disabled = false;
  const paused = plan.steps.length > 0 && plan.steps.every((step) => step.reason === "LocalApply is paused on this site");
  pauseButton.textContent = paused ? "Resume site" : "Pause site";
}

async function scan(): Promise<void> {
  setBusy(true);
  statusMessage("Scanning…", "Reading visible application fields without changing them.");
  try {
    const response = await send<{ session: SessionView }>({ type: "UI_SCAN" });
    renderSession(response.session);
  } catch (error) {
    statusMessage("Unable to scan", error instanceof Error ? error.message : "Unknown error", "error");
  } finally {
    setBusy(false);
  }
}

async function fill(): Promise<void> {
  setBusy(true);
  const approvedStepIds = [...document.querySelectorAll<HTMLInputElement>("[data-approve]:checked")].map((input) => input.dataset.approve!);
  try {
    const response = await send<{ session: SessionView }>({ type: "UI_EXECUTE", approvedStepIds });
    renderSession(response.session);
    const verified = response.session.lastTransaction?.results.filter((item) => item.status === "verified").length ?? 0;
    const failed = response.session.lastTransaction?.results.filter((item) => item.status === "failed").length ?? 0;
    statusMessage("Fill complete", `${verified} verified${failed ? `, ${failed} need attention` : ""}. Review the page before submitting.`, failed ? "normal" : "success");
  } catch (error) {
    statusMessage("Fill stopped", error instanceof Error ? error.message : "Unknown error", "error");
  } finally {
    setBusy(false);
  }
}

async function undo(): Promise<void> {
  try {
    await send({ type: "UI_UNDO" });
    statusMessage("Changes undone", "The most recent LocalApply transaction was restored where the page allowed it.", "success");
    undoButton.disabled = true;
  } catch (error) {
    statusMessage("Undo failed", error instanceof Error ? error.message : "Unknown error", "error");
  }
}

async function selectResume(resumeId: string): Promise<void> {
  try {
    const response = await send<{ session: SessionView }>({ type: "UI_SELECT_RESUME", resumeId });
    renderSession(response.session);
    statusMessage("Resume selected", "This document will be used only for the current fill preview.", "success");
  } catch (error) {
    statusMessage("Resume selection failed", error instanceof Error ? error.message : "Unknown error", "error");
  }
}

async function togglePause(): Promise<void> {
  try {
    const response = await send<{ session: SessionView; paused: boolean }>({ type: "UI_TOGGLE_PAUSE" });
    renderSession(response.session);
    statusMessage(response.paused ? "Site paused" : "Site resumed", response.paused ? "No values will be filled on this origin." : "LocalApply can fill this origin again.", "success");
  } catch (error) {
    statusMessage("Pause setting failed", error instanceof Error ? error.message : "Unknown error", "error");
  }
}

async function teachField(fieldFingerprint: string, control: FillPlan["steps"][number]["control"], path: SemanticType | "__skip__"): Promise<void> {
  try {
    const response = await send<{ session: SessionView }>({
      type: "UI_SAVE_TEMPLATE",
      template: path === "__skip__" ? { fieldFingerprint, control, skip: true } : { fieldFingerprint, control, path }
    });
    renderSession(response.session);
    statusMessage("Mapping saved", "This exact field on this site now uses the selected profile value.", "success");
  } catch (error) {
    statusMessage("Could not save mapping", error instanceof Error ? error.message : "Unknown error", "error");
  }
}

scanButton.addEventListener("click", () => void scan());
fillButton.addEventListener("click", () => void fill());
undoButton.addEventListener("click", () => void undo());
pauseButton.addEventListener("click", () => void togglePause());
resumeSelect.addEventListener("change", () => void selectResume(resumeSelect.value));
settingsButton.addEventListener("click", () => void send({ type: "UI_OPEN_OPTIONS" }));

void send<{ session?: SessionView }>({ type: "UI_GET_SESSION" }).then((response) => {
  if (response.session) renderSession(response.session);
  else void scan();
}).catch(() => void scan());
