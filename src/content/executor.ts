import { normalizeOption } from "../core/normalize";
import type { ExecutionDocument, ExecutionResult, FillStep, FillTransactionResult, PrimitiveValue } from "../domain/types";
import type { FieldHandle } from "./scanner";

interface Snapshot {
  fieldId: string;
  elements: Array<{
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    value: string;
    checked?: boolean;
    selectedIndex?: number;
  }>;
}

declare global {
  interface Window {
    __localApplyLastTransaction?: Snapshot[];
  }
}

function dispatch(element: HTMLElement): void {
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: false }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const view = element.ownerDocument.defaultView;
  const prototype = element instanceof (view?.HTMLTextAreaElement ?? HTMLTextAreaElement)
    ? view?.HTMLTextAreaElement.prototype
    : view?.HTMLInputElement.prototype;
  const setter = prototype ? Object.getOwnPropertyDescriptor(prototype, "value")?.set : undefined;
  if (setter) setter.call(element, value);
  else element.value = value;
}

function snapshot(fieldId: string, handle: FieldHandle): Snapshot {
  const isFormControl = (element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
  return {
    fieldId,
    elements: Array.from(handle as HTMLElement[])
      .filter(isFormControl)
      .map((element) => ({
        element,
        value: element.value,
        ...(element instanceof HTMLInputElement ? { checked: element.checked } : {}),
        ...(element instanceof HTMLSelectElement ? { selectedIndex: element.selectedIndex } : {})
      }))
  };
}

function findOption(options: ArrayLike<HTMLOptionElement>, value: PrimitiveValue): HTMLOptionElement | undefined {
  const wanted = normalizeOption(String(value));
  return Array.from(options).find((option) => normalizeOption(option.value) === wanted || normalizeOption(option.text) === wanted);
}

function writeField(step: FillStep, handle: FieldHandle, documents: Record<string, ExecutionDocument>): void {
  if (step.value === undefined) throw new Error("Fill step has no value");
  const first = handle[0];
  if (!first) throw new Error("Field no longer exists");
  first.focus();

  if (step.control === "radio") {
    const wanted = normalizeOption(String(step.value));
    const radio = (handle as HTMLInputElement[]).find((input) => {
      const label = Array.from(input.labels ?? []).map((item) => item.textContent ?? "").join(" ");
      return normalizeOption(input.value) === wanted || normalizeOption(label) === wanted;
    });
    if (!radio) throw new Error("No exact radio option matches the intended value");
    radio.click();
    dispatch(radio);
    return;
  }

  if (step.control === "checkbox") {
    if (!(first instanceof HTMLInputElement) || typeof step.value !== "boolean") throw new Error("Checkbox requires an explicit boolean");
    if (first.checked !== step.value) first.click();
    dispatch(first);
    return;
  }

  if (step.control === "select") {
    if (!(first instanceof HTMLSelectElement)) throw new Error("Select handle is invalid");
    const option = findOption(first.options, step.value);
    if (!option) throw new Error("No exact select option matches the intended value");
    first.value = option.value;
    dispatch(first);
    return;
  }

  if (step.control === "custom") {
    if (first instanceof HTMLInputElement) {
      setNativeValue(first, String(step.value));
      dispatch(first);
    }
    first.click();
    const wanted = normalizeOption(String(step.value));
    const option = [...first.ownerDocument.querySelectorAll<HTMLElement>("[role='option']")].find((item) =>
      item.getAttribute("aria-hidden") !== "true" && normalizeOption(item.textContent ?? "") === wanted);
    if (option) option.click();
    else if (!(first instanceof HTMLInputElement)) throw new Error("No exact custom-combobox option is visible");
    dispatch(first);
    return;
  }
  if (step.control === "file") {
    if (!(first instanceof HTMLInputElement) || first.type !== "file") throw new Error("File handle is invalid");
    const document = documents[String(step.value)];
    if (!document) throw new Error("The selected resume is unavailable; import it again in Settings");
    const binary = atob(document.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], document.filename, { type: document.mimeType });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    first.files = transfer.files;
    dispatch(first);
    return;
  }
  if (!(first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement)) throw new Error("Text control handle is invalid");
  setNativeValue(first, String(step.value));
  dispatch(first);
}

function verifyField(step: FillStep, handle: FieldHandle): boolean {
  if (step.value === undefined) return false;
  const first = handle[0];
  if (!first) return false;
  const wanted = normalizeOption(String(step.value));
  if (step.control === "radio") {
    return (handle as HTMLInputElement[]).some((input) => input.checked && (
      normalizeOption(input.value) === wanted ||
      Array.from(input.labels ?? []).some((label) => normalizeOption(label.textContent ?? "") === wanted)
    ));
  }
  if (step.control === "checkbox") return first instanceof HTMLInputElement && first.checked === step.value;
  if (step.control === "select") {
    return first instanceof HTMLSelectElement && (
      normalizeOption(first.value) === wanted || normalizeOption(first.selectedOptions[0]?.text ?? "") === wanted
    );
  }
  if (step.control === "file") {
    return first instanceof HTMLInputElement && first.files?.[0]?.name === undefined
      ? false
      : first instanceof HTMLInputElement && first.files?.[0]?.name.length !== 0;
  }
  if (step.control === "custom") {
    if (first instanceof HTMLInputElement) return normalizeOption(first.value) === wanted;
    return normalizeOption(first.getAttribute("aria-valuetext") ?? first.textContent ?? "") === wanted;
  }
  if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) return normalizeOption(first.value) === wanted;
  return false;
}

export async function executePlan(
  steps: FillStep[],
  handles: Map<string, FieldHandle>,
  documents: Record<string, ExecutionDocument> = {}
): Promise<FillTransactionResult> {
  const results: ExecutionResult[] = [];
  const transaction: Snapshot[] = [];
  for (const step of steps) {
    const handle = handles.get(step.fieldId);
    if (!handle) {
      results.push({ fieldId: step.fieldId, status: "failed", message: "Field disappeared after preview" });
      continue;
    }
    transaction.push(snapshot(step.fieldId, handle));
    try {
      writeField(step, handle, documents);
      await Promise.resolve();
      const verified = verifyField(step, handle);
      results.push(verified
        ? { fieldId: step.fieldId, status: "verified" }
        : { fieldId: step.fieldId, status: "failed", message: "Page did not retain the intended value" });
    } catch (error) {
      results.push({ fieldId: step.fieldId, status: "failed", message: error instanceof Error ? error.message : "Unknown execution failure" });
    }
  }
  window.__localApplyLastTransaction = transaction;
  return { transactionId: `transaction-${Date.now().toString(36)}`, results };
}

export function undoLastTransaction(): ExecutionResult[] {
  const results: ExecutionResult[] = [];
  for (const item of [...(window.__localApplyLastTransaction ?? [])].reverse()) {
    try {
      for (const state of item.elements) {
        if (state.element instanceof HTMLInputElement && state.checked !== undefined) state.element.checked = state.checked;
        if (state.element instanceof HTMLSelectElement && state.selectedIndex !== undefined) state.element.selectedIndex = state.selectedIndex;
        if (state.element instanceof HTMLInputElement || state.element instanceof HTMLTextAreaElement) setNativeValue(state.element, state.value);
        else state.element.value = state.value;
        dispatch(state.element);
      }
      results.push({ fieldId: item.fieldId, status: "verified" });
    } catch (error) {
      results.push({ fieldId: item.fieldId, status: "failed", message: error instanceof Error ? error.message : "Undo failed" });
    }
  }
  window.__localApplyLastTransaction = [];
  return results;
}
