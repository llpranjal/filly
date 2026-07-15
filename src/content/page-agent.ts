import type { ExecutionDocument, FillStep, ScanResult } from "../domain/types";
import { executePlan, undoLastTransaction } from "./executor";
import { scanDocument, type FieldHandle } from "./scanner";

declare global {
  interface Window {
    __localApplyAgentInstalled?: boolean;
  }
}

let currentScan: ScanResult | undefined;
let currentHandles = new Map<string, FieldHandle>();

if (!window.__localApplyAgentInstalled) {
  window.__localApplyAgentInstalled = true;
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("type" in message)) return false;
    const typed = message as { type: string; pageFingerprint?: string; steps?: FillStep[]; documents?: Record<string, ExecutionDocument> };
    if (typed.type === "LOCALAPPLY_PING") {
      sendResponse({ ok: true });
      return false;
    }
    if (typed.type === "LOCALAPPLY_SCAN") {
      const detailed = scanDocument(document, location);
      currentHandles = detailed.handles;
      const { handles: _handles, ...serializable } = detailed;
      currentScan = serializable;
      sendResponse({ ok: true, scan: serializable });
      return false;
    }
    if (typed.type === "LOCALAPPLY_EXECUTE") {
      if (!currentScan || typed.pageFingerprint !== currentScan.pageFingerprint) {
        sendResponse({ ok: false, error: "Page changed after preview; scan again" });
        return false;
      }
      void executePlan(typed.steps ?? [], currentHandles, typed.documents ?? {}).then(
        (transaction) => sendResponse({ ok: true, transaction }),
        (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Execution failed" })
      );
      return true;
    }
    if (typed.type === "LOCALAPPLY_UNDO") {
      sendResponse({ ok: true, results: undoLastTransaction() });
      return false;
    }
    return false;
  });
}
