import type { ApplicantProfile, EducationRecord, EmploymentRecord } from "../domain/types";
import { normalizeText } from "../core/normalize";

export interface ResumeParseResult {
  text: string;
  identity: Partial<ApplicantProfile["identity"]>;
  contact: Partial<ApplicantProfile["contact"]>;
  links: Partial<ApplicantProfile["links"]>;
  employment: EmploymentRecord[];
  education: EducationRecord[];
  skills: string[];
  warnings: string[];
}

export interface ResumeMergeResult {
  profile: ApplicantProfile;
  appliedFields: string[];
}

const SECTION_HEADINGS = new Set([
  "experience", "work experience", "professional experience", "employment", "employment history",
  "education", "academic background", "skills", "technical skills", "core competencies",
  "projects", "selected projects", "certifications", "certificates", "awards", "publications",
  "summary", "professional summary", "objective", "interests", "languages", "volunteering"
]);

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03", apr: "04", april: "04",
  may: "05", jun: "06", june: "06", jul: "07", july: "07", aug: "08", august: "08", sep: "09",
  sept: "09", september: "09", oct: "10", october: "10", nov: "11", november: "11", dec: "12", december: "12"
};

const DATE_TOKEN = String.raw`(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+)?(?:19|20)\d{2}`;
const DATE_RANGE = new RegExp(`(${DATE_TOKEN})\\s*(?:[-–—]|to)\\s*(Present|Current|Now|${DATE_TOKEN})`, "i");

function cleanLines(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•●▪◦‣►*-]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizedHeading(line: string): string {
  return normalizeText(line.replace(/:$/, ""));
}

function section(lines: string[], headings: string[]): string[] {
  const wanted = new Set(headings);
  const start = lines.findIndex((line) => wanted.has(normalizedHeading(line)));
  if (start < 0) return [];
  const output: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (SECTION_HEADINGS.has(normalizedHeading(line))) break;
    output.push(line);
  }
  return output;
}

function canonicalDate(value: string): string {
  const normalized = value.toLowerCase().replace(/\./g, "").trim();
  const year = normalized.match(/(?:19|20)\d{2}/)?.[0] ?? "";
  const monthName = normalized.match(/^[a-z]+/)?.[0];
  return monthName && MONTHS[monthName] ? `${year}-${MONTHS[monthName]}` : year;
}

function dateRange(line: string): { startDate: string; endDate?: string; current?: boolean; remainder: string } | undefined {
  const match = line.match(DATE_RANGE);
  if (!match?.[0] || !match[1] || !match[2]) return undefined;
  const current = /present|current|now/i.test(match[2]);
  const parsed: { startDate: string; endDate?: string; current?: boolean; remainder: string } = {
    startDate: canonicalDate(match[1]),
    remainder: line.replace(match[0], "").replace(/[|,;\s-]+$/, "").trim()
  };
  if (current) parsed.current = true;
  else parsed.endDate = canonicalDate(match[2]);
  return parsed;
}

function looksLikeDescription(line: string): boolean {
  return line.length > 110 || /^(built|developed|designed|managed|led|created|implemented|improved|analyzed|responsible)\b/i.test(line);
}

function parseEmployment(lines: string[]): EmploymentRecord[] {
  const output: EmploymentRecord[] = [];
  const experience = section(lines, ["experience", "work experience", "professional experience", "employment", "employment history"]);
  for (let index = 0; index < experience.length; index += 1) {
    const range = dateRange(experience[index]!);
    if (!range) continue;
    const previous = experience[index - 1] ?? "";
    const previousTwo = experience[index - 2] ?? "";
    const inlineParts = range.remainder.split(/\s+[|•·]\s+|\s+at\s+/i).map((value) => value.trim()).filter(Boolean);
    let company = "";
    let title = "";
    if (inlineParts.length >= 2) {
      title = inlineParts[0]!;
      company = inlineParts[1]!;
    } else if (range.remainder) {
      title = range.remainder;
      company = previous;
    } else {
      title = previous;
      company = previousTwo;
    }
    if (!company || !title || looksLikeDescription(company) || looksLikeDescription(title)) continue;
    const record: EmploymentRecord = { company, title, startDate: range.startDate };
    if (range.endDate) record.endDate = range.endDate;
    if (range.current) record.current = true;
    const descriptions: string[] = [];
    for (let cursor = index + 1; cursor < experience.length && cursor <= index + 4; cursor += 1) {
      if (dateRange(experience[cursor]!)) break;
      if (looksLikeDescription(experience[cursor]!)) descriptions.push(experience[cursor]!);
    }
    if (descriptions.length) record.description = descriptions.join(" ");
    if (!output.some((item) => normalizeText(item.company) === normalizeText(record.company) && normalizeText(item.title) === normalizeText(record.title))) output.push(record);
  }
  return output.slice(0, 12);
}

