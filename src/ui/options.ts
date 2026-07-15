import type { ApplicantProfile, LocalState, ResumeMetadata } from "../domain/types";
import { DEFAULT_STATE, validateState } from "../profile/schema";
import { loadState, saveState, saveValidatedState } from "../storage/local-state";
import { clearResumeStore, deleteResume, digestFile, putResume } from "../storage/resume-store";

const form = document.querySelector<HTMLFormElement>("#profile-form")!;
const saveStatus = document.querySelector<HTMLElement>("#save-status")!;
const resumeList = document.querySelector<HTMLElement>("#resume-list")!;
const templateList = document.querySelector<HTMLElement>("#template-list")!;
let state: LocalState;

function input(id: string): HTMLInputElement { return document.querySelector<HTMLInputElement>(`#${id}`)!; }
function textarea(id: string): HTMLTextAreaElement { return document.querySelector<HTMLTextAreaElement>(`#${id}`)!; }
function configuredBoolean(id: string): boolean | undefined {
  const value = input(id).value;
  return value === "" ? undefined : value === "true";
}

function setStatus(message: string, kind: "normal" | "error" | "success" = "normal"): void {
  saveStatus.textContent = message;
  saveStatus.className = kind === "error" ? "error" : kind === "success" ? "success" : "";
}

function setOptional(target: object, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) (target as Record<string, unknown>)[key] = trimmed;
}

function profileFromForm(): ApplicantProfile {
  const identity: ApplicantProfile["identity"] = {
    legalFirstName: input("first-name").value.trim(),
    lastName: input("last-name").value.trim()
  };
  setOptional(identity, "preferredFirstName", input("preferred-name").value);
  setOptional(identity, "middleName", input("middle-name").value);
  const address: ApplicantProfile["contact"]["address"] = {};
  for (const [key, id] of [["line1", "address-line1"], ["line2", "address-line2"], ["city", "city"], ["region", "region"], ["postalCode", "postal-code"], ["country", "country"]]) {
    setOptional(address, key!, input(id!).value);
  }
  const links: ApplicantProfile["links"] = {};
  for (const key of ["linkedin", "github", "portfolio"] as const) setOptional(links, key, input(key).value);
  const profile: ApplicantProfile = {
    schemaVersion: 1,
    identity,
    contact: { email: input("email").value.trim(), phone: input("phone").value.trim(), address },
    links,
    employment: JSON.parse(textarea("employment").value || "[]") as ApplicantProfile["employment"],
    education: JSON.parse(textarea("education").value || "[]") as ApplicantProfile["education"],
    skills: input("skills").value.split(",").map((value) => value.trim()).filter(Boolean),
    authorization: {},
    application: {},
    customAnswers: JSON.parse(textarea("custom-answers").value || "{}") as ApplicantProfile["customAnswers"]
  };
  const usAuthorized = configuredBoolean("us-authorized");
  const requiresSponsorship = configuredBoolean("us-sponsorship");
  if (usAuthorized !== undefined) profile.authorization.usAuthorized = usAuthorized;
  if (requiresSponsorship !== undefined) profile.authorization.requiresSponsorship = requiresSponsorship;
  setOptional(profile.application, "salary", input("salary").value);
  setOptional(profile.application, "startDate", input("start-date").value);
  if (state.profile.defaultResumeId) profile.defaultResumeId = state.profile.defaultResumeId;
  return profile;
}

function populateForm(): void {
  const profile = state.profile;
  input("first-name").value = profile.identity.legalFirstName;
  input("last-name").value = profile.identity.lastName;
  input("preferred-name").value = profile.identity.preferredFirstName ?? "";
  input("middle-name").value = profile.identity.middleName ?? "";
  input("email").value = profile.contact.email;
  input("phone").value = profile.contact.phone;
  input("address-line1").value = profile.contact.address.line1 ?? "";
  input("address-line2").value = profile.contact.address.line2 ?? "";
  input("city").value = profile.contact.address.city ?? "";
  input("region").value = profile.contact.address.region ?? "";
  input("postal-code").value = profile.contact.address.postalCode ?? "";
  input("country").value = profile.contact.address.country ?? "";
  input("linkedin").value = profile.links.linkedin ?? "";
  input("github").value = profile.links.github ?? "";
  input("portfolio").value = profile.links.portfolio ?? "";
  textarea("employment").value = JSON.stringify(profile.employment, null, 2);
  textarea("education").value = JSON.stringify(profile.education, null, 2);
  input("skills").value = profile.skills.join(", ");
  textarea("custom-answers").value = JSON.stringify(profile.customAnswers, null, 2);
  input("us-authorized").value = profile.authorization.usAuthorized === undefined ? "" : String(profile.authorization.usAuthorized);
  input("us-sponsorship").value = profile.authorization.requiresSponsorship === undefined ? "" : String(profile.authorization.requiresSponsorship);
  input("salary").value = profile.application.salary ?? "";
  input("start-date").value = profile.application.startDate?.length === 10 ? profile.application.startDate : "";
  input("overwrite").checked = state.preferences.overwriteNonEmpty;
  input("allow-authorization").checked = state.preferences.allowSensitive.work_authorization === true;
  input("allow-compensation").checked = state.preferences.allowSensitive.compensation === true;
  input("allow-demographic").checked = state.preferences.allowSensitive.demographic === true;
  renderResumes();
  renderTemplates();
}

