import { expect, test, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import path from "node:path";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

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
  const manifestPath = path.join(testExtensionPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  // Headless Chromium cannot dispatch toolbar/command gestures or approve host
  // prompts. Grant only the local fixture origin in the copied test manifest.
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
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
  await options.locator("#first-name").fill("Ada");
  await options.locator("#last-name").fill("Lovelace");
  await options.locator("#email").fill("ada@example.test");
  await options.locator("#phone").fill("+1 415 555 0100");
  await options.locator("#linkedin").fill("https://www.linkedin.com/in/ada");
  await options.locator("#country").fill("United States");
  await options.locator("#region").fill("CA");
  await options.locator("#employment").fill(JSON.stringify([
    { company: "Analytical Engines", title: "Engineer", startDate: "2023-01" },
    { company: "Difference Labs", title: "Researcher", startDate: "2021-02" }
  ]));
  await options.locator("#education").fill(JSON.stringify([{ school: "Example University", degree: "BS" }]));
  await options.locator("button[type=submit]").click();
  await expect(options.locator("#save-status")).toContainText("saved locally");
  await options.locator("#resume-file").setInputFiles({
    name: "Ada_Lovelace_Resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% local test document\n")
  });
  await expect(options.locator("#resume-list")).toContainText("Ada_Lovelace_Resume.pdf");
  await options.locator("#resume-file").setInputFiles({
    name: "Tailored_Resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% tailored local test document\n")
  });
  await expect(options.locator("#resume-list")).toContainText("Tailored_Resume.pdf");
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
  await panel.locator("#resume-select").selectOption({ label: "Tailored_Resume.pdf" });
  await expect(panel.locator("#status")).toContainText("Resume selected");
  await panel.locator("#fill").click();
  await expect(panel.locator("#status")).toContainText("Fill complete");

  await expect(application.locator("input[name=first_name]")).toHaveValue("Ada");
  await expect(application.locator("input[name=last_name]")).toHaveValue("Lovelace");
  await expect(application.locator("input[name=email]")).toHaveValue("ada@example.test");
  await expect(application.locator("input[name=company_1]")).toHaveValue("Analytical Engines");
  await expect(application.locator("input[name=company_2]")).toHaveValue("Difference Labs");
  expect(await application.locator("input[name=resume]").evaluate((element: HTMLInputElement) => element.files?.[0]?.name)).toBe("Tailored_Resume.pdf");
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
