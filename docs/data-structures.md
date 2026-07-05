# Data Structures

All data shapes used internally by LeetUp.

---

## PushPayload

The central data object built by `scrapeSubmission()` in `content.js` and carried through the entire pipeline to `pushSubmission()` in `background.js`.

```js
{
  problemNumber:  string,   // Zero-padded 4-digit string, e.g. "0001"
  problemSlug:    string,   // Kebab-case URL slug, e.g. "two-sum"
  problemTitle:   string,   // Display title, e.g. "Two Sum" (may be "")
  topicSlug:      string,   // Primary topic tag slug, e.g. "array"
  language:       string,   // Raw language label from LeetCode, e.g. "Python3"
  fileExtension:  string,   // Derived extension with dot, e.g. ".py"
  domain:         string,   // "dsa" | "sql-databases" | "future-explorations"
  code:           string,   // Full solution code text from the editor
  description:    string,   // Problem statement text (may be "")
  notes:          string,   // User-typed notes from the modal (added at send time)
}
```

The `notes` field is not present in the object returned by `scrapeSubmission()`. It is added by the modal submit handler immediately before calling `chrome.runtime.sendMessage`.

---

## Chrome Message

The message sent from `content.js` to `background.js`.

```js
{
  type:    "PUSH_SUBMISSION",
  payload: PushPayload
}
```

The background service worker only handles messages of type `"PUSH_SUBMISSION"`. All other message types are ignored.

---

## Push Response

The response sent back from `background.js` to `content.js` via `sendResponse`.

```js
// Success
{ ok: true }

// Failure
{ ok: false, error: string }
```

The `error` string is always PAT-sanitized before being returned. It is displayed directly in the modal's `#lgs-status` element.

---

## Credentials (chrome.storage.local)

The three fields written and read by `popup.js` and `background.js`.

```js
{
  pat:      string,   // GitHub Fine-Grained Personal Access Token
  username: string,   // GitHub username
  repo:     string,   // Target repository name (not full URL, just the name)
}
```

All three are stored under `chrome.storage.local`. `chrome.storage.sync` is never used.

---

## GitHub Contents API — PUT Request Body

The body object passed to `putFile()`.

```js
{
  message:  string,   // Commit message: "Add solution for {number}. {title}"
  content:  string,   // Base64-encoded file content (UTF-8 safe)
  sha?:     string,   // SHA of existing file — required for updates, omitted for creates
}
```

---

## GitHub Contents API — GET Response (file exists)

The JSON response from a successful `getFileSha()` call.

```js
{
  sha: string,   // The blob SHA of the current file, passed back in subsequent PUT
  // ...other GitHub API fields not used by LeetUp
}
```

---

## Repository Path Structure

Files are written at this path inside the target GitHub repository:

```
{domain}/{topicSlug}/{paddedNumber}-{problemSlug}/solution{fileExtension}
{domain}/{topicSlug}/{paddedNumber}-{problemSlug}/README.md
```

Examples:

```
dsa/array/0001-two-sum/solution.js
dsa/array/0001-two-sum/README.md

sql-databases/database/0175-combine-two-tables/solution.sql
sql-databases/database/0175-combine-two-tables/README.md

future-explorations/shell/0195-tenth-line/solution.sh
future-explorations/shell/0195-tenth-line/README.md
```

---

## Generated README Structure

The `README.md` generated per problem by `generateReadme()`.

**With notes:**
```markdown
# 0001. Two Sum

## 💡 My Approach
Use a hash map to store complements. Single pass O(n).

---

Given an array of integers nums and an integer target, return indices of the two numbers...
```

**Without notes:**
```markdown
# 0001. Two Sum

Given an array of integers nums and an integer target, return indices of the two numbers...
```

**When description is unavailable:**
```markdown
# 0001. Two Sum

_Official problem description unavailable._
```
