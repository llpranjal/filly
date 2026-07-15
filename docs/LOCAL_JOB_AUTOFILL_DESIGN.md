# Local Job Application Autofill Extension

**Status:** Authoritative consolidated design  
**Working name:** LocalApply  
**Target platform:** Google Chrome on one personal laptop  
**Distribution:** Unpacked, local-only Chrome extension  
**Primary priorities:** 1) accuracy, 2) speed, 3) recoverability, 4) privacy  
**Non-goals:** public distribution, multi-user accounts, cloud sync, job discovery, automatic submission

## 1. Executive summary

Yes, this is practical.

A local tool can reproduce the useful autofill portion of products such as Simplify Copilot without recreating the entire Simplify service. A personal version can plausibly feel faster because it can keep one normalized profile on the laptop, skip authentication and cloud round trips, specialize its rules for the applicant and the ATS sites they actually use, and cache every successful mapping.

The right design is not “use an AI model to inspect and fill everything.” That would be slower, less deterministic, and harder to verify. The proposed system uses four progressively more expensive paths:

1. An ATS-specific adapter recognizes known structures and fields.
2. A deterministic matcher uses labels, attributes, field types, section context, and option values.
3. A local correction memory reuses mappings and answers previously approved by the user.
4. An optional local semantic model handles only unresolved or open-ended questions.

The extension produces a fill plan with a confidence score and explanation for every field before modifying the form. It auto-fills only high-confidence, non-sensitive values. Medium-confidence values are shown for one-click approval. Low-confidence or sensitive questions remain unanswered. The extension never submits an application.

The initial implementation should support Greenhouse, Lever, Ashby, and common HTML forms. Workday should follow as a dedicated milestone because its multi-page flows, custom controls, repeated records, and dynamic DOM require substantially more adapter work. Breadth across 100+ portals is possible only over time; depth on the sites the user actually encounters is the faster path to a highly accurate personal tool.

## 2. Product intent

### 2.1 Problem

Job applications repeatedly ask for the same contact details, work history, education, links, work authorization, demographic answers, documents, and role-specific responses. Generic browser autofill does not understand repeated experience records, ATS-specific widgets, or the semantic difference between similarly worded questions.

### 2.2 Product statement

Build a Chrome extension that runs entirely on one laptop, detects job application forms, maps a locally stored applicant profile to those forms, fills them quickly, learns from user corrections, and makes every proposed value reviewable before submission.

### 2.3 Priority order

When priorities conflict, use this order:

1. **Accuracy:** It is better to leave a field empty than insert a plausible but wrong value.
2. **Speed:** Common fields should fill nearly instantly and without network calls.
3. **Recoverability:** Every modification must be explainable, visible, and undoable.
4. **Privacy:** Profile, resumes, answers, traces, and models remain on the laptop.
5. **Coverage:** Add new ATS platforms only without weakening the first four properties.
6. **Visual polish:** The interface should be clear, but aesthetics do not drive architecture.

### 2.4 Independent implementation boundary

This project is an independent implementation of public product behavior. Do not copy, unpack, de-obfuscate, or redistribute Simplify’s extension code, assets, private APIs, wording, or branding. Use a distinct name and interface. Public Simplify documentation is useful only for identifying the category of expected behavior: profile-based field matching, common ATS support, resume uploads, saved answers, and manual review before submission.

## 3. Goals and non-goals

### 3.1 Goals

- Load locally through `chrome://extensions` in Developer mode.
- Work on Chrome with Manifest V3.
- Keep application data local; perform no analytics, authentication, or remote API calls.
- Detect application forms in the top document, same-origin frames, and permitted cross-origin frames.
- Fill standard inputs, textareas, native selects, accessible custom selects, radio groups, checkboxes, date controls, repeated record sections, and resume uploads.
- Support dynamic single-page applications and multi-page application flows.
- Prioritize high-quality adapters for the user’s common ATS platforms.
- Learn approved site-specific and question-specific overrides.
- Show confidence and provenance for each proposed answer.
- Support dry-run preview and one-click undo.
- Provide local diagnostics that make broken pages reproducible without storing sensitive field values by default.
- Make the deterministic engine independently testable from Chrome and from live websites.

### 3.2 Non-goals for version 1

- Discovering or recommending jobs.
- Maintaining a cloud job tracker.
- Automatically tailoring resumes.
- Bypassing CAPTCHAs, anti-bot systems, or application-site security controls.
- Clicking the final Submit/Apply button.
- Inventing facts, dates, skills, credentials, demographic choices, authorization status, or salary expectations.
- Replacing user review.
- Supporting Firefox, Safari, or mobile browsers.
- Matching the coverage of a mature commercial product on day one.
- Public Chrome Web Store distribution.

## 4. Success criteria

Benchmarks must be measured on saved, sanitized fixtures and on a private manual compatibility suite.

### 4.1 Accuracy targets

- At least 99% correct for canonical identity/contact/link fields in supported ATS fixtures.
- At least 97% correct for deterministic non-sensitive fields overall.
- Zero known cases where a low-confidence value is silently filled.
- Zero automatic answers to protected demographic, disability, veteran, sponsorship, compensation, legal attestation, or conflict-of-interest questions unless the user has explicitly configured an exact answer and allowed that field category.
- At least 95% success creating the intended number of education and work-history entries in supported adapters.
- 100% of filled fields appear in the preview/audit list with source and confidence.
- One action restores every field changed by the most recent fill transaction when the page permits it.

### 4.2 Performance targets

