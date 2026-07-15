import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const allowedDocumentationFiles = new Set();
const suspicious = /\b(?:fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|sendBeacon\s*\(|https?:\/\/)/g;
const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (/\.(?:js|html|json|css)$/.test(entry.name) && !allowedDocumentationFiles.has(entry.name)) {
      let source = await readFile(absolute, "utf8");
      source = source
        .replaceAll('"http://*/*"', '"optional-http-host"')
        .replaceAll('"https://*/*"', '"optional-https-host"');
      const matches = source.match(suspicious);
      if (matches) violations.push(`${path.relative(process.cwd(), absolute)}: ${matches.join(", ")}`);
    }
  }
}

await walk(path.join(process.cwd(), "dist"));
if (violations.length) {
  console.error("Extension bundle contains possible network primitives:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("Privacy guard passed: no network primitives or remote URLs in the extension bundle.");
