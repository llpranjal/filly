import { describe, expect, it } from "vitest";
import type { FieldDescriptor, ScanResult } from "../../src/domain/types";
import { buildFillPlan } from "../../src/engine/planner";
import { testState } from "../helpers";

describe("planner performance budget", () => {
  it("plans 150 deterministic fields under the local p95 target", () => {
    const fields: FieldDescriptor[] = Array.from({ length: 150 }, (_, index) => ({
      fieldId: `field-${index}`, fingerprint: `fp-${index}`, control: "text", inputType: "email", autocomplete: "email",
      labelText: "Email address", sectionText: "Application", options: [], required: true, disabled: false, readOnly: false,
      visible: true, hasValue: false
    }));
    const scan: ScanResult = {
      adapter: "generic", origin: "https://perf.test", title: "Performance", pageFingerprint: "perf", fields, scanDurationMs: 0
    };
    const durations: number[] = [];
    for (let run = 0; run < 30; run += 1) {
      const start = performance.now();
      const plan = buildFillPlan(scan, testState(), run);
      durations.push(performance.now() - start);
      expect(plan.summary.ready).toBe(150);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)]!;
    expect(p95).toBeLessThan(25);
  });
});
