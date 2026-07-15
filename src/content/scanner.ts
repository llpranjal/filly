import { findApplicationRoot, detectAdapter } from "../adapters/registry";
import { normalizeText, stableHash } from "../core/normalize";
import type { ControlKind, FieldDescriptor, FieldOption, ScanResult } from "../domain/types";

export type FieldHandle = HTMLInputElement[] | [HTMLTextAreaElement] | [HTMLSelectElement] | [HTMLElement];

export interface DetailedScanResult extends ScanResult {
  handles: Map<string, FieldHandle>;
}

function textFromIds(document: Document, ids: string | null): string {
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .trim();
}

export function getAccessibleLabel(element: HTMLElement): string {
  const document = element.ownerDocument;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const explicit = Array.from(element.labels ?? []).map((label) => label.textContent ?? "").join(" ").trim();
    if (explicit) return explicit;
  }
  const labelled = textFromIds(document, element.getAttribute("aria-labelledby"));
  if (labelled) return labelled;
  const aria = element.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  const wrapping = element.closest("label")?.textContent?.trim();
  if (wrapping) return wrapping;
  const parent = element.closest("[role='group'], fieldset, .field, .form-field, [data-field]");
  const prompt = parent?.querySelector("legend, [data-label], .label, label")?.textContent?.trim();
  if (prompt) return prompt;
  return element.getAttribute("placeholder")?.trim() || element.getAttribute("name")?.trim() || element.id;
}

function getSectionText(element: HTMLElement): string {
  const section = element.closest("fieldset, section, [role='group'], [data-section]");
  const own = section?.querySelector(":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > [data-section-title]")?.textContent;
  if (own?.trim()) return own.trim();
  let previous: Element | null = element;
  for (let depth = 0; depth < 5 && previous; depth += 1) {
    let sibling = previous.previousElementSibling;
    while (sibling) {
      if (/^H[1-4]$/.test(sibling.tagName)) return sibling.textContent?.trim() ?? "";
      sibling = sibling.previousElementSibling;
    }
    previous = previous.parentElement;
  }
  return "";
}

function isStructurallyVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  const style = element.getAttribute("style") ?? "";
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return false;
  if (element instanceof HTMLInputElement && element.type === "hidden") return false;
  return true;
}

function controlKind(element: HTMLElement): ControlKind | undefined {
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  if (element.getAttribute("role") === "combobox") return "custom";
  if (!(element instanceof HTMLInputElement)) return undefined;
  if (["submit", "button", "reset", "image", "hidden", "password"].includes(element.type)) return undefined;
  if (element.type === "radio") return "radio";
  if (element.type === "checkbox") return "checkbox";
  if (element.type === "date" || element.type === "month") return "date";
  if (element.type === "file") return "file";
  return "text";
}

function optionList(elements: FieldHandle, kind: ControlKind): FieldOption[] {
  if (kind === "select") {
    const select = elements[0] as HTMLSelectElement;
    return [...select.options].filter((option) => option.value || option.text).map((option) => ({ label: option.text.trim(), value: option.value }));
  }
  if (kind === "radio") {
    return (elements as HTMLInputElement[]).map((input) => ({ label: getAccessibleLabel(input), value: input.value }));
  }
  return [];
}

function hasExistingValue(elements: FieldHandle, kind: ControlKind): boolean {
  const element = elements[0];
  if (kind === "radio") return (elements as HTMLInputElement[]).some((input) => input.checked);
  if (kind === "checkbox") return (element as HTMLInputElement).checked;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value.trim() !== "";
  return element.getAttribute("aria-valuetext") !== null;
}

function collectElements(root: Element): HTMLElement[] {
  const results = [...root.querySelectorAll<HTMLElement>("input, textarea, select, [role='combobox']")];
  const visitShadow = (element: Element): void => {
    if (element.shadowRoot) {
      results.push(...element.shadowRoot.querySelectorAll<HTMLElement>("input, textarea, select, [role='combobox']"));
      for (const child of element.shadowRoot.querySelectorAll("*")) visitShadow(child);
    }
    for (const child of element.children) visitShadow(child);
  };
  visitShadow(root);
  return [...new Set(results)];
}

export function scanDocument(document: Document, location: Location): DetailedScanResult {
  const started = performance.now();
  const adapter = detectAdapter(document, location);
  const root = findApplicationRoot(document, adapter);
  const elements = collectElements(root);
  const fields: FieldDescriptor[] = [];
  const handles = new Map<string, FieldHandle>();
  const consumedRadios = new Set<string>();

  elements.forEach((element, index) => {
    const kind = controlKind(element);
    if (!kind || !isStructurallyVisible(element)) return;
    if ((element as HTMLInputElement).disabled || (element as HTMLInputElement).readOnly) return;
    let group: FieldHandle = [element];
    const name = element.getAttribute("name") ?? undefined;
    if (kind === "radio" && name) {
      if (consumedRadios.has(name)) return;
      const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(name) : name.replace(/["\\]/g, "\\$&");
      group = elements.filter((candidate): candidate is HTMLInputElement => candidate instanceof HTMLInputElement && candidate.type === "radio" && candidate.name === name);
      consumedRadios.add(name);
      void escaped;
    }
    const labelText = getAccessibleLabel(element);
    const sectionText = getSectionText(element);
    const signature = [adapter.id, kind, name ?? "", element.id, normalizeText(labelText), normalizeText(sectionText), String(index)].join("|");
    const options = optionList(group, kind);
    const optionFingerprint = options.map((option) => `${normalizeText(option.label)}=${normalizeText(option.value)}`).join(";");
    const fingerprint = stableHash([kind, name ?? "", normalizeText(labelText), normalizeText(sectionText), optionFingerprint].join("|"));
    const fieldId = `field-${stableHash(signature)}`;
    const descriptor: FieldDescriptor = {
      fieldId,
      control: kind,
      labelText,
      sectionText,
      options,
      required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
      disabled: false,
      readOnly: false,
      visible: true,
      hasValue: hasExistingValue(group, kind),
      fingerprint
    };
    const inputType = element instanceof HTMLInputElement ? element.type : undefined;
    const autocomplete = element.getAttribute("autocomplete") ?? undefined;
    const placeholder = element.getAttribute("placeholder") ?? undefined;
    if (inputType !== undefined) descriptor.inputType = inputType;
    if (name !== undefined) descriptor.name = name;
    if (element.id) descriptor.id = element.id;
    if (autocomplete !== undefined) descriptor.autocomplete = autocomplete;
    if (placeholder !== undefined) descriptor.placeholder = placeholder;
    fields.push(descriptor);
    handles.set(fieldId, group);
  });

  const structural = fields.map((field) => field.fingerprint).join("|");
  return {
    adapter: adapter.id,
    origin: location.origin,
    title: document.title,
    pageFingerprint: stableHash(`${location.origin}|${location.pathname}|${structural}`),
    fields,
    handles,
    scanDurationMs: performance.now() - started
  };
}
