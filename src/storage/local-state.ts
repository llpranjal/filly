import type { LocalState } from "../domain/types";
import { DEFAULT_STATE, validateState } from "../profile/schema";

const STORAGE_KEY = "localapply.state.v1";

function cloneDefault(): LocalState {
  return structuredClone(DEFAULT_STATE);
}

export async function loadState(): Promise<LocalState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (!(STORAGE_KEY in stored)) return cloneDefault();
  const validation = validateState(stored[STORAGE_KEY]);
  if (!validation.value) return cloneDefault();
  return validation.value;
}

export async function saveState(state: LocalState): Promise<void> {
  const validation = validateState(state);
  if (!validation.value) throw new Error(validation.errors.join("\n"));
  await chrome.storage.local.set({ [STORAGE_KEY]: validation.value });
}

export async function saveValidatedState(state: LocalState): Promise<void> {
  const validation = validateState(state);
  if (!validation.success || !validation.value) throw new Error(validation.errors.join("\n"));
  await chrome.storage.local.set({ [STORAGE_KEY]: validation.value });
}

export async function initializeState(): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (!(STORAGE_KEY in stored)) await chrome.storage.local.set({ [STORAGE_KEY]: cloneDefault() });
}

export { STORAGE_KEY };
