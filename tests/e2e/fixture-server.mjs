import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = await readFile(path.resolve("tests/fixtures/generic.html"));
const performanceFixture = Buffer.from(`<!doctype html><html><head><title>Performance application</title></head><body><form id="application">${Array.from(
  { length: 150 },
  (_, index) => `<label>Email address ${index + 1}<input name="email_${index}" autocomplete="email"></label>`
).join("")}<button type="submit">Submit</button></form></body></html>`);
const framedFixture = Buffer.from(`<!doctype html><html><head><title>Framed application</title></head><body>
  <form><label>First name<input name="first" autocomplete="given-name"></label></form>
  <iframe title="Application details" src="/frame"></iframe></body></html>`);
const childFixture = Buffer.from(`<!doctype html><html><body><form><label>Email<input name="email" autocomplete="email"></label></form></body></html>`);
const teachFixture = Buffer.from(`<!doctype html><html><head><title>Teach application</title></head><body><form>
  <label>What should we call you?<input name="display_identity"></label></form></body></html>`);
const dynamicFixture = Buffer.from(`<!doctype html><html><head><title>Dynamic application</title></head><body><form>
  <label>Country<select name="country" autocomplete="country"><option value="">Choose</option><option value="US">United States</option></select></label>
  <div id="region-wrap" hidden><label>State<input name="region" autocomplete="address-level1"></label></div>
  </form><script>document.querySelector('[name=country]').addEventListener('change',function(){document.querySelector('#region-wrap').hidden=false})</script></body></html>`);
const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  const body = request.url === "/performance" ? performanceFixture
    : request.url === "/framed" ? framedFixture
    : request.url === "/frame" ? childFixture
    : request.url === "/teach" ? teachFixture
    : request.url === "/dynamic" ? dynamicFixture
    : fixture;
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": request.url === "/dynamic" ? "default-src 'self'; script-src 'unsafe-inline'; object-src 'none'" : "default-src 'self'; script-src 'none'; object-src 'none'"
  });
  response.end(body);
});

server.listen(4173, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