- Lightweight page eligibility check: under 10 ms p95 main-thread CPU time.
- Initial form scan on a 150-field page: under 50 ms p95 CPU time.
- Deterministic planning for 150 fields: under 25 ms p95.
- Click-to-complete for a normal single-page form, excluding document upload and local generation: under 500 ms p95.
- Incremental DOM mutation processing: under 8 ms per batch in the common case.
- No long task above 50 ms caused by the extension during idle observation.
- No network request in the core fill path.
- Previously seen question lookup: under 5 ms p95.
- Optional local model may take longer, but must run outside the fill critical path and stream a visible pending result.

### 4.3 Reliability targets

- A failed field does not abort the rest of the transaction.
- Navigation, service-worker suspension, or a closed side panel does not corrupt the profile.
- The same fixture and profile produce the same deterministic plan.
- Every adapter has versioned fixtures and contract tests.

## 5. Core user experience

### 5.1 First-run setup

1. Load the unpacked extension.
2. Open the Options page.
3. Enter or import the applicant profile.
4. Import one or more resume files and give each a short label.
5. Configure sensitive-answer policies and per-category autofill permissions.
6. Run profile validation; resolve missing dates, malformed URLs, and inconsistent records.
7. Optionally install/enable the local semantic companion for open-ended questions.

### 5.2 Application flow

1. The user clicks the toolbar button or uses a keyboard shortcut; Chrome grants temporary `activeTab` access and injects the small page agent on demand.
2. The page agent recognizes the ATS and likely application root without leaving an idle observer on unrelated pages.
3. Chrome opens the side panel and shows the number of detected fillable fields.
4. The extension scans the current application step and builds a plan without changing the page.
5. The panel groups results into:
   - Ready: high-confidence values that can be filled.
   - Review: ambiguous values requiring approval.
   - Missing: profile data is unavailable.
   - Blocked: sensitive, unsupported, or unsafe fields.
6. The user chooses **Fill ready fields** or reviews individual suggestions.
7. The executor fills fields, verifies the DOM value, and reports failures inline.
8. If the page reveals additional fields, the incremental scanner plans only the new or changed region.
9. The user corrects anything necessary. Corrections can be saved as local mappings or reusable answers.
10. The user reviews and submits manually.

### 5.3 Essential controls

- Scan page
- Fill ready fields
- Preview only / dry run
- Undo last fill
- Pause on this site
- Choose resume
- Save correction
- Never fill this question
- Copy profile value
- Export diagnostics
- Teach this page
- Save a site/employer/question template

## 6. System architecture

```text
┌──────────────── Chrome tab / application page ────────────────┐
│ Lightweight detector                                           │
│ Content orchestrator                                           │
│ DOM scanner → descriptors → adapter hints                      │
│ Executor + verifier + transaction undo                         │
│ Main-world bridge only when a framework requires native setter │
└───────────────────────────┬─────────────────────────────────────┘
                            │ typed extension messages
┌───────────────────────────▼─────────────────────────────────────┐
│ Manifest V3 extension                                          │
│ Service worker: routing, tab/frame state, policy enforcement    │
│ Side panel: plan review, approval, progress, corrections        │
│ Options page: profile, documents, settings, diagnostics         │
│                                                               │
│ Profile store      Adapter registry      Answer memory          │
│ Matcher pipeline   Fill planner          Policy engine          │
│ Document store     Local audit log        Benchmark hooks        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ optional persistent native port
┌───────────────────────────▼─────────────────────────────────────┐
│ Optional local companion                                       │
│ Embeddings / small local model / encrypted backup / heavy parse │
│ No internet access; bound only through Chrome native messaging  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.1 Why this split

- The content layer is the only layer that reads and modifies the application DOM.
- The service worker coordinates short-lived events but is not treated as durable in-memory state because Manifest V3 workers can stop when idle.
- The side panel owns interactive review and remains available beside the application.
- The core matcher and planner are pure TypeScript packages, making them fast and testable without a browser.
- The optional companion is excluded from common-field autofill. It is reserved for semantic work that deterministic code cannot do well.

## 7. Core components

### 7.1 Manifest and permissions

Use Manifest V3 with:

- `storage` for settings and compact structured data.
- `scripting` for adapter/bridge injection when needed.
- `sidePanel` for the review interface.
- `activeTab` for explicit one-tab access.
- Required `http://*/*` and `https://*/*` host permissions so arbitrary employer and ATS origins can be scanned reliably.
- `nativeMessaging` only in a build that enables the optional companion.

Version 1 uses required HTTP(S) host access because application origins cannot be predicted and `activeTab` alone is unreliable when the side panel initiates a later scan. It still uses `chrome.scripting.executeScript()` on demand, has no static all-site content script, and leaves no idle page observer. The extension must not request cookies, history, web-request interception, or unrelated page access. The denylist and per-origin Pause control remain mandatory because the declared host scope is broad.

Manifest V3 packages their executable code locally and use an event-driven service worker. Chrome content scripts normally run in an isolated JavaScript world, which is desirable for safety. A narrowly scoped main-world bridge may be injected only for framework-controlled inputs that do not respond correctly from the isolated world.

### 7.2 Lightweight detector

The detector must be tiny and cheap. Its job is not to understand the whole page. It answers: “Is this probably an application form, and which adapter might own it?”

Signals:

- Known ATS hostname/path patterns.
- Presence of a form with job-related labels.
- File inputs accepting PDF/DOC/DOCX.
- JSON-LD `JobPosting` metadata.
- Text/ARIA signals such as application, resume, employment, education, and authorization.
- Known root elements or script/style fingerprints for supported ATS platforms.

The detector is injected only after a user gesture. On a positive signal, it selects the matching adapter. On a negative signal, it returns an unsupported-page result and stops. This leaves unrelated pages completely unaffected until invocation.

