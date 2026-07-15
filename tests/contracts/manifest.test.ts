import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production manifest access", () => {
  it("requests HTTP(S) host access so arbitrary ATS origins can be scanned", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as { host_permissions?: string[]; content_scripts?: unknown[] };
    expect(manifest.host_permissions).toEqual(expect.arrayContaining(["http://*/*", "https://*/*"]));
    expect(manifest.content_scripts).toBeUndefined();
  });
});
