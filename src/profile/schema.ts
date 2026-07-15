import type { ApplicantProfile, EducationRecord, EmploymentRecord, LocalState, Preferences } from "../domain/types";

export interface ValidationResult<T> {
  success: boolean;
  value?: T;
  errors: string[];
}

export const EMPTY_PROFILE: ApplicantProfile = {
  schemaVersion: 1,
  identity: { legalFirstName: "", lastName: "" },
  contact: { email: "", phone: "", address: {} },
  links: {},
  employment: [],
  education: [],
  skills: [],
  authorization: {},
  application: {},
  customAnswers: {}
};

export const DEFAULT_PREFERENCES: Preferences = {
  overwriteNonEmpty: false,
  allowSensitive: {},
  readyThreshold: 0.95,
  reviewThreshold: 0.8,
  disabledOrigins: []
};

export const DEFAULT_STATE: LocalState = {
  schemaVersion: 1,
  profile: EMPTY_PROFILE,
  preferences: DEFAULT_PREFERENCES,
  templates: [],
  resumes: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, key: string, errors: string[], path: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    errors.push(`${path}.${key} must be a string`);
    return undefined;
  }
  return value.trim();
}

function requiredString(record: Record<string, unknown>, key: string, errors: string[], path: string): string {
  const value = optionalString(record, key, errors, path);
  if (value === undefined) errors.push(`${path}.${key} is required`);
  return value ?? "";
}

function validateDate(value: string | undefined, errors: string[], path: string): string | undefined {
  if (value !== undefined && !/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(value)) {
    errors.push(`${path} must use YYYY, YYYY-MM, or YYYY-MM-DD without invented precision`);
    return undefined;
  }
  return value;
}

function parseEmployment(value: unknown, errors: string[]): EmploymentRecord[] {
  if (!Array.isArray(value)) {
    errors.push("profile.employment must be an array");
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`profile.employment.${index} must be an object`);
      return [];
    }
    const path = `profile.employment.${index}`;
    const record: EmploymentRecord = {
      company: requiredString(entry, "company", errors, path),
      title: requiredString(entry, "title", errors, path)
    };
    const location = optionalString(entry, "location", errors, path);
    const startDate = validateDate(optionalString(entry, "startDate", errors, path), errors, `${path}.startDate`);
    const endDate = validateDate(optionalString(entry, "endDate", errors, path), errors, `${path}.endDate`);
    const description = optionalString(entry, "description", errors, path);
    if (location !== undefined) record.location = location;
    if (startDate !== undefined) record.startDate = startDate;
    if (endDate !== undefined) record.endDate = endDate;
    if (description !== undefined) record.description = description;
    if (typeof entry.current === "boolean") record.current = entry.current;
    return [record];
  });
}

function parseEducation(value: unknown, errors: string[]): EducationRecord[] {
  if (!Array.isArray(value)) {
    errors.push("profile.education must be an array");
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`profile.education.${index} must be an object`);
      return [];
    }
    const path = `profile.education.${index}`;
    const record: EducationRecord = { school: requiredString(entry, "school", errors, path) };
    for (const key of ["degree", "field"] as const) {
      const parsed = optionalString(entry, key, errors, path);
      if (parsed !== undefined) record[key] = parsed;
    }
    const startDate = validateDate(optionalString(entry, "startDate", errors, path), errors, `${path}.startDate`);
    const endDate = validateDate(optionalString(entry, "endDate", errors, path), errors, `${path}.endDate`);
    if (startDate !== undefined) record.startDate = startDate;
    if (endDate !== undefined) record.endDate = endDate;
    return [record];
  });
}

