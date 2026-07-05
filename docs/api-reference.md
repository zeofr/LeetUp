# API Reference

All exported functions across `content.js` and `background.js`, with full signatures, parameters, return values, and behaviour notes.

---

## content.js

### `getFileExtension(language)`

Maps a LeetCode language label to a file extension.

| | |
|---|---|
| **Param** | `language: string` — raw language label from the LeetCode UI (e.g. `"Python3"`) |
| **Returns** | `string` — file extension with leading dot (e.g. `".py"`) |
| **Normalisation** | Input is trimmed and lowercased before lookup |
| **Fallback** | Returns `".txt"` and emits `console.warn` for unrecognised languages |

Supported languages and their extensions:

| Language | Extension |
|---|---|
| Python3, Python | `.py` |
| Java | `.java` |
| JavaScript | `.js` |
| TypeScript | `.ts` |
| C++ | `.cpp` |
| C | `.c` |
| C# | `.cs` |
| Go | `.go` |
| Rust | `.rs` |
| Kotlin | `.kt` |
| Swift | `.swift` |
| Ruby | `.rb` |
| Scala | `.scala` |
| PHP | `.php` |
| MySQL, MS SQL Server, Oracle | `.sql` |
| Bash | `.sh` |

---

### `getDomain(language)`

Classifies a language into a repository top-level domain folder.

| | |
|---|---|
| **Param** | `language: string` — raw language label |
| **Returns** | `"dsa"` \| `"sql-databases"` \| `"future-explorations"` |
| **Normalisation** | Input is trimmed and lowercased |
| **Rules** | MySQL / MS SQL Server / Oracle → `"sql-databases"` · Bash → `"future-explorations"` · everything else → `"dsa"` |

---

### `buildRepoPath(domain, topicSlug, problemNumber, problemSlug)`

Constructs the folder path for a problem in the target GitHub repo.

| | |
|---|---|
| **Params** | `domain: string`, `topicSlug: string`, `problemNumber: string\|number`, `problemSlug: string` |
| **Returns** | `string` — e.g. `"dsa/array/0001-two-sum/"` |
| **Returns** | `null` if any argument is falsy (with `console.error`) |
| **Format** | `{domain}/{topicSlug}/{paddedNumber}-{problemSlug}/` where number is zero-padded to 4 digits |

---

### `scrapeSubmission()`

Scrapes the active LeetCode problem page and returns a structured payload.

| | |
|---|---|
| **Returns** | `PushPayload` object on success, `null` on failure |
| **Logs** | `console.error` with the missing field name when returning null |

Scraped fields:

| Field | Source | Fallback |
|---|---|---|
| `problemNumber` | `document.title` or heading element | `null` (returns null) |
| `problemSlug` | `window.location.pathname` | `null` (returns null) |
| `problemTitle` | Heading element or `document.title` | `""` |
| `topicSlug` | First `a[href*="/tag/"]` link | `null` (returns null) |
| `language` | Editor toolbar button | `""` |
| `fileExtension` | Derived from `language` | `".txt"` |
| `domain` | Derived from `language` | `"dsa"` |
| `code` | Monaco `.view-lines` or CodeMirror fallback | `null` (returns null) |
| `description` | Problem statement container | `""` |

---

### `injectModal(payload)`

Injects the `#lgs-modal` overlay into `document.body`.

| | |
|---|---|
| **Param** | `payload: PushPayload` |
| **Returns** | `void` |
| **Guard** | No-op if `#lgs-modal` already exists (idempotent) |
| **Sets** | `isModalOpen = true` on injection |
| **Clears** | `isModalOpen = false` on dismiss (close button or Escape) |

DOM elements created:

| Element | ID / Class | Purpose |
|---|---|---|
| Overlay div | `#lgs-modal` | Full-viewport backdrop |
| Card div | `.lgs-card` | Centred content container |
| Textarea | `#lgs-notes` | User notes input (maxlength 10000) |
| Submit button | `#lgs-submit-btn` | Triggers the GitHub push |
| Spinner | `#lgs-spinner` | Loading state (hidden by default) |
| Status div | `#lgs-status` | Success / error messages |
| Close button | `#lgs-close-btn` | Dismisses without pushing |

---

### `attachObserver()`

Creates and starts a `MutationObserver` on the submission result panel.

| | |
|---|---|
| **Returns** | `MutationObserver` instance on success, `null` if panel not found |
| **Trigger** | Fires when any text node inside the panel trims to exactly `"Accepted"` |
| **Guard** | Checks `isModalOpen` before calling `scrapeSubmission` / `injectModal` |
| **Observes** | `childList: true, subtree: true, characterData: true` |