### 7.3 DOM scanner and field descriptor model

Never pass raw live DOM nodes into the matcher. Convert each interactive control into a serializable, stable descriptor:

```ts
type FieldDescriptor = {
  fieldId: string;
  frameId: number;
  domPathHint: string;
  tag: "input" | "textarea" | "select" | "custom";
  inputType?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  labelText: string;
  ariaLabel?: string;
  placeholder?: string;
  helpText?: string;
  sectionPath: string[];
  surroundingText: string[];
  options?: Array<{ label: string; value: string }>;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  visible: boolean;
  currentValueSummary?: string;
  repeatGroup?: { kind: string; index: number };
  adapterMetadata?: Record<string, string | number | boolean>;
};
```

Label resolution order:

1. Associated `<label for>` and wrapping labels.
2. `aria-labelledby` nodes in declared order.
3. `aria-label`.
4. Accessible-name computation for supported custom widgets.
5. Nearby legend, heading, and prompt nodes.
6. `name`, `id`, placeholder, and test attributes as lower-quality evidence.

The scanner must:

- Ignore hidden honeypots, disabled controls, navigation controls, search bars, and fields outside the application root.
- Traverse open shadow roots.
- Run in each permitted frame and coordinate results by `tabId`, `documentId`, and `frameId`.
- Recognize radio/checkbox groups as one semantic field.
- Recognize repeatable groups for employment and education.
- Hash normalized question text for answer-memory lookup.
- Retain enough evidence to explain a match without retaining the page’s existing sensitive values.

### 7.4 ATS adapter registry

Adapters turn known ATS behavior into fast, explicit mappings.

```ts
interface AtsAdapter {
  id: string;
  version: string;
  detect(ctx: DetectionContext): DetectionScore;
  findApplicationRoots(doc: Document): Element[];
  describeFields(ctx: ScanContext): FieldDescriptor[];
  classify?(field: FieldDescriptor): MatchCandidate[];
  prepareRepeatGroups?(plan: FillPlan): Promise<PrepareResult>;
  executeOverride?(step: FillStep): Promise<ExecutionResult | null>;
  nextStepSignal?(ctx: PageContext): boolean;
}
```

Initial adapter order:

1. Greenhouse
2. Lever
3. Ashby
4. Generic accessible HTML forms
5. Workday
6. SmartRecruiters
7. iCIMS

Each adapter contains selectors and behavior only for its platform; it does not duplicate the generic engine. Platform-specific rules should be data-driven when possible so selector changes are easy to patch.

### 7.5 Canonical local profile

The profile is the source of truth. It must distinguish “unknown,” “not applicable,” “prefer not to answer,” and explicit false/no values.

```ts
type ApplicantProfile = {
  schemaVersion: number;
  identity: {
    legalFirstName: string;
    preferredFirstName?: string;
    middleName?: string;
    lastName: string;
    pronouns?: string;
  };
  contact: {
    email: string;
    phone: string;
    address?: PostalAddress;
  };
  links: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
    other: Array<{ label: string; url: string }>;
  };
  employment: EmploymentRecord[];
  education: EducationRecord[];
  skills: string[];
  certifications: CertificationRecord[];
  languages: LanguageRecord[];
  preferences: {
    locations?: string[];
    remotePreference?: string;
    salary?: SalaryPreference;
    startDate?: string;
  };
  authorization: {
    byCountry: Record<string, AuthorizationPolicy>;
  };
  demographics: {
    policy: "never" | "exact-only";
    answers: Record<string, ExplicitAnswer>;
  };
  documents: DocumentReference[];
  customFacts: Array<{ key: string; value: string; aliases: string[] }>;
};
```

Dates must preserve the user’s actual precision. For example, a month/year record must not be silently converted into an invented day. Phone numbers should store a normalized form plus preferred display format. All URLs, country names, state/province codes, degree types, and employment types should have normalized canonical forms with display values.

Profile setup may begin by importing a PDF, DOCX, or plain-text resume. Parsing is fully local and lazy-loaded in the Options page. Extracted identity, contact, links, dated employment, dated education, and skills merge only into empty fields and are immediately persisted for autofill; explicit existing values always win. Parsing warnings remain visible and the user reviews the normalized profile before relying on it. Image-only PDFs are stored for upload but require a future local OCR component before they can populate the profile.

### 7.6 Matching pipeline

The matcher returns ranked candidates rather than a value alone.

```ts
type MatchCandidate = {
  profilePath?: string;
  value: unknown;
  semanticType: string;
  score: number;          // 0.0–1.0
  evidence: Evidence[];
  sensitivity: SensitivityClass;
  source: "adapter" | "rule" | "override" | "answer-memory" | "local-model";
};
```

Matching stages:

1. **Site/user override:** Exact approved mapping for the site and question fingerprint.
2. **ATS adapter:** Known platform identifiers and section structures.
3. **HTML semantics:** `autocomplete`, input type, label relationships, names, legends, and option sets.
4. **Alias dictionary:** Versioned phrases mapped to canonical semantic types.
5. **Section reasoning:** “End date” under Education differs from “End date” under Employment.
6. **Option compatibility:** A boolean profile fact is valid only if a semantically compatible option exists.
7. **Cross-field constraints:** Start/end dates, current-role flags, country/state dependencies, and repeated record indexes.
8. **Answer memory:** Exact normalized question, then high-threshold semantic question match.
9. **Optional local semantic fallback:** Only when deterministic evidence is insufficient.

Suggested confidence policy:

