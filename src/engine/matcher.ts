import { normalizeOption, normalizeText, stableHash } from "../core/normalize";
import type {
  ApplicantProfile,
  AtsId,
  FieldDescriptor,
  MatchCandidate,
  PrimitiveValue,
  SemanticType,
  SensitivityClass,
  SiteTemplateRule
} from "../domain/types";

interface Rule {
  semanticType: SemanticType;
  aliases: string[];
  autocomplete?: string[];
  sensitivity?: SensitivityClass;
  requiresSection?: RegExp;
}

const RULES: Rule[] = [
  { semanticType: "person.first_name", aliases: ["first name", "legal first name", "given name"], autocomplete: ["given-name"] },
  { semanticType: "person.preferred_name", aliases: ["preferred name", "chosen name"] },
  { semanticType: "person.middle_name", aliases: ["middle name", "middle initial"], autocomplete: ["additional-name"] },
  { semanticType: "person.last_name", aliases: ["last name", "legal last name", "surname", "family name"], autocomplete: ["family-name"] },
  { semanticType: "person.full_name", aliases: ["full name", "legal name", "name"], autocomplete: ["name"] },
  { semanticType: "contact.email", aliases: ["email", "email address", "personal email"], autocomplete: ["email"] },
  { semanticType: "contact.phone", aliases: ["phone", "phone number", "mobile", "mobile phone"], autocomplete: ["tel", "tel-national"] },
  { semanticType: "address.line1", aliases: ["address", "address line 1", "street address", "street"], autocomplete: ["street-address", "address-line1"] },
  { semanticType: "address.line2", aliases: ["address line 2", "apartment suite", "apartment or suite"], autocomplete: ["address-line2"] },
  { semanticType: "address.city", aliases: ["city", "town"], autocomplete: ["address-level2"] },
  { semanticType: "address.region", aliases: ["state", "province", "state province", "region"], autocomplete: ["address-level1"] },
  { semanticType: "address.postal_code", aliases: ["zip", "zip code", "postal code"], autocomplete: ["postal-code"] },
  { semanticType: "address.country", aliases: ["country", "country of residence"], autocomplete: ["country", "country-name"] },
  { semanticType: "links.linkedin", aliases: ["linkedin", "linkedin url", "linkedin profile"] },
  { semanticType: "links.github", aliases: ["github", "github url", "github profile"] },
  { semanticType: "links.portfolio", aliases: ["portfolio", "portfolio url", "personal website", "website"] },
  { semanticType: "employment.0.company", aliases: ["company", "company name", "employer"], requiresSection: /employment|work experience|experience/ },
  { semanticType: "employment.0.title", aliases: ["job title", "position", "title"], requiresSection: /employment|work experience|experience/ },
  { semanticType: "employment.0.location", aliases: ["location", "job location"], requiresSection: /employment|work experience|experience/ },
  { semanticType: "employment.0.start_date", aliases: ["start date", "from"], requiresSection: /employment|work experience|experience/ },
  { semanticType: "employment.0.end_date", aliases: ["end date", "to"], requiresSection: /employment|work experience|experience/ },
  { semanticType: "employment.0.description", aliases: ["description", "responsibilities", "role description"], requiresSection: /employment|work experience|experience/ },
  { semanticType: "education.0.school", aliases: ["school", "school name", "university", "institution"], requiresSection: /education|academic/ },
  { semanticType: "education.0.degree", aliases: ["degree", "degree type"], requiresSection: /education|academic/ },
  { semanticType: "education.0.field", aliases: ["field of study", "major", "area of study"], requiresSection: /education|academic/ },
  { semanticType: "education.0.start_date", aliases: ["start date", "from"], requiresSection: /education|academic/ },
  { semanticType: "education.0.end_date", aliases: ["end date", "graduation date", "to"], requiresSection: /education|academic/ },
  {
    semanticType: "authorization.us_authorized",
    aliases: ["authorized to work in the united states", "are you authorized to work in the united states", "legally authorized to work in the us", "eligible to work in the united states"],
    sensitivity: "work_authorization"
  },
  {
    semanticType: "authorization.us_sponsorship",
    aliases: ["require sponsorship", "will you now or in the future require sponsorship", "need visa sponsorship"],
    sensitivity: "work_authorization"
  },
  { semanticType: "application.salary", aliases: ["salary expectation", "desired salary", "expected compensation"], sensitivity: "compensation" },
  { semanticType: "application.start_date", aliases: ["available start date", "earliest start date", "when can you start"] },
  { semanticType: "application.resume", aliases: ["resume", "cv", "upload resume"], sensitivity: "ordinary" }
];

