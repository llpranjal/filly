# LocalApply

LocalApply is a local-only Chrome extension for fast, conservative job-application autofill. It stores one applicant profile and imported resumes in the local Chrome profile, scans forms only when invoked, previews every mapping, fills high-confidence values, verifies page state, and can undo the most recent transaction.

It is an independent clean-room project. It is not affiliated with Simplify, does not use Simplify code or APIs, and has no account, backend, analytics, remote configuration, or production network dependency.

## What works

- Manifest V3 extension loaded unpacked in Chrome.
- User-triggered toolbar/keyboard operation with `activeTab`.
- Required HTTP(S) host permission so application pages can always be scanned after installation; scripts are still injected only on demand.
- Local profile editing and validated JSON import/export.
- Fully local PDF, DOCX, and TXT resume parsing for name, email, phone, links, dated employment, education, and skills.
- Imported resume bytes in extension-scoped IndexedDB; parsed values merge only into empty profile fields.
- Generic HTML plus Greenhouse, Lever, Ashby, and Workday detection/root adapters.
- Accessible labels, sections, native controls, radio groups, open shadow roots, and accessible frames.
- Deterministic matching with evidence and calibrated Ready/Review/Blocked/Missing states.
- Multiple employment records assigned in DOM order.
- Exact saved-question answers and narrow site-specific Teach mappings.
- Text, date/month, checkbox, radio, native select, exact ARIA combobox, and file upload execution.
- Readback verification, partial-failure reporting, and per-frame undo.
- Sensitive authorization, compensation, demographic, legal, and signature policy.
- Side-panel preview and settings interface.
- No automatic navigation or submission.

## Install locally

Requirements: Node.js 22+ and Chrome 116+.

```bash
npm install
npm run check
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository’s `dist` directory.
5. Pin LocalApply if desired.
6. Open **Extension options** and choose **Import and parse resume**.
7. Review the locally extracted profile fields, correct anything needed, and save. The first imported resume becomes the default.

After source changes, run `npm run build` and press **Reload** on the extension card. `npm run dev` watches TypeScript bundles, but Chrome still needs the extension reload when the service worker or manifest changes.

## Use

1. Open a job application.
2. Click the LocalApply toolbar icon or press `Alt+Shift+A` (`Control+Shift+A` on macOS).
3. Review Ready, Review, Blocked, and Missing fields in the side panel.
4. Approve any medium-confidence suggestions individually.
5. Use **Teach** for a narrow, explicit site mapping when needed.
6. Click **Fill ready fields**.
7. Review the application yourself and submit manually.

LocalApply preserves non-empty values by default. Work authorization, compensation, and demographic categories are disabled by default. Legal attestations, signatures, CAPTCHAs, navigation, and final submission are never automated.

## Data and permissions

- `activeTab`: temporary access after a toolbar/shortcut gesture.
- `scripting`: on-demand page-agent injection.
- `storage`: profile, policy, templates, and short-lived tab sessions.
- `sidePanel`: adjacent review interface.
- HTTP(S) host access: required because job applications can be hosted on arbitrary employer and ATS origins. No static content script runs on those pages.

Structured data uses `chrome.storage.local`; imported resume bytes use extension-scoped IndexedDB. JSON export includes profile/settings/document metadata but intentionally excludes resume bytes. The **Delete all local data** action clears local/session storage and resume IndexedDB.

Resume parsing is lazy-loaded only in Settings. PDF.js handles text PDFs and Mammoth handles DOCX entirely from uploaded bytes. The extension manifest keeps `connect-src 'none'`, and the browser suite asserts that parsing a real PDF produces no HTTP(S) requests. Scanned image-only PDFs require OCR and currently remain available for upload but cannot populate profile fields automatically.

## Development commands

```bash
npm run typecheck      # strict TypeScript
npm test               # unit, contract, adapter, executor, and performance tests
npm run test:privacy   # build plus no-network primitive/static endpoint guard
npm run test:e2e       # real unpacked Chromium extension workflow
npm run test:perf      # deterministic 150-field planning budget
npm run check          # complete verification suite
npm run build          # deterministic dist/ extension
```

The browser suite verifies options persistence, local resume reconstruction, scan/preview/fill/readback/undo, sensitive-field blocking, embedded frame support, and a 150-field Chrome performance fixture.

## Architecture

The service worker injects a roughly 11 KB page agent only after invocation. Every accessible frame returns serializable field descriptors; raw DOM nodes remain inside that frame. The service worker combines descriptors, loads the validated local profile, produces a dry-run plan, and sends only approved field/value steps back to the owning frame. Each frame writes through native control setters, emits site-compatible events, reads the result back, and retains a bounded undo snapshot.

The matching priority is:

```text
explicit site template
  > exact saved answer
  > ATS/HTML semantic mapping
  > exact label
  > conservative contextual alias
  > skip
```

The authoritative design is [docs/LOCAL_JOB_AUTOFILL_DESIGN.md](docs/LOCAL_JOB_AUTOFILL_DESIGN.md). [DESIGN.md](DESIGN.md) is retained as historical context.

## Known limitations

- ATS adapters are fixture-backed but have not been certified against every live tenant/version. Workday and custom React controls vary substantially.
- Resume parsing is conservative and layout-dependent. Review extracted experience and education before applying; image-only PDFs are not OCRed, and legacy `.doc` must be saved as PDF or DOCX.
- Repeatable sections already present in the DOM are supported; automatically clicking “Add another experience/education” is not yet implemented.
- Closed shadow roots and browser-restricted cross-origin frames cannot be inspected.
- ARIA combobox execution requires an exact visible option. Unsupported widgets are left for manual completion.
- A file upload can be reconstructed locally, but a site may reject programmatic file assignment and require manual selection.
- DevTools-generated keyboard events cannot dispatch Chrome toolbar/extension-command gestures. The suite verifies that the reserved `_execute_action` shortcut is registered and uses the unmodified production manifest for scanning, then reproduces the action’s active-tab bookkeeping for the end-to-end workflow. A physical toolbar click/shortcut remains a final smoke check after loading `dist` in regular Chrome.
- Local-only storage relies on the operating-system account/full-disk encryption; the extension does not add separate at-rest encryption.

These limitations are fail-safe: unsupported or uncertain controls are skipped rather than guessed.
