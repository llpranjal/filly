import { describe, expect, it } from "vitest";
import { validateProfile, validateState } from "../../src/profile/schema";
import { testState } from "../helpers";

describe("profile validation", () => {
  it("accepts a complete canonical profile", () => {
    const result = validateState(testState());
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects malformed emails and invented date formats", () => {
    const profile = structuredClone(testState().profile);
    profile.contact.email = "not-email";
    profile.employment[0]!.startDate = "January 2024";
    const result = validateProfile(profile);
    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toContain("email is invalid");
    expect(result.errors.join(" ")).toContain("YYYY");
  });

  it("keeps false distinct from unknown", () => {
    const result = validateProfile(testState().profile);
    expect(result.value?.authorization.requiresSponsorship).toBe(false);
  });
});