const NEGATIVE_CONTEXT = /emergency contact|professional reference|personal reference|recruiter|manager name|supervisor name/;
const DEMOGRAPHIC = /gender|race|ethnicity|veteran|disability|sexual orientation|pronouns/;
const LEGAL = /certify|attest|signature|terms and conditions|conflict of interest|non compete/;

export function sensitivityForField(field: FieldDescriptor, rule?: Rule): SensitivityClass {
  if (rule?.sensitivity) return rule.sensitivity;
  const text = normalizeText(`${field.sectionText} ${field.labelText}`);
  if (DEMOGRAPHIC.test(text)) return "demographic";
  if (/signature/.test(text)) return "signature";
  if (LEGAL.test(text)) return "legal";
  return "ordinary";
}

export function getProfileValue(profile: ApplicantProfile, semanticType: SemanticType): PrimitiveValue | undefined {
  switch (semanticType) {
    case "person.first_name": return profile.identity.legalFirstName || undefined;
    case "person.preferred_name": return profile.identity.preferredFirstName;
    case "person.middle_name": return profile.identity.middleName;
    case "person.last_name": return profile.identity.lastName || undefined;
    case "person.full_name": return [profile.identity.legalFirstName, profile.identity.middleName, profile.identity.lastName].filter(Boolean).join(" ") || undefined;
    case "contact.email": return profile.contact.email || undefined;
    case "contact.phone": return profile.contact.phone || undefined;
    case "address.line1": return profile.contact.address.line1;
    case "address.line2": return profile.contact.address.line2;
    case "address.city": return profile.contact.address.city;
    case "address.region": return profile.contact.address.region;
    case "address.postal_code": return profile.contact.address.postalCode;
    case "address.country": return profile.contact.address.country;
    case "links.linkedin": return profile.links.linkedin;
    case "links.github": return profile.links.github;
    case "links.portfolio": return profile.links.portfolio;
    case "authorization.us_authorized": return profile.authorization.usAuthorized;
    case "authorization.us_sponsorship": return profile.authorization.requiresSponsorship;
    case "application.salary": return profile.application.salary;
    case "application.start_date": return profile.application.startDate;
    case "application.resume": return profile.defaultResumeId;
    default: {
      const employment = semanticType.match(/^employment\.(\d+)\.(.+)$/);
      if (employment) {
        const record = profile.employment[Number(employment[1])];
        const key = employment[2];
        if (!record) return undefined;
        if (key === "company") return record.company;
        if (key === "title") return record.title;
        if (key === "location") return record.location;
        if (key === "start_date") return record.startDate;
        if (key === "end_date") return record.endDate;
        if (key === "description") return record.description;
      }
      const education = semanticType.match(/^education\.(\d+)\.(.+)$/);
      if (education) {
        const record = profile.education[Number(education[1])];
        const key = education[2];
        if (!record) return undefined;
        if (key === "school") return record.school;
        if (key === "degree") return record.degree;
        if (key === "field") return record.field;
        if (key === "start_date") return record.startDate;
        if (key === "end_date") return record.endDate;
      }
      if (semanticType.startsWith("custom.")) return profile.customAnswers[semanticType.slice(7)];
      return undefined;
    }
  }
}

