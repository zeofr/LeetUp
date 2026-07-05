# LeetUp

A Chrome extension that automatically detects when you solve a LeetCode problem and pushes your solution — along with a structured README — to your GitHub repository. Zero copy-paste, zero context switching.

---

## Why This Was Built — STAR

**Situation**
After grinding LeetCode daily, keeping a personal archive of accepted solutions was a manual chore: copy code, open GitHub, navigate to the right folder, paste, write a commit message, repeat. After a few weeks the habit broke and the archive fell behind.

**Task**
Build a frictionless system that captures accepted submissions at the moment they happen, organises them by domain and topic, and pushes them to GitHub automatically — without ever leaving the LeetCode tab.

**Action**
Built a Manifest V3 Chrome extension with three components working together:

- A **content script** that attaches a `MutationObserver` to the submission result panel. The moment the page shows "Accepted", it scrapes the problem number, title, language, topic tag, and code directly from the DOM, then shows a lightweight modal for optional notes.
- A **background service worker** that receives the payload, generates a Markdown README with the problem description and any notes, then pushes both the solution file and the README to GitHub via the Contents API — solution first, README second, aborting cleanly on any error.
- A **popup** for one-time credential setup (GitHub Personal Access Token, username, and target repository), stored securely in `chrome.storage.local`.

**Result**
Every accepted submission is committed to GitHub in a consistent folder structure (`domain/topic/NNNN-problem-slug/`) within seconds. The archive builds itself passively, and 264 automated tests (unit, integration, and property-based) verify every behavioural invariant from scraping accuracy to PAT security.

---

## Features

- Detects "Accepted" verdict automatically via `MutationObserver`
- Scrapes problem number, title, language, topic tag, and your solution code from the page
- Optional notes field in the modal — appear under **💡 My Approach** in the README
- Organises solutions by domain (`dsa`, `sql-databases`, `future-explorations`) and topic tag
- Creates or updates both the solution file and a `README.md` per problem
- Handles SPA navigation — reattaches the observer when you move between problems
- PAT is stored only in `chrome.storage.local` and never appears in URLs, request bodies, or error messages

---

## Folder Structure in Your GitHub Repo

```
dsa/
  array/
    0001-two-sum/
      solution.js
      README.md
  dynamic-programming/
    0070-climbing-stairs/
      solution.py
      README.md
sql-databases/
  database/
    0175-combine-two-tables/
      solution.sql
      README.md
future-explorations/
  shell/
    0195-tenth-line/
      solution.sh
      README.md
```

---

## Installation

LeetUp is loaded as an unpacked extension in Developer Mode — it is not published to the Chrome Web Store.

### Prerequisites

- Google Chrome (or any Chromium-based browser)
- A GitHub account with a repository you want to push solutions to
- A GitHub **Fine-Grained Personal Access Token** with **Contents: Read and Write** permission on that repository

### Steps

1. Clone or download this repository.

```bash
git clone https://github.com/zeofr/LeetUp.git
```

2. Open Chrome and navigate to `chrome://extensions`.

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the `LeetUp` folder.

5. The LeetUp icon appears in your toolbar. Click it to open the configuration popup.

6. Enter your credentials and click **Save**:
   - **PAT** — your GitHub Fine-Grained Personal Access Token
   - **Username** — your GitHub username
   - **Repo** — the target repository name (e.g. `leetcode-solutions`)

---

## Usage

1. Go to any LeetCode problem page (`leetcode.com/problems/...`).
2. Write your solution and submit it.
3. When the verdict shows **Accepted**, the LeetUp modal appears automatically.
4. Optionally add notes about your approach, then click **Push to GitHub**.
5. LeetUp commits your solution and a README to your repository.

The modal can be dismissed at any time with the **✕** button or the **Escape** key.

---

## Development

Install dependencies (dev only — Jest and fast-check for testing):

```bash
npm install
```

Run the full test suite:

```bash
npm test
```

264 tests across 12 suites covering unit, integration, and property-based tests.

---

## What Gets Committed to GitHub (the target repo)

Each accepted submission results in two files under `domain/topic/NNNN-problem-slug/`:

| File | Contents |
|---|---|
| `solution.<ext>` | Your accepted code exactly as it appears in the editor |
| `README.md` | Problem title, optional approach notes, and the problem description |

---

## Security Notes

- Your PAT is stored in `chrome.storage.local` only — never synced via `chrome.storage.sync`.
- The PAT is sent exclusively in the `Authorization: Bearer` header — never in URLs or request bodies.
- If a GitHub API error message contains your PAT, it is automatically redacted before being shown in the UI.

---

## License

MIT