- `>= 0.95`: auto-fill if policy allows.
- `0.80–0.949`: show in Review; require approval.
- `< 0.80`: do not fill.
- Sensitive categories always require exact configured semantics regardless of score.
- Local-model suggestions never auto-fill open-ended responses in version 1.

Scores should be calibrated from fixture results rather than chosen permanently by intuition. The explanation should read like: “Matched `contact.email` because the control has `autocomplete=email`, label ‘Email address,’ and input type `email`.”

### 7.7 Policy and safety engine

The policy engine runs after matching and before execution. It owns:

- Per-category enable/disable settings.
- Sensitive-field classifications.
- “Never fill this question/site” rules.
- Confidence thresholds.
- Whether existing non-empty values may be overwritten.
- Whether corrections may be learned.
- Whether local-model output is allowed for a category.
- A hard prohibition on final submission.

Default policy:

- Fill identity, contact, links, employment, education, and configured document fields at high confidence.
- Do not overwrite a non-empty field unless the user selects an explicit overwrite mode.
- Do not infer protected or legal answers.
- Do not fill compensation values without an exact user rule.
- Do not fill attestations or signatures.
- Do not interact with CAPTCHAs.

### 7.8 Fill planner

The planner converts independent candidates into an ordered transaction. It must resolve dependencies before touching the page.

Example ordering:

1. Create required repeated employment/education groups.
2. Set country before state/province.
3. Set current-employment checkbox before end-date fields.
4. Set native fields.
5. Set custom selects and comboboxes.
6. Upload documents.
7. Wait for conditional fields to appear.
8. Rescan only affected regions.
9. Verify all results.

```ts
type FillPlan = {
  planId: string;
  pageFingerprint: string;
  createdAt: number;
  adapter: { id: string; version: string };
  steps: FillStep[];
  warnings: PlanWarning[];
  summary: { ready: number; review: number; blocked: number; missing: number };
};
```

A dry-run plan is the default representation. Execution is a separate explicit operation.

### 7.9 Form executor

The executor modifies one field at a time, catches errors per step, and records the prior value for undo.

Supported strategies:

- Text/email/tel/number: focus, use the native prototype value setter when needed, dispatch `beforeinput`, `input`, `change`, and blur in a tested sequence.
- Native select: choose by exact normalized value/label, then dispatch change.
- Radio group: click the semantically matched visible label/control.
- Checkbox: set only when desired state differs from current state.
- Date: respect control format and stored precision; stop instead of inventing missing precision.
- Custom combobox: open, wait for listbox, rank visible options, click exact/high-confidence match, verify accessible state.
- Repeater: click add-entry, wait for a new stable group, then fill by record index.
- File: reconstruct an imported local document as a `File`, assign through a `DataTransfer` where permitted, dispatch events, and verify the displayed filename. If the site blocks programmatic assignment, guide the user to the correct document for manual selection.

Never depend on synthetic keystrokes as the primary method. Use explicit waits tied to DOM conditions rather than fixed sleeps. All page changes should be tagged in the transaction log so undo restores only extension-owned modifications.

### 7.10 Verification engine

Setting a property is not proof the application accepted it. After each step:

- Read the DOM value/state back.
- For custom widgets, inspect selected option text and ARIA state.
- Detect validation messages and invalid attributes.
- Confirm dependent fields were not cleared by a later choice.
- Mark the step `verified`, `mismatch`, `rejected`, `disappeared`, or `unknown`.
- Retry only with a different safe strategy and a strict retry limit.

At transaction end, re-verify dependency-sensitive values such as state, dates, current employment, and uploaded filenames.

### 7.11 Mutation and navigation coordinator

ATS pages frequently render fields after hydration or after a prior answer. Use one carefully managed `MutationObserver` per document:

- Batch mutations into an animation-frame or short idle queue.
- Reduce each batch to the smallest changed roots.
- Ignore extension UI and irrelevant text-only changes.
- Deduplicate descriptors by stable field ID.
- Disconnect during large executor-controlled mutations, then perform one targeted rescan.
- Dispose listeners on document replacement.

Track `tabId + documentId + frameId`, not URL alone. Multi-page applications may keep the same URL while replacing the form. A page fingerprint should incorporate adapter, normalized form structure, headings, and step indicators.

### 7.12 Answer memory and personal learning

Corrections are the primary long-term accuracy advantage of a single-user local tool.

Store:

- Exact question fingerprint → approved answer.
- Semantic question fingerprint → approved answer, used only above a strict similarity threshold.
- Site + field fingerprint → canonical profile path.
- Site + option vocabulary → canonical option mapping.
- Negative rule → never fill this question.
- Correction history with adapter version for debugging and invalidation.

Normalize question fingerprints by Unicode normalization, whitespace folding, punctuation handling, safe removal of required markers, and versioned boilerplate removal. Never generalize a correction involving sensitive categories unless the user explicitly chooses to do so.

When a user edits a value after autofill, do not silently assume the edit is a correction. Offer a small “Save this correction?” action with its proposed scope:

- This field once
- This exact question everywhere
- This site and question
- Update my profile
- Never autofill this question

### 7.13 Manual site templates and Teach This Page

Explicit user intent outranks inference. A manual rule can map a detected field to a canonical profile path, provide an exact fixed value, select a saved answer, or require the extension to always skip the field. Rules use progressively narrower scopes: ATS, employer/origin, exact field/question fingerprint, and exact application. The narrowest matching rule wins.

Teach This Page is a dry-run workflow in the side panel. For ambiguous or unknown fields it shows the field label, control type, available options, current evidence, and a list of canonical profile values. Saving creates a local, inspectable rule; it does not infer from text the user typed into the employer’s page. A rule stores the expected control type and an option-set fingerprint. If the control type, label structure, or option vocabulary changes, the old fingerprint no longer matches and the rule is quarantined rather than approximately applied.