function parseEducation(lines: string[]): EducationRecord[] {
  const output: EducationRecord[] = [];
  const education = section(lines, ["education", "academic background"]);
  for (let index = 0; index < education.length; index += 1) {
    const range = dateRange(education[index]!);
    if (!range) continue;
    const previous = education[index - 1] ?? "";
    const previousTwo = education[index - 2] ?? "";
    const inline = range.remainder.split(/\s+[|•·]\s+/).map((value) => value.trim()).filter(Boolean);
    const school = inline.length >= 2 ? inline[0]! : previousTwo || previous;
    const degreeLine = inline.length >= 2 ? inline[1]! : previous;
    if (!school || !degreeLine) continue;
    const degreeParts = degreeLine.split(/\s+(?:in|of)\s+/i);
    const record: EducationRecord = { school, startDate: range.startDate };
    if (degreeParts[0]) record.degree = degreeParts[0];
    if (degreeParts[1]) record.field = degreeParts.slice(1).join(" in ");
    if (range.endDate) record.endDate = range.endDate;
    if (!output.some((item) => normalizeText(item.school) === normalizeText(record.school))) output.push(record);
  }
  return output.slice(0, 8);
}

function parseSkills(lines: string[]): string[] {
  const skillLines = section(lines, ["skills", "technical skills", "core competencies"]);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of skillLines.join(",").split(/[,;|•·]/)) {
    const skill = value.replace(/^[^:]{1,24}:\s*/, "").trim();
    const normalized = normalizeText(skill);
    if (!normalized || skill.length > 60 || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(skill);
  }
  return output.slice(0, 60);
}

function likelyName(lines: string[]): string | undefined {
  return lines.slice(0, 12).find((line) => {
    if (/[@\d]|https?:|www\.|linkedin|github|resume|curriculum|vitae/i.test(line)) return false;
    const words = line.split(/\s+/);
    return words.length >= 2 && words.length <= 4 && words.every((word) => /^[\p{L}'-]+$/u.test(word));
  });
}

export function parseResumeText(text: string): ResumeParseResult {
  const lines = cleanLines(text);
  const warnings: string[] = [];
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?\d{1,3}[\s().-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]\d{4}/)?.[0]?.trim();
  const name = likelyName(lines);
  const nameParts = name?.split(/\s+/) ?? [];
  const identity: ResumeParseResult["identity"] = {};
  if (nameParts.length >= 2) {
    identity.legalFirstName = nameParts[0]!;
    identity.lastName = nameParts.at(-1)!;
    if (nameParts.length > 2) identity.middleName = nameParts.slice(1, -1).join(" ");
  } else warnings.push("Could not confidently identify a name");
  const contact: ResumeParseResult["contact"] = {};
  if (email) contact.email = email;
  else warnings.push("No email address was found");
  if (phone) contact.phone = phone;
  else warnings.push("No phone number was found");

  const links: ResumeParseResult["links"] = {};
  const urlCandidates = text.match(/(?:https?:\/\/|www\.)[^\s<>()]+/gi) ?? [];
  for (const raw of urlCandidates) {
    const url = raw.replace(/[),.;]+$/, "");
    const absolute = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    if (/linkedin\.com/i.test(url)) links.linkedin ??= absolute;
    else if (/github\.com/i.test(url)) links.github ??= absolute;
    else links.portfolio ??= absolute;
  }

  const employment = parseEmployment(lines);
  const education = parseEducation(lines);
  const skills = parseSkills(lines);
  if (!employment.length) warnings.push("No dated work experience entries were confidently parsed");
  if (!education.length) warnings.push("No dated education entries were confidently parsed");
  return { text, identity, contact, links, employment, education, skills, warnings };
}

function fillEmpty(target: Record<string, unknown>, key: string, value: unknown, path: string, applied: string[]): void {
  if ((target[key] === undefined || target[key] === "") && value !== undefined && value !== "") {
    target[key] = value;
    applied.push(path);
  }
}

export function mergeParsedResume(profile: ApplicantProfile, parsed: ResumeParseResult): ResumeMergeResult {
  const merged = structuredClone(profile);
  const appliedFields: string[] = [];
  for (const key of ["legalFirstName", "middleName", "lastName"] as const) {
    fillEmpty(merged.identity as unknown as Record<string, unknown>, key, parsed.identity[key], `identity.${key}`, appliedFields);
  }
  for (const key of ["email", "phone"] as const) {
    fillEmpty(merged.contact as unknown as Record<string, unknown>, key, parsed.contact[key], `contact.${key}`, appliedFields);
  }
  for (const key of ["linkedin", "github", "portfolio"] as const) {
    fillEmpty(merged.links as unknown as Record<string, unknown>, key, parsed.links[key], `links.${key}`, appliedFields);
  }
  if (!merged.employment.length && parsed.employment.length) {
    merged.employment = parsed.employment;
    appliedFields.push("employment");
  }
  if (!merged.education.length && parsed.education.length) {
    merged.education = parsed.education;
    appliedFields.push("education");
  }
  const existingSkills = new Set(merged.skills.map(normalizeText));
  const skillCountBefore = merged.skills.length;
  for (const skill of parsed.skills) {
    if (existingSkills.has(normalizeText(skill))) continue;
    merged.skills.push(skill);
    existingSkills.add(normalizeText(skill));
  }
  if (merged.skills.length > skillCountBefore) appliedFields.push("skills");
  return { profile: merged, appliedFields };
}
