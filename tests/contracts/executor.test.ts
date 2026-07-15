import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FillStep } from "../../src/domain/types";
import { executePlan, undoLastTransaction } from "../../src/content/executor";
import { scanDocument } from "../../src/content/scanner";
import { mockLocation } from "../helpers";

function step(fieldId: string, control: FillStep["control"], value: FillStep["value"]): FillStep {
  return {
    fieldId, fingerprint: fieldId, labelText: fieldId, control, semanticType: "custom.test", value,
    category: "ready", confidence: 1, source: "template", sensitivity: "ordinary", evidence: []
  };
}

describe("executor contract", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form>
        <label>Email<input id="email" type="email"></label>
        <label>Country<select id="country"><option value="">Choose</option><option value="US">United States</option></select></label>
        <fieldset><legend>Remote?</legend><label><input type="radio" name="remote" value="yes">Yes</label><label><input type="radio" name="remote" value="no">No</label></fieldset>
        <label>Agree<input id="agree" type="checkbox"></label>
      </form>`;
  });

  it("writes, dispatches events, verifies, and undoes standard controls", async () => {
    const scan = scanDocument(document, mockLocation("https://apply.example.test"));
    const emailField = scan.fields.find((field) => field.id === "email")!;
    const countryField = scan.fields.find((field) => field.id === "country")!;
    const radioField = scan.fields.find((field) => field.control === "radio")!;
    const checkboxField = scan.fields.find((field) => field.id === "agree")!;
    const inputListener = vi.fn();
    document.querySelector("#email")!.addEventListener("input", inputListener);
    const result = await executePlan([
      step(emailField.fieldId, "text", "ada@example.test"),
      step(countryField.fieldId, "select", "United States"),
      step(radioField.fieldId, "radio", true),
      step(checkboxField.fieldId, "checkbox", true)
    ], scan.handles);
    expect(result.results.map((item) => item.status)).toEqual(["verified", "verified", "verified", "verified"]);
    expect((document.querySelector("#email") as HTMLInputElement).value).toBe("ada@example.test");
    expect((document.querySelector("#country") as HTMLSelectElement).value).toBe("US");
    expect(inputListener).toHaveBeenCalled();
    expect(undoLastTransaction().every((item) => item.status === "verified")).toBe(true);
    expect((document.querySelector("#email") as HTMLInputElement).value).toBe("");
    expect((document.querySelector("#agree") as HTMLInputElement).checked).toBe(false);
  });

  it("does not approximate unknown select options", async () => {
    const scan = scanDocument(document, mockLocation("https://apply.example.test"));
    const countryField = scan.fields.find((field) => field.id === "country")!;
    const result = await executePlan([step(countryField.fieldId, "select", "United Kingdom")], scan.handles);
    expect(result.results[0]?.status).toBe("failed");
    expect(result.results[0]?.message).toContain("No exact select option");
  });

  it("chooses only an exact visible ARIA combobox option", async () => {
    document.body.innerHTML = `
      <form><label for="country-box">Country</label><input id="country-box" role="combobox" aria-controls="countries">
      <div id="countries" role="listbox"><div role="option">United States</div><div role="option">United Kingdom</div></div></form>`;
    const selected: string[] = [];
    document.querySelectorAll("[role=option]").forEach((option) => option.addEventListener("click", () => selected.push(option.textContent ?? "")));
    const scan = scanDocument(document, mockLocation("https://apply.example.test"));
    const combobox = scan.fields.find((field) => field.control === "custom")!;
    const result = await executePlan([step(combobox.fieldId, "custom", "United States")], scan.handles);
    expect(result.results[0]?.status).toBe("verified");
    expect(selected).toEqual(["United States"]);
  });
});
