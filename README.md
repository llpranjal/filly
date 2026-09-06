# LocalApply

A Chrome extension that fills job applications from a profile stored in your
browser. You review a field-by-field preview, fill selected values, and can undo
the most recent fill. Applications are submitted manually.

## Install locally

Requires Node.js 22+ and Chrome 116+.

```bash
npm ci
npm run build
```

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select `dist`.
3. Open the extension options, import a PDF, DOCX, or TXT resume, and review the
   extracted profile before saving.

After source edits, rebuild and reload the extension in Chrome.

## Use

Open an application and click the extension icon or press `Alt+Shift+A`
(`Control+Shift+A` on macOS). Review the Ready, Review, Blocked, and Missing
fields in the side panel, then choose **Fill ready fields**. Non-empty values
are preserved by default. **Teach** saves an explicit mapping for a site.

Authorization, compensation, and demographic fields are disabled by default.
Legal attestations, signatures, CAPTCHAs, navigation, and submission remain
manual.

## How it works

A service worker injects the scanner on demand. Each accessible frame returns
field descriptions; the planner matches them to profile values and saved
answers. Approved steps return to their frame for filling, readback checks,
and undo. Adapters cover generic HTML, Greenhouse, Lever, Ashby, and Workday.

Profile and settings use `chrome.storage.local`; resume files use IndexedDB.
PDF.js and Mammoth parse uploaded bytes locally. JSON exports include profile
and document metadata but exclude resume bytes.

## Permissions and limits

The extension requests `activeTab`, `scripting`, `storage`, `sidePanel`, and
HTTP(S) host access. It injects scripts when invoked and has no backend or
analytics. **Delete all local data** clears stored profiles and resumes.

Resume parsing depends on layout and does not OCR scanned PDFs. Closed shadow
roots, restricted frames, unsupported widgets, and some file-upload controls
require manual input. Repeated experience sections must already exist on the
page. Adapters are tested against fixtures, not every live employer form.
Local storage has no separate encryption beyond the operating-system account.

## Checks

```bash
npm run typecheck
npm test
npm run test:privacy
npm run test:e2e
```

`npm run check` runs the full suite and build. The browser tests need Playwright's
Chromium installation. A physical toolbar click or shortcut in regular Chrome
remains a manual check.

The detailed matching rules and constraints are in
[the design document](docs/LOCAL_JOB_AUTOFILL_DESIGN.md).
