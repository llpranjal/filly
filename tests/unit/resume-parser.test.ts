import { describe, expect, it } from "vitest";
import { mergeParsedResume, parseResumeText } from "../../src/resume/parse-text";
import { testState } from "../helpers";

const RESUME_TEXT = `
Ada Lovelace
ada@example.test | +1 (415) 555-0100
https://www.linkedin.com/in/ada https://github.com/ada

EXPERIENCE
Analytical Engines
Software Engineer | January 2023 - Present
Built reliable analytical systems used by multiple teams.
Difference Labs
Researcher
February 2021 - December 2022

EDUCATION
Example University
BS in Mathematics
September 2017 - May 2021

SKILLS
TypeScript, SQL, React, Distributed Systems
`;

describe("local resume parsing", () => {
  it("extracts identity, contact, links, dated records, and skills", () => {
    const parsed = parseResumeText(RESUME_TEXT);
    expect(parsed.identity).toMatchObject({ legalFirstName: "Ada", lastName: "Lovelace" });
    expect(parsed.contact.email).toBe("ada@example.test");
    expect(parsed.contact.phone).toContain("415");
    expect(parsed.links.linkedin).toBe("https://www.linkedin.com/in/ada");
    expect(parsed.links.github).toBe("https://github.com/ada");
    expect(parsed.employment).toHaveLength(2);
    expect(parsed.employment[0]).toMatchObject({ company: "Analytical Engines", title: "Software Engineer", startDate: "2023-01", current: true });
    expect(parsed.employment[1]).toMatchObject({ company: "Difference Labs", title: "Researcher", startDate: "2021-02", endDate: "2022-12" });
    expect(parsed.education[0]).toMatchObject({ school: "Example University", degree: "BS", field: "Mathematics", startDate: "2017-09", endDate: "2021-05" });
    expect(parsed.skills).toEqual(["TypeScript", "SQL", "React", "Distributed Systems"]);
  });

  it("merges into empty fields without overwriting explicit profile data", () => {
    const profile = testState().profile;
    profile.identity.legalFirstName = "Explicit";
    delete profile.links.github;
    profile.employment = [];
    profile.education = [];
    profile.skills = [];
    const merged = mergeParsedResume(profile, parseResumeText(RESUME_TEXT));
    expect(merged.profile.identity.legalFirstName).toBe("Explicit");
    expect(merged.profile.links.github).toBe("https://github.com/ada");
    expect(merged.profile.employment).toHaveLength(2);
    expect(merged.appliedFields).not.toContain("identity.legalFirstName");
  });

  it("reports low-confidence omissions instead of inventing data", () => {
    const parsed = parseResumeText("Resume\nOnly a short summary with no contact or dated sections.");
    expect(parsed.contact.email).toBeUndefined();
    expect(parsed.employment).toEqual([]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
