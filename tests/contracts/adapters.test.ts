import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanDocument } from "../../src/content/scanner";
import { buildFillPlan } from "../../src/engine/planner";
import { mockLocation, testState } from "../helpers";

const cases = [
  { fixture: "generic.html", url: "https://apply.example.test/jobs/1", adapter: "generic", minimumReady: 10 },
  { fixture: "greenhouse.html", url: "https://boards.greenhouse.io/example/jobs/1", adapter: "greenhouse", minimumReady: 5 },
  { fixture: "lever.html", url: "https://jobs.lever.co/example/1", adapter: "lever", minimumReady: 5 },
  { fixture: "ashby.html", url: "https://jobs.ashbyhq.com/example/1/application", adapter: "ashby", minimumReady: 4 },
  { fixture: "workday.html", url: "https://example.wd5.myworkdayjobs.com/jobs/1", adapter: "workday", minimumReady: 5 }
] as const;

describe("sanitized ATS contracts", () => {
  for (const item of cases) {
    it(`detects and plans ${item.adapter}`, () => {
      document.documentElement.innerHTML = readFileSync(resolve("tests/fixtures", item.fixture), "utf8");
      const scan = scanDocument(document, mockLocation(item.url));
      const { handles: _handles, ...serializable } = scan;
      const plan = buildFillPlan(serializable, testState(), 1);
      expect(scan.adapter).toBe(item.adapter);
      expect(scan.fields.every((field) => field.visible && !field.disabled)).toBe(true);
      expect(plan.summary.ready).toBeGreaterThanOrEqual(item.minimumReady);
      expect(plan.steps.some((step) => /website_confirm/.test(step.labelText))).toBe(false);
    });
  }

  it("resolves labels, radio groups, hidden fields, and sections", () => {
    document.body.innerHTML = `
      <form>
        <fieldset><legend>Contact</legend><label for="mail">Email address</label><input id="mail" type="email"></fieldset>
        <fieldset><legend>Authorization</legend>
          <span id="auth-label">Authorized to work in the United States?</span>
          <label><input type="radio" name="auth" value="yes" aria-labelledby="auth-label">Yes</label>
          <label><input type="radio" name="auth" value="no" aria-labelledby="auth-label">No</label>
        </fieldset>
        <label hidden>Trap<input name="trap"></label>
      </form>`;
    const scan = scanDocument(document, mockLocation("https://apply.example.test"));
    expect(scan.fields).toHaveLength(2);
    expect(scan.fields.find((field) => field.control === "radio")?.options).toHaveLength(2);
    expect(scan.fields.find((field) => field.inputType === "email")?.sectionText).toBe("Contact");
  });

  it("traverses open shadow roots", () => {
    document.body.innerHTML = "<form><div id='host'></div></form>";
    const host = document.querySelector("#host")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<label>Email<input type='email' autocomplete='email'></label>";
    const scan = scanDocument(document, mockLocation("https://apply.example.test"));
    expect(scan.fields.some((field) => field.autocomplete === "email")).toBe(true);
  });

  it("invalidates field fingerprints when an option vocabulary changes", () => {
    document.body.innerHTML = "<form><label>Country<select name='country'><option>United States</option></select></label></form>";
    const first = scanDocument(document, mockLocation("https://apply.example.test")).fields[0]!.fingerprint;
    document.querySelector("select")!.insertAdjacentHTML("beforeend", "<option>United Kingdom</option>");
    const second = scanDocument(document, mockLocation("https://apply.example.test")).fields[0]!.fingerprint;
    expect(second).not.toBe(first);
  });
});