Sensitive fields remain subject to category policy even when a profile mapping is taught. A user may explicitly enable an exact sensitive category, but a template can never bypass the hard prohibition on signatures, attestations, CAPTCHAs, or final submission.

### 7.14 Local semantic service (optional)

The deterministic extension is a complete product. The companion is optional and should be added only after deterministic benchmarks are strong.

Use cases:

- Embed unknown labels/questions for semantic comparison.
- Rank profile facts for an ambiguous prompt.
- Draft an open-ended response from explicitly selected profile facts and the visible job description.
- Parse a resume during profile import, with user review before saving.

Do not use it to:

- Guess factual or protected answers.
- Choose among legal attestations.
- submit forms.
- replace the deterministic adapter path.

Preferred transport is a persistent Chrome native-messaging port. This avoids an exposed localhost HTTP server and lets the service worker broker content-script requests. The protocol should be versioned JSON with request IDs, deadlines, cancellation, model/version metadata, and maximum input sizes. The companion must not make internet requests.

Model selection must be benchmark-driven on the actual laptop. A small embedding model is likely sufficient for label similarity. A generative model should be optional because model startup, memory, and generation can conflict with the sub-500 ms core target. Prewarm only when the user enables AI and opens an application page; otherwise consume no resources.

### 7.15 Storage

Use separate stores by data shape:

- `chrome.storage.local`: compact settings, profile metadata, policies, adapter configuration, and small caches.
- Extension-origin IndexedDB: resume/document bytes, larger answer memory, audit records, benchmark samples.
- In-memory per-document state: descriptors, current plan, DOM handles, and undo transaction.
- Optional local companion storage: model files and opt-in encrypted backup.

Apply schema versions and transactional migrations. Export/import must use a versioned archive with hashes and an optional password. Do not log actual field values by default. Profile and document deletion must remove all associated derived caches.

### 7.16 Side panel and options interface

Use Chrome’s side panel rather than a large injected overlay. It stays beside the application and can access extension APIs without interfering with the target DOM.

Side panel sections:

- Page status and detected ATS.
- Resume selector.
- Ready / Review / Missing / Blocked counts.
- Field rows with question, proposed value summary, confidence, source, and explanation.
- Fill, rescan, undo, and pause controls.
- A visible statement that the user must review and submit.

Options sections:

- Profile editor with validation.
- Employment/education ordering and inclusion rules.
- Document library.
- Work authorization and sensitive-answer policy.
- Site permissions and disabled sites.
- Local model status.
- Corrections and answer memory manager.
- Diagnostics and data export/delete.

## 8. End-to-end data flow

```text
Page mutation/navigation
        ↓
Cheap eligibility detection
        ↓
Adapter selection + DOM scan in every relevant frame
        ↓
Serializable field descriptors
        ↓
Profile snapshot + overrides + answer-memory lookup
        ↓
Ranked match candidates
        ↓
Policy filter + dependency resolution
        ↓
Dry-run fill plan shown in side panel
        ↓ user approval
Ordered execution transaction
        ↓
Per-field readback and validation
        ↓
Results, undo snapshot, optional correction prompts
```

Important invariant: the side panel never sends arbitrary selectors or JavaScript to a content script. It sends a validated plan ID and approved step IDs. The content orchestrator owns DOM handles and checks that the page fingerprint still matches before execution.

## 9. Performance design

### 9.1 Keep the common path deterministic

Identity, contact, links, standard dates, known select vocabularies, and ATS-specific structures should require no model and no network. Compile aliases into indexed maps. Cache normalized profile variants at profile-save time rather than recomputing them per form.

### 9.2 Load in layers

- Layer 0: very small detector.
- Layer 1: generic scanner and adapter selected for the page.
- Layer 2: side-panel application bundle, only when opened.
- Layer 3: local semantic service, only for unresolved tasks.

### 9.3 Incremental work

- Scan the application root, not the whole page.
- Cache descriptor hashes.
- Recompute only fields affected by profile/settings change.
- Process only changed DOM roots after initial scan.
- Avoid serializing large page text through extension messaging.
- Extract the minimum job-description text needed for an explicitly requested draft.

### 9.4 Benchmark gates

Every pull request affecting scanner, matcher, planner, or adapters should run:

- Fixture accuracy diff.
- False-positive/false-fill diff.
- Scan and plan microbenchmarks.
- Bundle-size diff.
- Mutation stress test.

A performance regression above 10% or an accuracy regression blocks the change unless a benchmark fixture is shown to be invalid.

## 10. Accuracy design

### 10.1 Treat ambiguity as a state

The output is not only “matched” or “unmatched.” Use:

- Exact
- High confidence
- Ambiguous
- Missing profile fact
- Sensitive/blocked
- Unsupported control
- Dependency unresolved

This prevents the system from disguising uncertainty as a guessed answer.

### 10.2 Use option vocabularies as evidence

Dropdown options often disambiguate a field better than its label. For example, a prompt labeled “Status” with citizenship/visa options is an authorization field, while one with active/inactive values is not. Candidate scoring must include compatibility with the full option set.

### 10.3 Preserve factual boundaries

- Never convert years of experience into a value unless the calculation rule is explicit and reviewable.
- Never claim a skill only because it appears in a job description.
- Never infer ethnicity, gender, disability, veteran status, or citizenship.
- Never infer sponsorship answers from a resume.
- Never invent missing day-level dates.
- Never select “I agree” or sign an attestation.

### 10.4 Learn narrowly first

