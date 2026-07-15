import { describe, expect, it } from "vitest";
import type { FieldDescriptor, ScanResult } from "../../src/domain/types";
import { buildFillPlan } from "../../src/engine/planner";
import { testState } from "../helpers";

function field(overrides: Partial<FieldDescriptor> & Pick<FieldDescriptor, "fieldId" | "labelText">): FieldDescriptor {
  return {
    control: "text", sectionText: "", options: [], required: false, disabled: false, readOnly: false,
    visible: true, hasValue: false, fingerprint: overrides.fieldId, ...overrides
  };
}

function scan(fields: FieldDescriptor[]): ScanResult {
  return { adapter: "generic", origin: "https://apply.example.test", title: "Application", pageFingerprint: "page", fields, scanDurationMs: 1 };
}

describe("fill planning", () => {
  it("creates deterministic high-confidence steps and blocks sensitive fields", () => {
    const state = testState();
    const descriptors = [
      field({ fieldId: "first", labelText: "First name", autocomplete: "given-name" }),
      field({ fieldId: "email", labelText: "Email", inputType: "email" }),
      field({ fieldId: "auth", labelText: "Are you authorized to work in the United States?", control: "select", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] }),
      field({ fieldId: "gender", labelText: "Gender", control: "select", options: [{ label: "Prefer not to answer", value: "decline" }] })
    ];
    const plan = buildFillPlan(scan(descriptors), state, 123);
    expect(plan.steps.find((step) => step.fieldId === "first")?.category).toBe("ready");
    expect(plan.steps.find((step) => step.fieldId === "email")?.value).toBe("ada@example.test");
    expect(plan.steps.find((step) => step.fieldId === "auth")?.category).toBe("blocked");
    expect(plan.steps.find((step) => step.fieldId === "gender")?.category).toBe("missing");
  });

  it("does not overwrite non-empty fields", () => {
    const plan = buildFillPlan(scan([field({ fieldId: "email", labelText: "Email", hasValue: true })]), testState(), 1);
    expect(plan.steps[0]?.category).toBe("blocked");
    expect(plan.steps[0]?.reason).toContain("Existing");
  });

  it("fills exact authorization answers only after category opt-in", () => {
    const state = testState();
    state.preferences.allowSensitive.work_authorization = true;
    const plan = buildFillPlan(scan([field({
      fieldId: "auth", labelText: "Are you authorized to work in the United States?", control: "select",
      options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]
    })]), state, 1);
    expect(plan.steps[0]?.category).toBe("ready");
    expect(plan.steps[0]?.value).toBe(true);
  });

  it("blocks every field on a paused origin", () => {
    const state = testState();
    state.preferences.disabledOrigins.push("https://apply.example.test");
    const plan = buildFillPlan(scan([field({ fieldId: "email", labelText: "Email", autocomplete: "email" })]), state, 1);
    expect(plan.steps[0]?.category).toBe("blocked");
    expect(plan.steps[0]?.reason).toContain("paused");
  });

  it("assigns repeated records in DOM order", () => {
    const descriptors = [
      field({ fieldId: "c1", labelText: "Company name", sectionText: "Work experience" }),
      field({ fieldId: "t1", labelText: "Job title", sectionText: "Work experience" }),
      field({ fieldId: "c2", labelText: "Company name", sectionText: "Work experience" }),
      field({ fieldId: "t2", labelText: "Job title", sectionText: "Work experience" })
    ];
    const plan = buildFillPlan(scan(descriptors), testState(), 1);
    expect(plan.steps.map((step) => step.value)).toEqual(["Analytical Engines", "Engineer", "Difference Labs", "Researcher"]);
  });

  it("produces equivalent plans for equivalent input", () => {
    const input = scan([field({ fieldId: "email", labelText: "Email", autocomplete: "email" })]);
    const first = buildFillPlan(input, testState(), 42);
    const second = buildFillPlan(structuredClone(input), structuredClone(testState()), 42);
    const normalizeRuntimeMetrics = ({ planDurationMs: _duration, ...plan }: typeof first) => plan;
    expect(normalizeRuntimeMetrics(second)).toEqual(normalizeRuntimeMetrics(first));
  });
});
