import type { LocalState } from "../src/domain/types";

export function testState(): LocalState {
  return {
    schemaVersion: 1,
    profile: {
      schemaVersion: 1,
      identity: { legalFirstName: "Ada", preferredFirstName: "Ada", lastName: "Lovelace" },
      contact: {
        email: "ada@example.test",
        phone: "+1 415 555 0100",
        address: { line1: "1 Analytical Way", city: "San Francisco", region: "CA", postalCode: "94105", country: "United States" }
      },
      links: { linkedin: "https://www.linkedin.com/in/ada", github: "https://github.com/ada", portfolio: "https://ada.example.test" },
      employment: [
        { company: "Analytical Engines", title: "Engineer", startDate: "2023-01", description: "Built reliable systems." },
        { company: "Difference Labs", title: "Researcher", startDate: "2021-02", endDate: "2022-12" }
      ],
      education: [{ school: "Example University", degree: "BS", field: "Mathematics", endDate: "2021-05" }],
      skills: ["TypeScript", "SQL"],
      authorization: { usAuthorized: true, requiresSponsorship: false },
      application: { salary: "150000", startDate: "2026-08-01" },
      customAnswers: { "How did you hear about us?": "Company website" },
      defaultResumeId: "resume-1"
    },
    preferences: {
      overwriteNonEmpty: false,
      allowSensitive: {},
      readyThreshold: 0.95,
      reviewThreshold: 0.8,
      disabledOrigins: []
    },
    templates: [],
    resumes: [{
      id: "resume-1", name: "General", filename: "Ada_Lovelace_Resume.pdf", mimeType: "application/pdf", size: 1000,
      sha256: "a".repeat(64), createdAt: 1
    }]
  };
}

export function mockLocation(url: string): Location {
  const parsed = new URL(url);
  return {
    hostname: parsed.hostname,
    origin: parsed.origin,
    pathname: parsed.pathname
  } as Location;
}
