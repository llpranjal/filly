import { describe, expect, it } from "vitest";
import type { FieldDescriptor } from "../../src/domain/types";
import { matchField } from "../../src/engine/matcher";
import { testState } from "../helpers";

const field: FieldDescriptor = {
  fieldId: "odd", fingerprint: "fingerprint", control: "text", labelText: "What should we call you?", sectionText: "",
  options: [], required: false, disabled: false, readOnly: false, visible: true, hasValue: false
};

describe("manual templates", () => {
  it("lets a site-specific explicit mapping override inference", () => {
    const state = testState();
    state.templates.push({
      id: "rule", ats: "ashby", origin: "https://jobs.ashbyhq.com", fieldFingerprint: "fingerprint",
      action: { kind: "profile", path: "person.preferred_name" }, expectedControl: "text", enabled: true, confirmedAt: 1
    });
    const match = matchField(field, state.profile, { ats: "ashby", origin: "https://jobs.ashbyhq.com", templates: state.templates });
    expect(match && !("skip" in match) ? match.value : undefined).toBe("Ada");
    expect(match && !("skip" in match) ? match.source : undefined).toBe("template");
  });

  it("honors explicit skip rules", () => {
    const state = testState();
    state.templates.push({
      id: "skip", fieldFingerprint: "fingerprint", action: { kind: "skip" }, expectedControl: "text", enabled: true, confirmedAt: 1
    });
    expect(matchField(field, state.profile, { ats: "generic", origin: "https://x.test", templates: state.templates })).toEqual({ skip: true });
  });
});
