import { expect, test, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import path from "node:path";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

let context: BrowserContext;
let extensionId: string;
let worker: Worker;
let testExtensionPath: string;

async function extensionPage(pathname: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pathname}`);
  return page;
}

test.beforeAll(async () => {
  testExtensionPath = await mkdtemp(path.join(tmpdir(), "localapply-e2e-"));
  await cp(path.resolve("dist"), testExtensionPath, { recursive: true });
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${testExtensionPath}`, `--load-extension=${testExtensionPath}`]
  });
  worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
  await rm(testExtensionPath, { recursive: true, force: true });
});

test("registers the production action keyboard shortcut", async () => {
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  const action = commands.find((command) => command.name === "_execute_action");
  expect(action).toBeDefined();
  expect(action?.shortcut).not.toBe("");
});

test("profile setup persists through the real options page", async () => {
  const options = await extensionPage("options.html");
  const remoteRequests: string[] = [];
  options.on("request", (request) => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`Ada Lovelace
ada@example.test | +1 (415) 555-0100
https://www.linkedin.com/in/ada https://github.com/ada

EXPERIENCE
Analytical Engines
Software Engineer | January 2023 - Present
Built reliable analytical systems used by multiple teams.
Difference Labs
Researcher
February 2021 - December 2022

EDUCATION
Example University
BS in Mathematics
September 2017 - May 2021

SKILLS
TypeScript, SQL, React, Distributed Systems`, { x: 54, y: 740, size: 10, font, color: rgb(0, 0, 0), lineHeight: 17 });
  const resumeBytes = Buffer.from(await pdf.save());
  await options.locator("#resume-file").setInputFiles({
    name: "Ada_Lovelace_Resume.pdf",
    mimeType: "application/pdf",
    buffer: resumeBytes
  });
  await expect(options.locator("#save-status")).toContainText("filled automatically", { timeout: 15_000 });
  await expect(options.locator("#first-name")).toHaveValue("Ada");
  await expect(options.locator("#last-name")).toHaveValue("Lovelace");
  await expect(options.locator("#email")).toHaveValue("ada@example.test");
  await expect(options.locator("#phone")).toHaveValue(/415.*555.*0100/);
  await expect(options.locator("#linkedin")).toHaveValue("https://www.linkedin.com/in/ada");
  await expect(options.locator("#employment")).toHaveValue(/Analytical Engines/);
  await expect(options.locator("#education")).toHaveValue(/Example University/);
  await expect(options.locator("#skills")).toHaveValue(/TypeScript.*SQL/);
  expect(remoteRequests).toEqual([]);
  await options.locator("#country").fill("United States");
  await options.locator("#region").fill("CA");
  await options.locator("button[type=submit]").click();
  await expect(options.locator("#save-status")).toContainText("saved locally");
  await expect(options.locator("#resume-list")).toContainText("Ada_Lovelace_Resume.pdf");
  const docx = new JSZip();
  docx.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  docx.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  docx.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
    "Ada Lovelace", "ada@example.test", "+1 (415) 555-0100", "EXPERIENCE", "Analytical Engines",
    "Software Engineer | January 2023 - Present", "EDUCATION", "Example University", "BS in Mathematics",
    "September 2017 - May 2021", "SKILLS", "TypeScript, SQL"
  ].map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}<w:sectPr/></w:body></w:document>`);
  const docxBytes = await docx.generateAsync({ type: "uint8array" });
  await options.locator("#resume-file").setInputFiles({
    name: "Tailored_Resume.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(docxBytes)
  });
  await expect(options.locator("#save-status")).toContainText("Resume imported", { timeout: 15_000 });
  await expect(options.locator("#resume-list")).toContainText("Tailored_Resume.docx");
  await options.reload();
  await expect(options.locator("#email")).toHaveValue("ada@example.test");
  await options.close();
});

test("on-demand scan fills, verifies, preserves sensitive fields, and undoes", async () => {
  const application = await context.newPage();
  await application.goto("http://127.0.0.1:4173/application");
  await expect(application.locator("#application")).toBeVisible();
  expect(await application.evaluate(() => "__localApplyAgentInstalled" in window)).toBe(false);

  // Headless Chromium does not dispatch extension commands. Reproduce the toolbar
  // action's active-tab bookkeeping; injection and product behavior below still use
  // the production side-panel/service-worker/content-script path.
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({ url: "http://127.0.0.1:4173/*" }))[0];
    if (!tab?.id) throw new Error("Fixture tab was not found");
    await chrome.storage.session.set({ "localapply.activeTab": tab.id });
  });

  const panel = await extensionPage("sidepanel.html");
  await expect(panel.locator("#status")).toContainText("application", { timeout: 10_000 });
  await expect(panel.locator("#summary")).toBeVisible();
  await panel.locator("#resume-select").selectOption({ label: "Tailored_Resume.docx" });
  await expect(panel.locator("#status")).toContainText("Resume selected");
  await panel.locator("#fill").click();
  await expect(panel.locator("#status")).toContainText("Fill complete");

  await expect(application.locator("input[name=first_name]")).toHaveValue("Ada");
  await expect(application.locator("input[name=last_name]")).toHaveValue("Lovelace");
  await expect(application.locator("input[name=email]")).toHaveValue("ada@example.test");
  await expect(application.locator("input[name=company_1]")).toHaveValue("Analytical Engines");
  await expect(application.locator("input[name=title_1]")).toHaveValue("Software Engineer");
  await expect(application.locator("input[name=company_2]")).toHaveValue("Difference Labs");
  await expect(application.locator("input[name=skills]")).toHaveValue(/TypeScript.*SQL/);
  expect(await application.locator("input[name=resume]").evaluate((element: HTMLInputElement) => element.files?.[0]?.name)).toBe("Tailored_Resume.docx");
  await expect(application.locator("select[name=authorized]")).toHaveValue("");
  await expect(application.locator("select[name=gender]")).toHaveValue("Prefer not to answer");

  await panel.locator("#undo").click();
  await expect(panel.locator("#status")).toContainText("Changes undone");
  await expect(application.locator("input[name=email]")).toHaveValue("");
  await expect(application.locator("input[name=company_1]")).toHaveValue("");
  await panel.locator("#pause").click();
  await expect(panel.locator("#status")).toContainText("Site paused");
  await expect(panel.locator("#fill")).toBeDisabled();
  await panel.locator("#pause").click();
  await expect(panel.locator("#status")).toContainText("Site resumed");
  await panel.close();
  await application.close();
});

test("Teach This Page saves and applies a narrow explicit mapping", async () => {
  const application = await context.newPage();
  await application.goto("http://127.0.0.1:4173/teach");
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({ url: "http://127.0.0.1:4173/teach" }))[0];
    if (!tab?.id) throw new Error("Teach fixture tab was not found");
    await chrome.storage.session.set({ "localapply.activeTab": tab.id });
  });
  const panel = await extensionPage("sidepanel.html");
  const field = panel.locator(".field", { hasText: "What should we call you?" });
  await expect(field).toContainText("No safe deterministic mapping");
  await field.locator("select").selectOption("person.first_name");
  await field.locator("button", { hasText: "Teach" }).click();
  await expect(panel.locator("#status")).toContainText("Mapping saved");
  await expect(panel.locator(".group", { hasText: /ready/i })).toContainText("What should we call you?");
  await panel.locator("#fill").click();
  await expect(application.locator("input[name=display_identity]")).toHaveValue("Ada");
  await panel.close();
  await application.close();
});

test("rescans newly revealed conditional fields after a verified fill", async () => {
  const application = await context.newPage();
  await application.goto("http://127.0.0.1:4173/dynamic");
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({ url: "http://127.0.0.1:4173/dynamic" }))[0];
    if (!tab?.id) throw new Error("Dynamic fixture tab was not found");
    await chrome.storage.session.set({ "localapply.activeTab": tab.id });
  });
  const panel = await extensionPage("sidepanel.html");
  await expect(panel.locator(".metric").first().locator("strong")).toHaveText("1");
  await panel.locator("#fill").click();
  await expect(application.locator("#region-wrap")).toBeVisible();
  await expect(panel.locator(".group", { hasText: /ready/i })).toContainText("State");
  await panel.locator("#fill").click();
  await expect(application.locator("input[name=region]")).toHaveValue("CA");
  await panel.close();
  await application.close();
});

test("scans and executes accessible same-origin application frames", async () => {
  const application = await context.newPage();
  await application.goto("http://127.0.0.1:4173/framed");
  await expect(application.locator("iframe")).toBeVisible();
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({ url: "http://127.0.0.1:4173/framed" }))[0];
    if (!tab?.id) throw new Error("Framed fixture tab was not found");
    await chrome.storage.session.set({ "localapply.activeTab": tab.id });
  });
  const panel = await extensionPage("sidepanel.html");
  await expect(panel.locator(".metric").first().locator("strong")).toHaveText("2");
  await panel.locator("#fill").click();
  await expect(application.locator("input[name=first]")).toHaveValue("Ada");
  await expect(application.frames()[1]!.locator("input[name=email]")).toHaveValue("ada@example.test");
  await panel.locator("#undo").click();
  await expect(application.frames()[1]!.locator("input[name=email]")).toHaveValue("");
  await panel.close();
  await application.close();
});

test("meets the 150-field Chrome performance budgets", async () => {
  const application = await context.newPage();
  await application.goto("http://127.0.0.1:4173/performance");
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({ url: "http://127.0.0.1:4173/performance" }))[0];
    if (!tab?.id) throw new Error("Performance fixture tab was not found");
    await chrome.storage.session.set({ "localapply.activeTab": tab.id });
  });
  const panel = await extensionPage("sidepanel.html");
  await expect(panel.locator(".metric").first().locator("strong")).toHaveText("150");
  const metrics = await worker.evaluate(async () => {
    const tabId = (await chrome.storage.session.get("localapply.activeTab"))["localapply.activeTab"] as number;
    const session = (await chrome.storage.session.get(`localapply.session.${tabId}`))[`localapply.session.${tabId}`] as {
      plan: { scanDurationMs: number; planDurationMs: number };
    };
    return session.plan;
  });
  expect(metrics.scanDurationMs).toBeLessThan(50);
  expect(metrics.planDurationMs).toBeLessThan(25);
  const started = performance.now();
  await panel.locator("#fill").click();
  await expect(application.locator("input[name=email_149]")).toHaveValue("ada@example.test");
  const fillDurationMs = performance.now() - started;
  console.info(`Chrome 150-field benchmark: scan=${metrics.scanDurationMs.toFixed(2)}ms plan=${metrics.planDurationMs.toFixed(2)}ms fill=${fillDurationMs.toFixed(2)}ms`);
  expect(fillDurationMs).toBeLessThan(500);
  await panel.close();
  await application.close();
});