New overrides should default to the narrowest useful scope. A bad global synonym can harm every site; a site-and-question-specific correction is safer and nearly as useful for a personal application workflow.

## 11. Privacy and security

- No remote endpoints, tracking pixels, update checks, crash reporters, telemetry SDKs, or hosted fonts.
- Bundle all executable code and UI assets.
- Use a strict extension content security policy.
- Allow network connections only if a future feature explicitly requires one; keep the default build network-disabled.
- Do not expose profile data to page scripts. Main-world bridge messages must use random per-document channels, strict schemas, and no profile payload beyond the one value being set.
- Restrict content-script messages by sender tab/frame and validate every message.
- Keep native-messaging host allowlists restricted to this extension ID.
- Redact values, resume content, emails, phone numbers, addresses, and free-text answers from logs by default.
- Provide one-click data export and complete deletion.
- Display current site access clearly and allow immediate pause.
- Never run on browser internal pages, password pages, banking sites, or non-HTTP(S) schemes.
- Maintain an explicit denylist and respect user-disabled origins.

Local-only does not automatically mean secure: any extension with all-site access can read sensitive pages. Minimize permissions, keep the code auditable, and isolate profile access behind typed APIs.

## 12. Failure handling

| Failure | Expected behavior |
|---|---|
| Unknown field | Leave empty and show Missing/Unsupported |
| Two close candidates | Require review and show both explanations |
| Element disappears | Mark disappeared, rescan changed root, do not retry blindly |
| Custom select rejects value | Restore previous state and request manual selection |
| Document upload blocked | Show chosen local filename and prompt manual upload |
| Conditional field appears | Targeted rescan and add to review plan |
| Page changes after preview | Invalidate plan and require rescan |
| Service worker restarts | Rehydrate compact tab metadata; content script remains source of live DOM state |
| Local model unavailable | Continue deterministic fill; label semantic features unavailable |
| Adapter selectors break | Fall back to generic scanner, reduce confidence, export redacted diagnostic |
| Partial transaction failure | Continue independent steps, summarize failures, preserve undo data |

## 13. Observability and diagnostics

All observability is local.

Collect timing and outcome events such as:

- detector duration and decision
- adapter and version
- number of fields scanned
- match-source counts
- plan category counts
- executor strategy and status
- mutation batch size/duration
- verification failures

Default events must contain hashes and semantic types, not raw labels or values. A user-triggered debug export can include sanitized structure, adapter info, browser version, error stacks, and performance timings. If raw HTML is ever needed, collect only the selected form subtree after a prominent preview/redaction step.

## 14. Testing strategy

### 14.1 Unit tests

- Text and Unicode normalization.
- Accessible label extraction.
- Alias/rule scoring.
- Option vocabulary matching.
- Question fingerprint stability.
- Date precision and formatting.
- Authorization and sensitive-field policy.
- Dependency ordering.
- Profile migrations and validation.

### 14.2 Fixture contract tests

Create sanitized HTML fixtures for each adapter and common variants:

- Simple form.
- Multi-step form.
- Repeated employment and education.
- Current employment with disabled end date.
- Country/state conditional control.
- Native and custom selects.
- Radio and checkbox groups.
- Required/optional document uploads.
- Open shadow root.
- Same-origin and cross-origin frames where testable.
- Client rerender after setting a value.
- Honeypot and hidden fields.

Each expected field maps to a canonical semantic type and expected execution result. Fixtures must never contain a real user’s application data.

### 14.3 Browser end-to-end tests

Use Playwright with a persistent Chromium context and the unpacked extension. Test:

- First-run profile setup.
- Page detection and side-panel state.
- Preview, fill, verification, and undo.
- Dynamic fields and navigation.
- Service-worker restart.
- Permission denial.
- Document reconstruction/upload on controlled fixtures.
- Correction persistence after browser restart.

### 14.4 Manual compatibility runs

Keep a private checklist of real ATS application pages and record only:

- ATS/version signal.
- total, correct, missed, and wrong fields.
- failed control types.
- scan/fill timing.
- redacted notes.

Do not submit test applications to employers. Prefer public demo/sandbox pages and locally saved sanitized reproductions.

### 14.5 Accuracy corpus

Maintain a versioned corpus of field descriptors, not copied production pages. Include adversarial pairs:

- legal name vs preferred name
- phone country code vs country of residence
- company location vs applicant location
- school start/end vs job start/end
- eligible to work vs require sponsorship
- desired salary vs current salary
- demographic “prefer not to answer” vs absence of an answer

## 15. Suggested repository structure

```text
localapply/
├── apps/
│   ├── extension/
│   │   ├── manifest.json
│   │   ├── src/background/
│   │   ├── src/content/
│   │   ├── src/sidepanel/
│   │   ├── src/options/
│   │   └── src/main-world-bridge/
│   └── native-companion/            # optional, later milestone
├── packages/
│   ├── profile-schema/
│   ├── field-model/
│   ├── scanner-core/
│   ├── matcher/
│   ├── planner/
│   ├── policy/
│   ├── executor-protocol/
│   ├── storage/
│   └── adapters/
│       ├── generic/
│       ├── greenhouse/
│       ├── lever/
│       ├── ashby/
│       └── workday/
├── fixtures/
├── tests/
│   ├── unit/
│   ├── contracts/
│   ├── e2e/
│   └── benchmarks/
├── scripts/
├── docs/
└── package.json
```

Recommended baseline: TypeScript with strict mode, a minimal UI framework or plain Preact, schema validation at every storage/message boundary, Vitest for pure packages, Playwright for browser tests, and a build system that creates a deterministic unpacked-extension directory. Avoid large general-purpose dependencies in the content bundle.