---

### `reconnectObserver()`

Disconnects the active observer and reattaches a new one after a tick.

| | |
|---|---|
| **Returns** | `void` |
| **Effect** | Sets `activeObserver = null`, then schedules `attachObserver()` via `setTimeout(..., 0)` |
| **Condition** | Only attaches on `https://leetcode.com/problems/*` URLs |

---

### `startUrlPolling()`

Starts a `requestAnimationFrame` loop that detects SPA URL changes.

| | |
|---|---|
| **Returns** | `void` |
| **Effect** | Calls `reconnectObserver()` whenever `window.location.href` changes |

---

## background.js

### `toBase64(str)`

Encodes a string to Base64 in a UTF-8-safe manner.

| | |
|---|---|
| **Param** | `str: string` — any Unicode string |
| **Returns** | `string` — Base64-encoded output |
| **Method** | `btoa(unescape(encodeURIComponent(str)))` — handles multi-byte characters |

---

### `generateReadme(payload)`

Builds the `README.md` content for a problem folder.

| | |
|---|---|
| **Param** | `payload: { problemNumber, problemTitle, notes, description }` |
| **Returns** | `string` — full Markdown document |

Output structure:

```
# {problemNumber}. {problemTitle}

[if notes non-empty:]
## 💡 My Approach
{notes}

---

{description or placeholder}

[if notes empty:]
{description or placeholder}
```

Placeholder when description is empty: `_Official problem description unavailable._`

---

### `sanitizeError(errorStr, pat)`

Removes all occurrences of the PAT from an error string.

| | |
|---|---|
| **Params** | `errorStr: string`, `pat: string` |
| **Returns** | `string` — error with PAT replaced by `"[REDACTED]"` |
| **Method** | `errorStr.split(pat).join('[REDACTED]')` — avoids regex escaping issues |

---

### `getFileSha(url, pat)`

Checks if a file exists in a GitHub repository and retrieves its SHA.

| | |
|---|---|
| **Params** | `url: string` — full GitHub Contents API URL · `pat: string` |
| **Returns** | `Promise<{ sha: string }>` — file exists |
| **Returns** | `Promise<{ sha: null }>` — file does not exist (HTTP 404) |
| **Returns** | `Promise<{ error: string }>` — any other status or network error (PAT stripped) |
| **Headers** | `Authorization: Bearer {pat}`, `Content-Type: application/json` |

---

### `putFile(url, pat, body)`

Creates or updates a file in a GitHub repository.

| | |
|---|---|
| **Params** | `url: string`, `pat: string`, `body: object` — `{ message, content, sha? }` |
| **Returns** | `Promise<{ ok: true }>` — HTTP 200 or 201 |
| **Returns** | `Promise<{ ok: false, error: string }>` — any other status or network error (PAT stripped) |
| **Headers** | `Authorization: Bearer {pat}`, `Content-Type: application/json` |

---

### `pushSubmission(payload, _credentials?)`

Orchestrates the full two-file push sequence to GitHub.

| | |
|---|---|
| **Params** | `payload: PushPayload`, `_credentials?: { pat, username, repo }` |
| **Returns** | `Promise<{ ok: true }>` — both files pushed successfully |
| **Returns** | `Promise<{ ok: false, error: string }>` — any failure (PAT stripped) |

Sequence:
1. Read credentials from `chrome.storage.local` (or use `_credentials` if provided)
2. Validate all three credential fields are non-empty
3. GET solution file SHA
4. PUT solution file (with SHA if file exists)
5. Generate README content
6. GET README SHA
7. PUT README (with SHA if file exists)

Failure at any step aborts the sequence and returns `{ ok: false, error }`.

---

## popup.js

### `populateFields(stored)`

Fills popup input fields from a storage result object.

| | |
|---|---|
| **Param** | `stored: object` — result from `chrome.storage.local.get` |
| **Effect** | Sets `#pat`, `#username`, `#repo` input values; missing keys default to `""` |

---

### `saveCredentials()`

Reads, validates, and saves the three credential fields.

| | |
|---|---|
| **Returns** | `void` |
| **Validation** | All three trimmed values must be non-empty; shows error in `#status` if not |
| **On success** | Writes `{ pat, username, repo }` to `chrome.storage.local`; changes button label to "Saved!" for 1500ms |
| **On failure** | Shows storage error message in `#status`; preserves field values |
