# Architecture

## Overview

LeetUp is a Manifest V3 Chrome extension split into three isolated components that communicate via the Chrome Extension messaging API. No external backend is involved — all logic runs inside the browser.

```
┌─────────────────────────────────────────────────────────────┐
│                    LeetCode Tab (Browser)                    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   content.js                         │   │
│  │                                                      │   │
│  │  MutationObserver ──► scrapeSubmission()             │   │
│  │         │                     │                      │   │
│  │   "Accepted" detected    payload built               │   │
│  │         │                     │                      │   │
│  │         └──────────► injectModal(payload)            │   │
│  │                             │                        │   │
│  │                      user adds notes                 │   │
│  │                             │                        │   │
│  │                   chrome.runtime.sendMessage         │   │
│  │                    PUSH_SUBMISSION ──────────────────┼───┼──►
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                                                              │
              ┌───────────────────────────────────────────────┘
              ▼
┌─────────────────────────────┐
│      background.js          │      ┌──────────────────────┐
│    (Service Worker)         │      │  chrome.storage.local│
│                             │◄────►│  { pat, username,    │
│  onMessage(PUSH_SUBMISSION) │      │    repo }            │
│         │                   │      └──────────────────────┘
│   pushSubmission(payload)   │
│         │                   │
│   getFileSha()  ────────────┼──► GET  api.github.com
│   putFile() ────────────────┼──► PUT  api.github.com
│   generateReadme() ─────────┼──► PUT  api.github.com
│                             │
└─────────────────────────────┘

┌─────────────────────────────┐
│        popup.html           │      ┌──────────────────────┐
│        popup.js             │◄────►│  chrome.storage.local│
│                             │      │  read / write        │
│  One-time credential setup  │      └──────────────────────┘
└─────────────────────────────┘
```

---

## Components

### content.js — Content Script

Runs in every `https://leetcode.com/problems/*` page context.

Responsibilities:
- Attach a `MutationObserver` to the submission result panel
- Detect the "Accepted" verdict (exact match after trim)
- Scrape all required problem data from the DOM
- Inject the notes modal overlay
- Forward the payload to the background worker via `chrome.runtime.sendMessage`
- Reconnect the observer on SPA navigation

### background.js — Service Worker

Runs as a persistent-less MV3 background service worker.

Responsibilities:
- Listen for `PUSH_SUBMISSION` messages
- Read stored credentials from `chrome.storage.local`
- Push the solution file to GitHub via the Contents API
- Generate and push the `README.md` to GitHub
- Sanitize all error messages to strip the PAT

### popup.html / popup.js — Configuration Popup

Shown when the user clicks the extension icon.

Responsibilities:
- Pre-populate fields from `chrome.storage.local`
- Validate that all three fields (PAT, username, repo) are non-empty
- Write validated credentials to `chrome.storage.local`

---

## Data Flow

1. User submits a solution on LeetCode.
2. LeetCode updates the DOM — the result panel shows "Accepted".
3. `MutationObserver` callback fires in `content.js`.
4. `scrapeSubmission()` reads the DOM and builds a `PushPayload`.
5. `injectModal(payload)` shows the notes overlay.
6. User optionally types notes and clicks "Push to GitHub".
7. `chrome.runtime.sendMessage({ type: 'PUSH_SUBMISSION', payload })` is called.
8. `background.js` receives the message, reads credentials from storage.
9. `pushSubmission(payload, credentials)` executes:
   - GET solution SHA → PUT solution file
   - Generate README → GET README SHA → PUT README
10. Response (`{ ok: true }` or `{ ok: false, error }`) is sent back.
11. Modal shows success or error message.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| MV3 Service Worker | Required by Chrome for new extensions; no persistent background pages |
| `chrome.storage.local` (not `sync`) | PAT is sensitive; `sync` uploads to Google servers |
| Solution pushed before README | Atomic partial success is better than pushing README for a missing solution |
| `scrapeSubmission` returns null on failure | Prevents silently pushing incomplete data |
| PAT sanitization in all error paths | Prevents credential leakage in user-facing messages |
| `isModalOpen` guard | Prevents duplicate modals when multiple mutations fire simultaneously |
