export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\(required\)|\brequired\b|\*/g, " ")
    .replace(/[_/]+/g, " ")
    .replace(/[^\p{L}\p{N}+#.'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeOption(value: string): string {
  const normalized = normalizeText(value);
  const aliases: Record<string, string> = {
    "united states of america": "united states",
    usa: "united states",
    us: "united states",
    yes: "true",
    y: "true",
    no: "false",
    n: "false"
  };
  return aliases[normalized] ?? normalized;
}

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeDateForInput(value: string, inputType?: string): string | undefined {
  if (!/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(value)) return undefined;
  if (inputType === "month") return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : undefined;
  if (inputType === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  return value;
}

export function summarizeValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  if (value.includes("@")) {
    const [name = "", domain = ""] = value.split("@");
    return `${name.slice(0, 2)}•••@${domain}`;
  }
  return value.length > 48 ? `${value.slice(0, 45)}…` : value;
}
