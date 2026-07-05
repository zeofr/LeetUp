# Installation & Setup

## For Users

### What You Need

- Google Chrome 88+ or any Chromium-based browser (Edge, Brave, Arc)
- A GitHub account
- A GitHub repository to push solutions to (can be empty or pre-existing)
- A GitHub Fine-Grained Personal Access Token with **Contents: Read and Write** on that repository

### Create a GitHub Fine-Grained PAT

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Click **Generate new token**.
3. Set a name (e.g. `LeetUp`), expiration, and select the target repository under **Repository access**.
4. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**.
5. Click **Generate token** and copy the value — you will not see it again.

### Install the Extension

1. Clone or download the LeetUp repository:

```bash
git clone https://github.com/zeofr/LeetUp.git
```

2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the folder you cloned (the one containing `manifest.json`).
6. LeetUp appears in your extensions list and toolbar.

### Configure Credentials

1. Click the LeetUp icon in the Chrome toolbar.
2. Enter:
   - **GitHub PAT** — the token you created above
   - **GitHub Username** — your GitHub username (e.g. `zeofr`)
   - **Repository Name** — just the repo name, not the full URL (e.g. `leetcode-solutions`)
3. Click **Save**. The button briefly shows "Saved!" to confirm.

### Verify It Works

1. Open any LeetCode problem (`leetcode.com/problems/...`).
2. Submit a solution.
3. When the result shows **Accepted**, the LeetUp modal appears.
4. Optionally add notes, then click **Push to GitHub**.
5. Check your GitHub repository — you should see a new commit with the solution file and README.

---

## For Developers

### Prerequisites

- Node.js 18+ and npm

### Clone and Install

```bash
git clone https://github.com/zeofr/LeetUp.git
cd LeetUp
npm install
```

### Run Tests

```bash
npm test
```

Expected output: 12 test suites, 264 tests, all passing.

### Project Structure

```
LeetUp/
├── manifest.json          # Chrome Extension MV3 manifest
├── content.js             # Content script — observer, scraper, modal
├── background.js          # Service worker — GitHub API push
├── popup.html             # Extension popup markup
├── popup.js               # Popup logic
├── popup.css              # Popup styles
├── modal.css              # Modal overlay styles
├── icons/                 # Extension icons (16, 48, 128px)
├── package.json           # Node project config and test script
├── .gitignore             # Files excluded from git
├── README.md              # Project overview
├── docs/                  # Full documentation
├── content.test.js        # Unit tests for content script
├── scrapeSubmission.test.js
└── tests/                 # All other test files
```

### Making Changes

- Source files for the extension: `content.js`, `background.js`, `popup.js`, `popup.html`, `popup.css`, `modal.css`, `manifest.json`
- After editing, reload the extension at `chrome://extensions` by clicking the refresh icon on the LeetUp card
- Run `npm test` to verify nothing is broken before committing

### Updating Icons

Replace the files in `icons/` with your own PNG images at exactly 16×16, 48×48, and 128×128 pixels. The filenames must match what is declared in `manifest.json`.