function renderResumes(): void {
  resumeList.innerHTML = "";
  if (!state.resumes.length) {
    resumeList.innerHTML = '<p class="muted">No resumes imported.</p>';
    return;
  }
  for (const resume of state.resumes) {
    const row = document.createElement("div");
    row.className = "list-item";
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = resume.name;
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = `${resume.filename} · ${(resume.size / 1024).toFixed(0)} KB · ${resume.sha256.slice(0, 10)}…`;
    info.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "actions";
    const select = document.createElement("button");
    select.type = "button";
    select.className = "secondary";
    select.textContent = state.profile.defaultResumeId === resume.id ? "Default" : "Make default";
    select.disabled = state.profile.defaultResumeId === resume.id;
    select.addEventListener("click", () => { state.profile.defaultResumeId = resume.id; void saveState(state).then(renderResumes); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => void removeResume(resume));
    actions.append(select, remove);
    row.append(info, actions);
    resumeList.append(row);
  }
}

function renderTemplates(): void {
  templateList.innerHTML = "";
  if (!state.templates.length) {
    templateList.innerHTML = '<p class="muted">No taught mappings yet.</p>';
    return;
  }
  for (const template of state.templates) {
    const row = document.createElement("div");
    row.className = "list-item";
    const description = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = template.action.kind === "profile" ? template.action.path : template.action.kind === "fixed" ? "Fixed value" : "Always skip";
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = `${template.ats ?? "generic"} · ${template.origin ?? "all sites"} · field ${template.fieldFingerprint}`;
    description.append(title, meta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => void removeTemplate(template.id));
    row.append(description, remove);
    templateList.append(row);
  }
}

async function removeResume(resume: ResumeMetadata): Promise<void> {
  await deleteResume(resume.id);
  state.resumes = state.resumes.filter((item) => item.id !== resume.id);
  if (state.profile.defaultResumeId === resume.id) delete state.profile.defaultResumeId;
  await saveState(state);
  renderResumes();
}

async function removeTemplate(id: string): Promise<void> {
  state.templates = state.templates.filter((template) => template.id !== id);
  await saveState(state);
  renderTemplates();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    state.profile = profileFromForm();
    state.preferences.overwriteNonEmpty = input("overwrite").checked;
    state.preferences.allowSensitive = {
      work_authorization: input("allow-authorization").checked,
      compensation: input("allow-compensation").checked,
      demographic: input("allow-demographic").checked
    };
    void saveValidatedState(state).then(() => setStatus("Profile saved locally.", "success"), (error: unknown) => setStatus(error instanceof Error ? error.message : "Save failed", "error"));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Invalid JSON", "error");
  }
});

input("resume-file").addEventListener("change", () => {
  const file = input("resume-file").files?.[0];
  if (!file) return;
  void (async () => {
    if (file.size > 8 * 1024 * 1024) throw new Error("Resume is larger than the 8 MB local limit");
    setStatus("Importing and parsing the resume locally…");
    const bytes = await file.arrayBuffer();
    const metadata: ResumeMetadata = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ""),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      sha256: await digestFile(file),
      createdAt: Date.now()
    };
    await putResume(metadata, bytes);
    state.resumes = [...state.resumes, metadata];
    state.profile.defaultResumeId ??= metadata.id;
    try {
      const { parseResumeFile } = await import("../resume/extract");
      const { mergeParsedResume } = await import("../resume/parse-text");
      const parsed = await parseResumeFile(file, bytes);
      const merged = mergeParsedResume(state.profile, parsed);
      state.profile = merged.profile;
      await saveState(state);
      populateForm();
      const warning = parsed.warnings.length ? ` ${parsed.warnings.slice(0, 2).join(" ")}` : "";
      setStatus(`Resume imported. ${merged.appliedFields.length} profile sections were filled automatically.${warning}`, "success");
    } catch (parseError) {
      await saveState(state);
      renderResumes();
      setStatus(`Resume stored, but automatic parsing could not finish: ${parseError instanceof Error ? parseError.message : "Unknown parser error"}`, "error");
    }
    input("resume-file").value = "";
  })().catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Resume import failed", "error"));
});

document.querySelector("#export")!.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `localapply-profile-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

input("import-file").addEventListener("change", () => {
  const file = input("import-file").files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    const validation = validateState(JSON.parse(text));
    if (!validation.success || !validation.value) throw new Error(validation.errors.join("\n"));
    state = validation.value;
    return saveState(state);
  }).then(() => {
    populateForm();
    setStatus("Profile JSON imported. Resume files must be imported separately.", "success");
  }).catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Import failed", "error"));
});

document.querySelector("#delete-all")!.addEventListener("click", () => {
  if (!confirm("Delete the LocalApply profile, templates, settings, and imported resumes from this Chrome profile?")) return;
  void Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear(), clearResumeStore()]).then(() => {
    state = structuredClone(DEFAULT_STATE);
    populateForm();
    setStatus("All LocalApply data was deleted.", "success");
  });
});

void loadState().then((loaded) => {
  state = loaded;
  populateForm();
});
