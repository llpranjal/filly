export type PrimitiveValue = string | boolean | number;

export type AtsId = "greenhouse" | "lever" | "ashby" | "workday" | "generic";

export type SensitivityClass =
  | "ordinary"
  | "work_authorization"
  | "compensation"
  | "demographic"
  | "legal"
  | "signature";

export type SemanticType =
  | "person.first_name"
  | "person.preferred_name"
  | "person.middle_name"
  | "person.last_name"
  | "person.full_name"
  | "contact.email"
  | "contact.phone"
  | "address.line1"
  | "address.line2"
  | "address.city"
  | "address.region"
  | "address.postal_code"
  | "address.country"
  | "links.linkedin"
  | "links.github"
  | "links.portfolio"
  | "skills"
  | `employment.${number}.${"company" | "title" | "location" | "start_date" | "end_date" | "description"}`
  | `education.${number}.${"school" | "degree" | "field" | "start_date" | "end_date"}`
  | "authorization.us_authorized"
  | "authorization.us_sponsorship"
  | "application.salary"
  | "application.start_date"
  | "application.resume"
  | `custom.${string}`;

export type ControlKind = "text" | "textarea" | "select" | "radio" | "checkbox" | "date" | "file" | "custom";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldDescriptor {
  fieldId: string;
  control: ControlKind;
  inputType?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  labelText: string;
  helpText?: string;
  sectionText: string;
  placeholder?: string;
  options: FieldOption[];
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  visible: boolean;
  hasValue: boolean;
  fingerprint: string;
}

export interface PostalAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface EmploymentRecord {
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  description?: string;
}

export interface EducationRecord {
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
}

export interface ResumeMetadata {
  id: string;
  name: string;
  filename: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: number;
}

export interface ApplicantProfile {
  schemaVersion: 1;
  identity: {
    legalFirstName: string;
    preferredFirstName?: string;
    middleName?: string;
    lastName: string;
  };
  contact: {
    email: string;
    phone: string;
    address: PostalAddress;
  };
  links: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  employment: EmploymentRecord[];
  education: EducationRecord[];
  skills: string[];
  authorization: {
    usAuthorized?: boolean;
    requiresSponsorship?: boolean;
  };
  application: {
    salary?: string;
    startDate?: string;
  };
  customAnswers: Record<string, PrimitiveValue>;
  defaultResumeId?: string;
}

export type TemplateAction =
  | { kind: "profile"; path: SemanticType }
  | { kind: "fixed"; value: PrimitiveValue }
  | { kind: "skip" };

export interface SiteTemplateRule {
  id: string;
  ats?: AtsId;
  origin?: string;
  fieldFingerprint: string;
  action: TemplateAction;
  expectedControl: ControlKind;
  enabled: boolean;
  confirmedAt: number;
}

export interface Preferences {
  overwriteNonEmpty: boolean;
  allowSensitive: Partial<Record<SensitivityClass, boolean>>;
  readyThreshold: number;
  reviewThreshold: number;
  disabledOrigins: string[];
}

export interface LocalState {
  schemaVersion: 1;
  profile: ApplicantProfile;
  preferences: Preferences;
  templates: SiteTemplateRule[];
  resumes: ResumeMetadata[];
}

export interface MatchCandidate {
  semanticType: SemanticType;
  profilePath?: SemanticType | undefined;
  value?: PrimitiveValue | undefined;
  confidence: number;
  source: "template" | "adapter" | "autocomplete" | "exact-label" | "alias" | "custom-answer";
  evidence: string[];
  sensitivity: SensitivityClass;
}

export type PlanCategory = "ready" | "review" | "blocked" | "missing";

export interface FillStep {
  fieldId: string;
  fingerprint: string;
  labelText: string;
  control: ControlKind;
  semanticType?: SemanticType | undefined;
  profilePath?: SemanticType | undefined;
  value?: PrimitiveValue | undefined;
  valueSummary?: string | undefined;
  category: PlanCategory;
  confidence: number;
  source?: MatchCandidate["source"] | undefined;
  sensitivity: SensitivityClass;
  evidence: string[];
  reason?: string | undefined;
}

export interface FillPlan {
  planId: string;
  pageFingerprint: string;
  createdAt: number;
  adapter: AtsId;
  origin: string;
  steps: FillStep[];
  summary: Record<PlanCategory, number>;
  scanDurationMs: number;
  planDurationMs: number;
}

export interface ScanResult {
  adapter: AtsId;
  origin: string;
  title: string;
  pageFingerprint: string;
  fields: FieldDescriptor[];
  scanDurationMs: number;
}

export interface ExecutionResult {
  fieldId: string;
  status: "verified" | "skipped" | "failed";
  message?: string;
}

export interface FillTransactionResult {
  transactionId: string;
  results: ExecutionResult[];
}

export interface ExecutionDocument {
  id: string;
  filename: string;
  mimeType: string;
  base64: string;
}
