# File Reference

Complete description of every file in the LeetUp project.

---

## Source Files

### `manifest.json`
The Chrome Extension manifest. Declares the extension name ("LeetUp"), version, permissions, host permissions, content script injection rules, background service worker, and popup action.

Key declarations:
- `manifest_version: 3` — Manifest V3 required by Chrome
- `permissions: ["storage", "activeTab"]` — storage for credentials, activeTab for content script access
- `host_permissions` — `https://leetcode.com/*` and `https://api.github.com/*`
- `content_scripts` — injects `content.js` and `modal.css` on `https://leetcode.com/problems/*` at `document_idle`
- `background.service_worker` — registers `background.js` as the service worker

---

### `content.js`
The content script injected into every LeetCode problem page. This is the largest and most complex source file.

Sections:
1. **`LANG_MAP`** — `Map<string, string>` mapping normalized language labels to file extensions (18 languages)
2. **`getFileExtension(language)`** — case-insensitive lookup with `.txt` fallback
3. **`getDomain(language)`** — classifies language into `dsa`, `sql-databases`, or `future-explorations`
4. **`buildRepoPath(...)`** — constructs `domain/topic/NNNN-slug/` path
5. **`scrapeSubmission()`** — DOM scraper; returns a `PushPayload` or `null`
6. **`injectModal(payload)`** — creates and appends the `#lgs-modal` overlay
7. **`reconnectObserver()`** — disconnects current observer and reattaches on navigation
8. **`startUrlPolling()`** — animation-frame loop detecting SPA URL changes
9. **`attachObserver()`** — creates and starts the `MutationObserver` on the result panel
10. **`module.exports`** — exports all public symbols for Jest testing

---

### `background.js`
The MV3 service worker. Handles GitHub API communication.

Functions:
- **`toBase64(str)`** — UTF-8-safe Base64 encoding using `encodeURIComponent` + `btoa`
- **`generateReadme(payload)`** — builds the `README.md` markdown string
- **`sanitizeError(errorStr, pat)`** — strips PAT from error strings using `split/join`
- **`getFileSha(url, pat)`** — GET request to GitHub Contents API; returns `{ sha }` or `{ error }`
- **`putFile(url, pat, body)`** — PUT request to GitHub Contents API; returns `{ ok }` or `{ ok, error }`
- **`pushSubmission(payload, _credentials)`** — orchestrates the full push sequence
- **`chrome.runtime.onMessage` listener** — registered only in browser context

---

### `popup.html`
The extension popup markup. Contains three labelled input fields (PAT, Username, Repo), a Save button, and a status div. Loads `popup.css` and `popup.js`.

---

### `popup.css`
Styles for the popup. Sets a fixed width (320px), readable typography, input sizing, button styling, and status message colours.

---

### `popup.js`
Logic for the popup page.

Functions:
- **`populateFields(stored)`** — fills input fields from storage values
- **`saveCredentials()`** — validates, writes to `chrome.storage.local`, shows "Saved!" feedback
- `DOMContentLoaded` listener — reads stored credentials and wires the Save button

---

### `modal.css`
Styles for the `#lgs-modal` overlay injected into LeetCode pages.

Key elements styled:
- `#lgs-modal` — full-viewport fixed overlay with `z-index: 999999`
- `.lgs-card` — centred white card with shadow, padding, flex-column layout
- `#lgs-notes` — textarea with monospace font, vertical resize
- `#lgs-submit-btn` — green primary button with disabled state
- `#lgs-close-btn` — icon-style close button
- `#lgs-spinner` — hidden by default, toggled by JS
- `#lgs-status` — status/error message area

---

## Configuration Files

### `package.json`
Node project manifest. Name: `leetup`. Declares three dev dependencies:
- `jest` — test runner
- `jest-environment-jsdom` — browser DOM simulation for tests
- `fast-check` — property-based testing library

Single script: `test` runs `jest --runInBand` (serial execution required because tests share a global `chrome` mock).

### `.gitignore`
Excludes `node_modules/`, `coverage/`, `package-lock.json`, `.env` files, OS metadata files, editor config folders, and build artifacts.

---

## Icon Assets

### `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
Extension icons at three resolutions used in the Chrome toolbar, extensions page, and Chrome Web Store (if published). All three must be present for the manifest to load without warnings.

---

## Test Files

See [Testing Guide](./testing.md) for full details. Summary:

| File | Type | What it tests |
|---|---|---|
| `content.test.js` | Unit | `scrapeSubmission`, `attachObserver`, modal, SPA reconnect |
| `scrapeSubmission.test.js` | Unit | `scrapeSubmission` edge cases |
| `tests/attachObserver.test.js` | Unit | Observer attachment, disconnect, result panel detection |
| `tests/modal.test.js` | Unit | Modal injection, submit flow, dismiss, Escape key |
| `tests/background.test.js` | Unit | `toBase64`, `generateReadme`, `getFileSha`, `putFile`, `pushSubmission` |
| `tests/popup.test.js` | Unit | `populateFields`, `saveCredentials`, validation |
| `tests/manifest.test.js` | Unit | Manifest JSON structure and required fields |
| `tests/integration.test.js` | Integration | End-to-end content → background message flow |
| `tests/content.pbt.test.js` | Property | Properties 1, 6, 7, 8, 9, 10 |
| `tests/background.pbt.test.js` | Property | Properties 11, 12, 13, 14, 15, 16, 17, 18, 19 |
| `tests/popup.pbt.test.js` | Property | Properties 2, 3 |
| `tests/pat-storage-location.pbt.test.js` | Property | Property 19 / security model |

---

## Documentation

### `docs/`
This directory. Contains the full project documentation. Not included in the browser extension — for developer reference only.
