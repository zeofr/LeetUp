# Security Model

## Credential Storage

LeetUp stores exactly three values: `pat`, `username`, and `repo`.

| Property | Detail |
|---|---|
| **Storage API** | `chrome.storage.local` only |
| **Never used** | `chrome.storage.sync` (would upload to Google servers) |
| **Scope** | Local to the user's Chrome profile on this device |
| **Access** | Only the extension's own scripts can read these values |

The PAT is a GitHub Fine-Grained Personal Access Token. It never leaves the user's machine except in the `Authorization` header of HTTPS requests to `api.github.com`.

---

## PAT Transmission

| Channel | PAT present? |
|---|---|
| `Authorization: Bearer {pat}` header | ✅ Yes — required |
| Request URL | ❌ Never |
| Request body (JSON) | ❌ Never |
| `chrome.runtime.sendMessage` payload | ❌ Never |
| Error messages shown in UI | ❌ Never (redacted) |

The PAT is read from `chrome.storage.local` in the background service worker immediately before each push and discarded after use. It is never stored in a JS variable that persists across service worker activations.

---

## Error Message Sanitization

The `sanitizeError(errorStr, pat)` function is called on every error string before it is:
- Returned to the content script in a `{ ok: false, error }` response
- Included in a `{ error }` result from `getFileSha` or `putFile`

The function uses `split(pat).join('[REDACTED]')` which:
- Handles all occurrences of the literal PAT string
- Avoids regex special-character escaping issues (PATs can contain characters like `_` and `/`)
- Replaces each occurrence with the string `[REDACTED]`

---

## Content Security Policy

The extension does not inject any inline scripts. All JavaScript runs from source files declared in `manifest.json`. No `eval`, `innerHTML` assignment with untrusted data, or dynamic script creation is used.

The modal is injected via DOM API calls (`document.createElement`, `appendChild`) rather than `innerHTML`, which avoids XSS vectors.

---

## Host Permissions

The extension requests the minimum required host permissions:

| Permission | Why |
|---|---|
| `https://leetcode.com/*` | Content script needs access to read the DOM and detect submissions |
| `https://api.github.com/*` | Background worker needs to call the GitHub Contents API |

No other origins are contacted.

---

## Storage Permissions

`"storage"` permission is required to use `chrome.storage.local`. No other storage APIs are used.

`"activeTab"` permission is declared to support content script access to the active tab without requiring broad host permissions beyond the two listed above.

---

## Threat Model

| Threat | Mitigation |
|---|---|
| PAT leaks via error messages | `sanitizeError` redacts PAT from all error strings before display |
| PAT leaks via network | PAT only ever appears in the `Authorization` header over HTTPS |
| PAT synced to Google | `chrome.storage.local` used exclusively; property tests verify this |
| Duplicate pushes | `isModalOpen` guard prevents multiple modals and multiple sends |
| Broken partial push | Solution is pushed before README; failure at either step returns an error |
| XSS via modal HTML | Modal built with DOM API calls, no `innerHTML` with user data |