## 16. Delivery plan

### Phase 0 — Corpus and executable specifications

**Purpose:** Define correctness before building UI.

- Finalize profile schema and sensitive-answer policy.
- Create 50–100 representative field descriptors and adversarial cases.
- Create basic generic, Greenhouse, Lever, and Ashby fixtures.
- Implement benchmark harness and expected mappings.

**Exit:** Schema validates a complete personal profile; expected mappings and performance harness run in CI.

### Phase 1 — Deterministic extension skeleton

- MV3 manifest, service worker, content bootstrap, side panel, and options page.
- Profile CRUD, validation, import/export, and document metadata.
- Generic scanner, descriptor protocol, deterministic matcher, preview plan.
- Standard control executor, verification, and undo.

**Exit:** On controlled accessible HTML fixtures, preview and fill standard fields locally with no network use.

### Phase 2 — First high-quality ATS adapters

- Greenhouse, Lever, and Ashby adapters.
- Repeated employment/education support.
- Dynamic field rescanning.
- Resume file reconstruction and upload fallback.
- Adapter contract fixtures.

**Exit:** Meet accuracy and performance targets for these adapters’ fixture suites and manual sandbox checks.

### Phase 3 — Personal learning

- Exact question answer memory.
- Site-specific mappings and option dictionaries.
- Correction review UI and override manager.
- Redacted diagnostic export.

**Exit:** An approved correction persists, is explainable, and is safely reused at its selected scope.

### Phase 4 — Workday

- Dedicated application-root/step detection.
- Repeater creation and custom widget strategies.
- Frame and rerender robustness.
- Expanded dependency planning and verification.

**Exit:** High-confidence common fields, work history, education, and documents work across the captured Workday fixture matrix without silent errors.

### Phase 5 — Optional local semantic companion

- Native host installer and protocol.
- Embedding-based unknown-label ranking.
- Optional open-ended draft generation.
- Cancellation, deadlines, model status, and no-network verification.

**Exit:** Deterministic behavior is unchanged when the companion is absent; semantic suggestions improve the held-out corpus without crossing auto-fill policy boundaries.

### Phase 6 — Harden and expand

- SmartRecruiters/iCIMS based on actual usage.
- Permission minimization review.
- Long-session memory/CPU profiling.
- Schema backup/restore drills.
- Accessibility and keyboard workflow.

## 17. Major risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| ATS DOM changes | Adapter breaks | Versioned adapters, generic fallback, local diagnostics, fixture updates |
| React/framework ignores programmatic values | Value appears then resets | Native setter bridge, correct events, readback verification, adapter strategy |
| Custom select ambiguity | Wrong option | Exact option normalization, strict threshold, manual review |
| Broad site permission | Sensitive page exposure | Optional permissions, denylist, tiny detector, local auditability |
| LLM hallucination | False application claim | Keep model out of factual path; suggestions only; cite selected profile facts |
| Service-worker suspension | Lost transient state | Durable stores plus content-owned live state; idempotent messages |
| Multi-frame form | Missing fields | Frame-aware scanning and top-level plan aggregation |
| File input restrictions | Resume upload fails | Imported document bytes, verified `File` strategy, clear manual fallback |
| Over-learning from edits | Bad future fills | Explicit correction confirmation and narrow default scope |
| Scope expansion | Slow, brittle project | Prioritize actual ATS frequency and benchmark gates |
| Local model consumes resources | Browser slowdown | Optional process, small model, lazy prewarm, deadline/cancellation |

## 18. Decisions to lock before implementation

The following defaults are recommended and can be changed without redesigning the system:

1. **Chrome minimum:** Chrome 116+, allowing a mature MV3 side-panel workflow.
2. **Site access:** required HTTP(S) host permission for this one local installation, with on-demand injection, a denylist, and pause controls.
3. **Initial platforms:** Greenhouse, Lever, Ashby, generic HTML; Workday as the next dedicated phase.
4. **Autofill trigger:** user action, not silent automatic filling.
5. **Overwrite behavior:** never overwrite non-empty values by default.
6. **Submission:** permanently manual.
7. **AI:** not required for the MVP; local-only companion later.
8. **Sensitive questions:** exact user configuration plus per-category permission; otherwise block.
9. **Documents:** explicitly imported into extension storage, not read from arbitrary disk paths.
10. **Learning:** explicit confirmation, narrow scope by default.

## 19. Definition of done for version 1

Version 1 is done when:

- It installs as an unpacked MV3 extension with a documented one-command build.
- A profile and multiple resumes can be created, validated, exported, imported, and deleted locally.
- Generic, Greenhouse, Lever, and Ashby fixtures meet the accuracy targets.
- Standard fields, repeated work/education records, conditional controls, and supported resume uploads can be planned, filled, verified, and undone.
- It never initiates a network request during automated tests; ordinary requests made by the fixture page are separated from extension-originated traffic.
- It never auto-submits or auto-answers blocked categories.
- It meets the p95 scan/plan/fill performance budgets on the target laptop.
- Corrections can be saved and reused safely.
- Diagnostics are useful while redacting values by default.
- The README explains install, update, backup, recovery, permissions, and known limitations.

## 20. Implementation prompt

The following prompt can be given to a coding agent once implementation is authorized:

---

You are the lead engineer implementing **LocalApply**, a local-only Chrome extension for accurately and quickly autofilling job applications on one user’s laptop. Read `docs/LOCAL_JOB_AUTOFILL_DESIGN.md` in full before changing files. Treat it as the product and architecture specification.

### Mission

