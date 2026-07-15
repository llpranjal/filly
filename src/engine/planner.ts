import { normalizeDateForInput, summarizeValue, stableHash } from "../core/normalize";
import type { FillPlan, FillStep, LocalState, PrimitiveValue, ScanResult } from "../domain/types";
import { getProfileValue, matchField } from "./matcher";

function executableValue(value: PrimitiveValue, inputType?: string): PrimitiveValue | undefined {
  if (typeof value === "string" && (inputType === "date" || inputType === "month")) return normalizeDateForInput(value, inputType);
  return value;
}

export function buildFillPlan(scan: ScanResult, state: LocalState, now = Date.now()): FillPlan {
  const started = performance.now();
  const repeatOccurrences = new Map<string, number>();
  const steps: FillStep[] = scan.fields.map((field) => {
    const base = {
      fieldId: field.fieldId,
      fingerprint: field.fingerprint,
      labelText: field.labelText || "Unlabelled field",
      control: field.control,
      confidence: 0,
      sensitivity: "ordinary" as const,
      evidence: [] as string[]
    };
    if (state.preferences.disabledOrigins.includes(scan.origin)) {
      return { ...base, category: "blocked" as const, reason: "LocalApply is paused on this site" };
    }
    const candidate = matchField(field, state.profile, { ats: scan.adapter, origin: scan.origin, templates: state.templates });
    if (candidate && "skip" in candidate) return { ...base, category: "blocked", reason: "Explicit template says to skip" };
    if (!candidate) return { ...base, category: "missing", reason: "No safe deterministic mapping" };
    if (candidate.source !== "template") {
      const repeated = candidate.semanticType.match(/^(employment|education)\.\d+\.(.+)$/);
      if (repeated) {
        const key = `${repeated[1]}.${repeated[2]}`;
        const index = repeatOccurrences.get(key) ?? 0;
        repeatOccurrences.set(key, index + 1);
        candidate.semanticType = `${repeated[1]}.${index}.${repeated[2]}` as typeof candidate.semanticType;
        candidate.profilePath = candidate.semanticType;
        candidate.value = getProfileValue(state.profile, candidate.semanticType);
        candidate.evidence = [...candidate.evidence, `Repeated record ${index + 1}`];
      }
    }
    const candidateBase = {
      ...base,
      semanticType: candidate.semanticType,
      profilePath: candidate.profilePath,
      confidence: candidate.confidence,
      source: candidate.source,
      sensitivity: candidate.sensitivity,
      evidence: candidate.evidence
    };
    if (field.hasValue && !state.preferences.overwriteNonEmpty) {
      return { ...candidateBase, category: "blocked" as const, reason: "Existing value preserved" };
    }
    if (candidate.sensitivity !== "ordinary" && state.preferences.allowSensitive[candidate.sensitivity] !== true) {
      return { ...candidateBase, category: "blocked" as const, reason: `${candidate.sensitivity.replace("_", " ")} fields are disabled` };
    }
    if (candidate.value === undefined || candidate.value === "") {
      return { ...candidateBase, category: "missing" as const, reason: "The matching profile value is empty" };
    }
    const value = executableValue(candidate.value, field.inputType);
    if (value === undefined) {
      return { ...candidateBase, category: "blocked" as const, reason: "Stored date precision is incompatible with this control" };
    }
    if (candidate.confidence >= state.preferences.readyThreshold) {
      return { ...candidateBase, value, valueSummary: summarizeValue(value), category: "ready" as const };
    }
    if (candidate.confidence >= state.preferences.reviewThreshold) {
      return { ...candidateBase, value, valueSummary: summarizeValue(value), category: "review" as const, reason: "Approval required for an ambiguous match" };
    }
    return { ...candidateBase, category: "missing" as const, reason: "Confidence is below the review threshold" };
  });
  const summary = { ready: 0, review: 0, blocked: 0, missing: 0 };
  for (const step of steps) summary[step.category] += 1;
  return {
    planId: `plan-${stableHash(`${scan.pageFingerprint}|${now}|${steps.length}`)}`,
    pageFingerprint: scan.pageFingerprint,
    createdAt: now,
    adapter: scan.adapter,
    origin: scan.origin,
    steps,
    summary,
    scanDurationMs: scan.scanDurationMs,
    planDurationMs: performance.now() - started
  };
}
