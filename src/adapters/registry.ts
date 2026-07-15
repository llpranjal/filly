import type { AtsId } from "../domain/types";

export interface AdapterDefinition {
  id: AtsId;
  rootSelectors: string[];
  hostPatterns: RegExp[];
}

const ADAPTERS: AdapterDefinition[] = [
  {
    id: "greenhouse",
    hostPatterns: [/greenhouse\.io$/i, /greenhouse\.com$/i],
    rootSelectors: ["#application_form", "[data-mapped='application']", "form[action*='applications']"]
  },
  {
    id: "lever",
    hostPatterns: [/lever\.co$/i],
    rootSelectors: [".application-form", "form.application", "form"]
  },
  {
    id: "ashby",
    hostPatterns: [/ashbyhq\.com$/i],
    rootSelectors: ["form", "[data-testid*='application']"]
  },
  {
    id: "workday",
    hostPatterns: [/myworkdayjobs\.com$/i, /workday\.com$/i],
    rootSelectors: ["[data-automation-id='jobApplication']", "[data-automation-id='applicationPage']", "form"]
  }
];

export function detectAdapter(document: Document, location: Pick<Location, "hostname">): AdapterDefinition {
  for (const adapter of ADAPTERS) {
    if (adapter.hostPatterns.some((pattern) => pattern.test(location.hostname))) return adapter;
  }
  if (document.querySelector("#application_form")) return ADAPTERS[0]!;
  if (document.querySelector(".application-form")) return ADAPTERS[1]!;
  if (document.querySelector("[data-automation-id='jobApplication']")) return ADAPTERS[3]!;
  return { id: "generic", hostPatterns: [], rootSelectors: ["form", "main", "body"] };
}

export function findApplicationRoot(document: Document, adapter: AdapterDefinition): Element {
  for (const selector of adapter.rootSelectors) {
    const candidates = [...document.querySelectorAll(selector)];
    const best = candidates
      .filter((element) => element.querySelectorAll("input, select, textarea, [role='combobox']").length > 0)
      .sort((a, b) => b.querySelectorAll("input, select, textarea").length - a.querySelectorAll("input, select, textarea").length)[0];
    if (best) return best;
  }
  return document.body ?? document.documentElement;
}