Build an independent implementation of job-application autofill behavior. Do not copy, inspect, de-obfuscate, call, or depend on Simplify’s proprietary extension, APIs, assets, branding, or source code. The implementation must work without an account, cloud service, remote telemetry, or network requests.

Optimize in this order:

1. Correctness and refusal to guess.
2. End-to-end latency for deterministic fields.
3. Verification, explainability, and undo.
4. Privacy and minimal permissions.
5. ATS coverage.
6. UI polish.

### Required architecture

- Use a strict TypeScript monorepo and Chrome Manifest V3.
- Separate lightweight detection, content orchestration, side panel, options page, service worker, pure matching/planning packages, storage, and ATS adapters.
- Keep live DOM access in content scripts. Convert controls to typed serializable descriptors before matching.
- Treat the MV3 service worker as ephemeral; do not rely on durable in-memory state there.
- Make scanner, matcher, policy, and planner pure/testable where possible.
- Build a dry-run `FillPlan`; never modify the page during scanning or planning.
- Require user action to execute a plan.
- Verify every field after setting it and keep a reversible transaction.
- Never click final submission controls.
- Do not add a generative or embedding model until the deterministic MVP meets its tests and benchmarks.

### First implementation milestone

Implement Phase 0 and Phase 1 only:

1. Scaffold the monorepo and deterministic build.
2. Add the MV3 extension skeleton, content bootstrap, side panel, options page, and event-driven service worker.
3. Implement the versioned applicant profile schema, validation, local storage repository, and import/export.
4. Implement the `FieldDescriptor`, accessible label extraction, generic application-root scan, and stable field IDs.
5. Implement canonical semantic types for identity, contact, address, links, employment, education, work authorization, and documents.
6. Implement ranked deterministic matching with evidence, calibrated confidence categories, and sensitive-field classification.
7. Implement policy filtering and dependency-aware dry-run planning.
8. Display the plan in the side panel as Ready, Review, Missing, and Blocked with explanations.
9. Implement standard input, textarea, select, radio, checkbox, and date execution strategies.
10. Implement readback verification and undo of the most recent fill transaction.
11. Create sanitized fixtures, unit/contract/E2E tests, and performance benchmarks.
12. Prove with an automated guard that the extension initiates no network requests.

### Engineering rules

- Start by writing types, invariants, fixture expectations, and failing tests.
- Prefer explicit discriminated unions and schema validation over `any` or unchecked casts.
- Validate every storage record and message at runtime.
- Use one typed message protocol with version and request IDs.
- Never serialize DOM nodes.
- Never log actual profile values or existing form values by default.
- Never overwrite a non-empty field by default.
- Never infer protected, legal, authorization, salary, signature, or attestation answers.
- Treat `unknown`, `not applicable`, `prefer not to answer`, `false`, and empty as distinct states.
- Preserve date precision; never invent a day.
- Do not use fixed sleeps when a DOM condition can be awaited.
- Bound observers, retries, caches, message sizes, and timeouts.
- Do not add a dependency when a small, well-tested local utility is clearer.
- Keep the initial detector and content bundle small; report bundle sizes.
- Use comments for non-obvious invariants, not for restating code.
- Do not weaken a test or confidence threshold to make an implementation pass without documenting why the expectation was wrong.

### Required tests before claiming the milestone complete

- Unit tests for normalization, label extraction, scoring, option matching, date precision, profile validation, policy, and dependency planning.
- Contract fixtures for hidden/honeypot fields, repeated labels in different sections, radio groups, checkboxes, native selects, dynamic conditional fields, and adversarial semantic pairs.
- Playwright tests using an unpacked extension for profile setup, scan, preview, fill, verification, undo, permission denial, dynamic rerender, and service-worker restart.
- Determinism test: identical profile + descriptors produces byte-equivalent plan JSON except IDs/timestamps explicitly normalized by the test.
- Privacy test: fail on any extension-initiated `http`, `https`, WebSocket, beacon, or external-resource request; do not confuse the host page’s own traffic with extension traffic.
- Performance results for a 150-field fixture, including p50 and p95 scan, planning, and execution times.

### Workflow and handoff

- Inspect the repository and existing changes before editing.
- Maintain a short implementation plan and update it as work completes.
- Implement in small vertical slices that remain testable.
- After each slice, run the narrow tests; before handoff, run the complete test and benchmark suite.
- Report files changed, architectural decisions, test results, benchmark results, known gaps, and the exact next milestone.
- Do not claim success if any required behavior is mocked, unverified, or dependent on a remote service.

Begin with repository inspection, the profile/field domain model, fixture expectations, and a concrete Phase 0/1 plan. Do not begin Workday or local-AI work in this milestone.

---

## 21. Public references

- [Simplify: Installing and setting up Copilot](https://help.simplify.jobs/en/help/articles/1749022-installing-and-setting-up-copilot) — public description of profile-driven autofill and representative ATS platforms.
- [Simplify: Using Copilot to autofill applications](https://help.simplify.jobs/en/articles/3296996-using-copilot-to-autofill-applications) — public description of document handling, reusable answers, and manual submission/review.
- [Simplify: Manage autofill settings](https://help.simplify.jobs/en/articles/8686025-manage-autofill-settings-in-the-simplify-extension) — public examples of field-category controls and multi-page behavior.
- [Chrome Extensions: Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) — MV3 service-worker and packaged-code constraints.
- [Chrome Extensions: Content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts) — injection and isolated-world behavior.
- [Chrome Extensions: Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) — extension storage behavior and access controls.
- [Chrome Extensions: Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) — persistent adjacent extension interface.
- [Chrome Extensions: Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) — optional local companion transport.