function templateCandidate(
  field: FieldDescriptor,
  profile: ApplicantProfile,
  templates: SiteTemplateRule[],
  ats: AtsId,
  origin: string
): MatchCandidate | { skip: true } | undefined {
  const matches = templates
    .filter((rule) => rule.enabled && rule.fieldFingerprint === field.fingerprint && rule.expectedControl === field.control)
    .filter((rule) => (!rule.ats || rule.ats === ats) && (!rule.origin || rule.origin === origin))
    .sort((a, b) => Number(Boolean(b.origin)) - Number(Boolean(a.origin)));
  const winning = matches[0];
  if (!winning) return undefined;
  if (winning.action.kind === "skip") return { skip: true };
  const semanticType = winning.action.kind === "profile" ? winning.action.path : (`custom.${stableHash(winning.id)}` as SemanticType);
  const value = winning.action.kind === "profile" ? getProfileValue(profile, winning.action.path) : winning.action.value;
  return {
    semanticType,
    profilePath: winning.action.kind === "profile" ? winning.action.path : undefined,
    value,
    confidence: 1,
    source: "template",
    evidence: [`Explicit template ${winning.id}`],
    sensitivity: sensitivityForField(field)
  };
}

function valuesCompatible(field: FieldDescriptor, value: PrimitiveValue | undefined): boolean {
  if (value === undefined || field.options.length === 0) return true;
  const wanted = normalizeOption(String(value));
  return field.options.some((option) => normalizeOption(option.label) === wanted || normalizeOption(option.value) === wanted);
}

export function matchField(
  field: FieldDescriptor,
  profile: ApplicantProfile,
  context: { ats: AtsId; origin: string; templates: SiteTemplateRule[] }
): MatchCandidate | { skip: true } | undefined {
  const explicit = templateCandidate(field, profile, context.templates, context.ats, context.origin);
  if (explicit) return explicit;

  const label = normalizeText(field.labelText);
  const section = normalizeText(field.sectionText);
  const combined = normalizeText(`${field.sectionText} ${field.labelText} ${field.name ?? ""} ${field.id ?? ""} ${field.placeholder ?? ""}`);
  if (NEGATIVE_CONTEXT.test(combined)) return undefined;

  const custom = Object.entries(profile.customAnswers).find(([question]) => normalizeText(question) === label);
  if (custom) {
    return {
      semanticType: `custom.${stableHash(normalizeText(custom[0]))}`,
      value: custom[1],
      confidence: 1,
      source: "custom-answer",
      evidence: ["Exact saved-question match"],
      sensitivity: sensitivityForField(field)
    };
  }

  if (field.control === "file" && /\b(resume|cv|curriculum vitae)\b/.test(combined)) {
    return {
      semanticType: "application.resume",
      profilePath: "application.resume",
      value: profile.defaultResumeId,
      confidence: 0.995,
      source: context.ats === "generic" ? "exact-label" : "adapter",
      evidence: ["File control is explicitly labelled as a resume/CV upload"],
      sensitivity: "ordinary"
    };
  }

  let best: MatchCandidate | undefined;
  for (const rule of RULES) {
    if (rule.requiresSection && !rule.requiresSection.test(section)) continue;
    let confidence = 0;
    let source: MatchCandidate["source"] = "alias";
    const evidence: string[] = [];
    const autocomplete = normalizeText(field.autocomplete ?? "");
    if (rule.autocomplete?.includes(autocomplete)) {
      confidence = 0.995;
      source = "autocomplete";
      evidence.push(`autocomplete=${field.autocomplete}`);
    }
    const normalizedAliases = rule.aliases.map(normalizeText);
    if (normalizedAliases.includes(label) && confidence < 0.985) {
      confidence = 0.985;
      source = context.ats === "generic" ? "exact-label" : "adapter";
      evidence.push(`Exact label “${field.labelText}”`);
    } else if (normalizedAliases.some((alias) => alias.length >= 5 && combined.includes(alias)) && confidence < 0.91) {
      confidence = 0.91;
      source = "alias";
      evidence.push("Context contains a known alias");
    }
    if (rule.requiresSection && confidence > 0) {
      confidence = Math.min(0.995, confidence + 0.01);
      evidence.push(`Section “${field.sectionText}” is compatible`);
    }
    if (confidence === 0) continue;
    const value = getProfileValue(profile, rule.semanticType);
    if (!valuesCompatible(field, value)) {
      confidence -= 0.2;
      evidence.push("No exact compatible option is present");
    }
    const candidate: MatchCandidate = {
      semanticType: rule.semanticType,
      profilePath: rule.semanticType,
      value,
      confidence,
      source,
      evidence,
      sensitivity: sensitivityForField(field, rule)
    };
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }
  return best;
}