export function validateProfile(input: unknown): ValidationResult<ApplicantProfile> {
  const errors: string[] = [];
  if (!isRecord(input)) return { success: false, errors: ["profile must be an object"] };
  const identity = isRecord(input.identity) ? input.identity : {};
  const contact = isRecord(input.contact) ? input.contact : {};
  const address = isRecord(contact.address) ? contact.address : {};
  const links = isRecord(input.links) ? input.links : {};
  const authorization = isRecord(input.authorization) ? input.authorization : {};
  const application = isRecord(input.application) ? input.application : {};
  const customAnswers = isRecord(input.customAnswers) ? input.customAnswers : {};

  const legalFirstName = requiredString(identity, "legalFirstName", errors, "profile.identity");
  const lastName = requiredString(identity, "lastName", errors, "profile.identity");
  const email = requiredString(contact, "email", errors, "profile.contact");
  const phone = requiredString(contact, "phone", errors, "profile.contact");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("profile.contact.email is invalid");

  const profile: ApplicantProfile = {
    schemaVersion: 1,
    identity: { legalFirstName, lastName },
    contact: { email, phone, address: {} },
    links: {},
    employment: parseEmployment(input.employment ?? [], errors),
    education: parseEducation(input.education ?? [], errors),
    skills: Array.isArray(input.skills)
      ? input.skills.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
      : [],
    authorization: {},
    application: {},
    customAnswers: {}
  };

  for (const key of ["preferredFirstName", "middleName"] as const) {
    const value = optionalString(identity, key, errors, "profile.identity");
    if (value !== undefined) profile.identity[key] = value;
  }
  for (const key of ["line1", "line2", "city", "region", "country"] as const) {
    const value = optionalString(address, key, errors, "profile.contact.address");
    if (value !== undefined) profile.contact.address[key] = value;
  }
  const postalCode = optionalString(address, "postalCode", errors, "profile.contact.address");
  if (postalCode !== undefined) profile.contact.address.postalCode = postalCode;
  for (const key of ["linkedin", "github", "portfolio"] as const) {
    const value = optionalString(links, key, errors, "profile.links");
    if (value !== undefined) profile.links[key] = value;
  }
  if (typeof authorization.usAuthorized === "boolean") profile.authorization.usAuthorized = authorization.usAuthorized;
  if (typeof authorization.requiresSponsorship === "boolean") profile.authorization.requiresSponsorship = authorization.requiresSponsorship;
  const salary = optionalString(application, "salary", errors, "profile.application");
  const startDate = validateDate(optionalString(application, "startDate", errors, "profile.application"), errors, "profile.application.startDate");
  if (salary !== undefined) profile.application.salary = salary;
  if (startDate !== undefined) profile.application.startDate = startDate;
  const defaultResumeId = optionalString(input, "defaultResumeId", errors, "profile");
  if (defaultResumeId !== undefined) profile.defaultResumeId = defaultResumeId;

  for (const [key, value] of Object.entries(customAnswers)) {
    if (["string", "number", "boolean"].includes(typeof value)) profile.customAnswers[key] = value as string | number | boolean;
    else errors.push(`profile.customAnswers.${key} must be a string, number, or boolean`);
  }

  return errors.length ? { success: false, value: profile, errors } : { success: true, value: profile, errors };
}

export function validateState(input: unknown): ValidationResult<LocalState> {
  if (!isRecord(input)) return { success: false, errors: ["state must be an object"] };
  const profileResult = validateProfile(input.profile);
  if (!profileResult.value) return { success: false, errors: profileResult.errors };
  const preferencesInput = isRecord(input.preferences) ? input.preferences : {};
  const preferences: Preferences = {
    overwriteNonEmpty: preferencesInput.overwriteNonEmpty === true,
    allowSensitive: isRecord(preferencesInput.allowSensitive) ? preferencesInput.allowSensitive as Preferences["allowSensitive"] : {},
    readyThreshold: typeof preferencesInput.readyThreshold === "number" ? preferencesInput.readyThreshold : 0.95,
    reviewThreshold: typeof preferencesInput.reviewThreshold === "number" ? preferencesInput.reviewThreshold : 0.8,
    disabledOrigins: Array.isArray(preferencesInput.disabledOrigins)
      ? preferencesInput.disabledOrigins.filter((value): value is string => typeof value === "string")
      : []
  };
  const state: LocalState = {
    schemaVersion: 1,
    profile: profileResult.value,
    preferences,
    templates: Array.isArray(input.templates) ? input.templates as LocalState["templates"] : [],
    resumes: Array.isArray(input.resumes) ? input.resumes as LocalState["resumes"] : []
  };
  return { success: profileResult.success, value: state, errors: profileResult.errors };
}
