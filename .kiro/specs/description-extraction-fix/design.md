# Description Extraction Fix — Bugfix Design

## Overview

`scrapeSubmission()` in `content.js` attempts to read the problem description
via five CSS class-name selectors that all fail against the live LeetCode DOM
(hashed/generated class names change between deployments). As a result,
`payload.description` is always `""` at submit time, and `problem_statement.md`
is always written with the 41-byte placeholder
`<!-- Problem description unavailable. -->` instead of the real problem text.

The same page already embeds the complete question data — including the
`content` HTML field — inside the `__NEXT_DATA__` `<script>` tag that Next.js
uses for server-side hydration. The current code reads `questionFrontendId`
from this source for problem-number extraction but never reads `content` from
the same structure.

The fix replaces the unreliable CSS-selector description path with a precise,
null-guarded traversal of the validated `__NEXT_DATA__` JSON object, followed
by an HTML-to-plain-text conversion, an optional DOM-selector fallback, and
the existing placeholder fallback. `payload.description` will then be the
clean, readable problem statement that flows into both `README.md` and
`problem_statement.md`.

All changes are made on branch `fix/description-extraction-fix`.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — all description
  extraction paths fail, so `scrapeSubmission()` returns `description: ""`.
- **Property (P)**: The desired behavior when the bug condition holds — the
  fixed function extracts a non-empty, HTML-free description from `__NEXT_DATA__`
  and stores it in `payload.description`.
- **Preservation**: Existing behaviors that must remain unchanged by the fix:
  the placeholder fallback path, `pendingAttempt` semantics, SHA-fetch-before-PUT
  logic for repeat pushes, and all non-description scraping paths.
- **`__NEXT_DATA__`**: The `<script id="__NEXT_DATA__" type="application/json">`
  element injected by Next.js into every LeetCode problem page. Contains the
  full server-rendered question data.
- **`question.content`**: The HTML string field inside the `__NEXT_DATA__` JSON
  that holds the complete problem description (e.g. `"<p>Given an array...</p>"`).
- **`scrapeSubmission()`**: The function in `content.js` (lines ~180–420) that
  reads the DOM at Submit click time and returns the push payload object.
- **`extractDescriptionFromNextData(script)`**: The new helper function that
  will be added to `content.js` to encapsulate the `__NEXT_DATA__` traversal
  and HTML-to-text conversion.
- **`htmlToPlainText(html)`**: The new helper function that strips HTML tags,
  decodes HTML entities, and produces clean Markdown-compatible plain text.
- **`ENABLE_DIAGNOSTICS`**: Existing boolean constant in `content.js` that gates
  all diagnostic `console.log` calls.

---

## Bug Details

### Bug Condition

The bug fires at Submit click time whenever `scrapeSubmission()` is called on
a live LeetCode problem page. Because LeetCode uses hashed/generated CSS class
names that change between deployments, none of the five selectors currently
used in step 7 of `scrapeSubmission()` match the DOM. Additionally,
`__NEXT_DATA__` is consulted only for `questionFrontendId`, never for the
`content` field.

**Formal Specification:**

```
FUNCTION isBugCondition(page)
  INPUT: page — the LeetCode problem page state at Submit click time
  OUTPUT: boolean

  // The bug fires whenever ALL description extraction paths fail.
  // In the current (unfixed) code this is ALWAYS true because:
  //   (a) none of the five CSS selectors match the live DOM, AND
  //   (b) __NEXT_DATA__ content field is never consulted
  RETURN scrapeDescription_CURRENT(page) = ""
END FUNCTION
```

### Examples

- **Typical problem (e.g. "1. Two Sum")**: `__NEXT_DATA__` contains
  `question.content = "<p>Given an array of integers <code>nums</code>...</p>"`.
  Current code returns `description: ""`. Fixed code returns `description:
  "Given an array of integers nums..."` (plain text).

- **Problem with complex HTML**: `question.content` contains `<ul>`, `<li>`,
  `<strong>`, `<code>`, `<pre>` tags and HTML entities like `&lt;`, `&gt;`,
  `&amp;`. Current code returns `""`. Fixed code strips tags, decodes entities,
  and returns readable plain text with no raw HTML.

- **`content` field absent or null**: `__NEXT_DATA__` is present but the
  `content` field at the traversed path is `null` or missing. Fixed code falls
  back to DOM selectors; if those also fail, returns `""`, and
  `problem_statement.md` receives the placeholder (unchanged behavior).

- **`__NEXT_DATA__` script not in DOM** (e.g. non-Next.js page variant): Fixed
  code skips to DOM-selector fallback; if that also fails, returns `""`.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- 3.1 When `payload.description` is empty after all extraction attempts, the
  system SHALL continue to write `<!-- Problem description unavailable. -->` to
  `problem_statement.md` (fallback path in `background.js:generateProblemStatement`
  is untouched).
- 3.2 The `pendingAttempt` scrape-at-submit-click semantics in `content.js` are
  not modified — no re-scrape on the submission-detail page.
- 3.3 Non-"Accepted" submission results still dismiss `pendingAttempt` without
  opening the modal or pushing to GitHub.
- 3.4 SHA-fetch-before-PUT logic for repeat pushes (in `pushSubmission()`) is
  not modified.
- 3.5 Credential validation and error paths are not modified.
- 3.6 SPA navigation reset and `pendingAttempt` clearing are not modified.
- 3.7 All other fields returned by `scrapeSubmission()` (`problemNumber`,
  `problemSlug`, `problemTitle`, `topicSlug`, `language`, `fileExtension`,
  `domain`, `code`) are produced by exactly the same logic as before.

**Scope:**

All code paths that do NOT involve description extraction are completely
unaffected. This includes: problem-number extraction, code extraction,
language detection, domain classification, path construction, modal rendering,
submit flow, and GitHub push logic.

---

## Hypothesized Root Cause

1. **Stale CSS Selectors**: All five selectors in step 7 of `scrapeSubmission()`
   use hashed or deprecated class names (`question-content__JfgR`, `content__u3I1`,
   etc.) that no longer exist in the current LeetCode DOM. The `data-cy` attribute
   selector (`[data-cy="question-content"]`) may also have been removed. Since
   none match, `descEl` is always `null` and `description` is always `""`.

2. **Untapped `__NEXT_DATA__` Source**: The `__NEXT_DATA__` script already
   contains the full question data including the `content` HTML field. The
   existing code for problem-number extraction (step 4 in `scrapeSubmission()`)
   successfully reads `questionFrontendId` from this source but never reads
   `content`, leaving a reliable source completely unused for descriptions.

3. **No HTML-to-text Conversion**: Even if a selector-based approach were fixed,
   the raw text from `descEl.textContent` may still contain concatenated text
   without proper spacing or formatting. The `__NEXT_DATA__` path returns raw
   HTML (`<p>...</p>`, `<ul>...</ul>`, etc.) that must be converted to clean
   plain text before storage.

4. **No Diagnostics on Extraction Path**: The current code has no diagnostic
   logging for the description extraction step, making it invisible in field
   debugging whether `descEl` was found, which source was used, or what was
   returned.

---

## Correctness Properties

Property 1: Bug Condition — `__NEXT_DATA__` Content Extraction

_For any_ LeetCode problem page where `__NEXT_DATA__` contains a non-empty
`question.content` field at a valid traversal path, the fixed
`scrapeSubmission()` function SHALL return a `description` that is:
- non-empty (length > 0),
- free of raw HTML tags (no `<` or `>` characters from markup),
- free of raw HTML entities (no `&lt;`, `&amp;`, `&#39;`, etc.),
- and contains recognizable text from the problem statement.

**Validates: Requirements 2.1, 2.3, 2.4**

Property 2: Preservation — Non-Description Fields Unchanged

_For any_ LeetCode problem page input, the fixed `scrapeSubmission()` function
SHALL produce the same values for `problemNumber`, `problemSlug`, `problemTitle`,
`topicSlug`, `language`, `fileExtension`, `domain`, and `code` as the original
function, preserving all non-description scraping behavior exactly.

**Validates: Requirements 3.1, 3.2, 3.7**

---

## Fix Implementation

### Changes Required

**File**: `content.js`

**New Helper: `htmlToPlainText(html)`**

Add before `scrapeSubmission()`. Converts raw HTML content to clean,
Markdown-compatible plain text:

```
FUNCTION htmlToPlainText(html)
  INPUT: html — a raw HTML string (e.g. "<p>Given an array...</p>")
  OUTPUT: clean plain-text string

  IF html is null or empty THEN RETURN ""
  END IF

  // Step 1: Replace block-level tags with newlines for readable spacing
  //   <p>, <div>, <br>, <li>, <pre> → append "\n"
  //   <h1>–<h6> → append "\n\n"
  text ← html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/pre>/gi, "\n")

  // Step 2: Strip all remaining HTML tags
  text ← text.replace(/<[^>]+>/g, "")

  // Step 3: Decode HTML entities
  //   Decode via a temporary DOM element (document.createElement("textarea"))
  //   Set textarea.innerHTML = text, read textarea.value
  //   This handles &lt; &gt; &amp; &quot; &#39; and all numeric entities

  // Step 4: Normalize whitespace
  //   Collapse multiple blank lines to at most two
  //   Trim leading/trailing whitespace from each line
  //   Trim overall result

  RETURN cleaned text
END FUNCTION
```

**New Helper: `extractDescriptionFromNextData()`**

Add before `scrapeSubmission()`. Traverses the validated `__NEXT_DATA__` JSON
to find `question.content`:

```
FUNCTION extractDescriptionFromNextData()
  INPUT: (none — reads document.querySelector directly)
  OUTPUT: { html: string, found: boolean }
            html   — raw HTML string if found, "" otherwise
            found  — true if content was successfully extracted

  // Step 1: Locate the __NEXT_DATA__ script element
  script ← document.querySelector('script#__NEXT_DATA__[type="application/json"]')
  IF script is null THEN
    RETURN { html: "", found: false }
  END IF

  // Step 2: Parse the JSON — abort on parse error
  TRY
    data ← JSON.parse(script.textContent)
  CATCH
    RETURN { html: "", found: false }
  END TRY

  // Step 3: Validate top-level structure
  IF typeof data !== "object" OR data === null THEN
    RETURN { html: "", found: false }
  END IF
  IF typeof data.props !== "object" OR data.props === null THEN
    RETURN { html: "", found: false }
  END IF
  IF typeof data.props.pageProps !== "object" OR data.props.pageProps === null THEN
    RETURN { html: "", found: false }
  END IF

  // Step 4: Try known traversal paths to locate the question object
  //   Path A (dehydrated state / React Query cache):
  //     data.props.pageProps.dehydratedState.queries[0].state.data.question
  //   Path B (direct pageProps):
  //     data.props.pageProps.question
  //   Path C (nested data):
  //     data.props.pageProps.data.question

  question ← null

  // Path A
  pathA ← data?.props?.pageProps?.dehydratedState?.queries
  IF Array.isArray(pathA) AND pathA.length > 0 THEN
    FOR EACH query IN pathA DO
      candidate ← query?.state?.data?.question
      IF typeof candidate === "object" AND candidate !== null
         AND typeof candidate.content === "string"
         AND candidate.content.length > 0 THEN
        question ← candidate
        BREAK
      END IF
    END FOR
  END IF

  // Path B
  IF question is null THEN
    candidate ← data?.props?.pageProps?.question
    IF typeof candidate === "object" AND candidate !== null
       AND typeof candidate.content === "string" THEN
      question ← candidate
    END IF
  END IF

  // Path C
  IF question is null THEN
    candidate ← data?.props?.pageProps?.data?.question
    IF typeof candidate === "object" AND candidate !== null
       AND typeof candidate.content === "string" THEN
      question ← candidate
    END IF
  END IF

  // Step 5: Validate the content field
  IF question is null THEN
    RETURN { html: "", found: false }
  END IF

  content ← question.content
  IF typeof content !== "string" OR content.trim().length === 0 THEN
    RETURN { html: "", found: false }
  END IF

  RETURN { html: content, found: true }
END FUNCTION
```

**Modified Section: Step 7 in `scrapeSubmission()`**

Replace the current description extraction block (the `descEl`/CSS-selector
block) with the following fallback chain:

```
FUNCTION extractDescription()
  // --- Primary: __NEXT_DATA__ JSON ---
  nextDataResult ← extractDescriptionFromNextData()
  IF nextDataResult.found THEN
    description ← htmlToPlainText(nextDataResult.html)
    extractionSource ← "__NEXT_DATA__"
    IF description.length > 0 THEN
      GOTO diagnostics
    END IF
  END IF

  // --- Secondary fallback: DOM selectors (updated, broader) ---
  descEl ←
    document.querySelector('[data-track-load="description-content"]') ||
    document.querySelector('[class*="elfjS"]') ||
    document.querySelector('[data-cy="question-content"]') ||
    document.querySelector('[class*="question-content"]') ||
    document.querySelector('[class*="description"]')

  IF descEl is not null THEN
    description ← descEl.textContent.trim()
    extractionSource ← "DOM-selector"
  ELSE
    description ← ""
    extractionSource ← "none"
  END IF

  // --- Diagnostics (gated by ENABLE_DIAGNOSTICS) ---
  diagnostics:
  IF ENABLE_DIAGNOSTICS THEN
    console.log('[LeetUp:DIAG] description extraction source: "' + extractionSource + '"')
    console.log('[LeetUp:DIAG] description extraction success: ' + (description.length > 0))
    console.log('[LeetUp:DIAG] description byte length: ' + new TextEncoder().encode(description).length)
  END IF

  RETURN description
END FUNCTION
```

**Key Implementation Details:**

1. **Exact null/type guards at each traversal step**: Every property access in
   `extractDescriptionFromNextData()` is preceded by an `typeof ... === "object"
   AND ... !== null` check or optional-chaining with a truthiness check before
   reading a child property. No property is accessed on a value that hasn't been
   validated as a non-null object first.

2. **Only `question.content` is read**: `questionFrontendId`, `codeSnippets`,
   `hints`, `solution`, `topicTags`, and all other fields on the `question`
   object are not accessed. The function reads exactly one field: `content`.

3. **HTML-to-text conversion is mandatory before storage**: `htmlToPlainText()`
   is always called on the raw HTML from `__NEXT_DATA__`. Plain text from DOM
   selectors (`textContent`) does not need HTML stripping but may need whitespace
   normalization.

4. **Diagnostics log exactly three values**: extraction source string, success
   boolean, byte length. No preview of description content is logged.

5. **No changes to `background.js`**: `generateProblemStatement()` and
   `generateReadme()` already handle empty vs. non-empty descriptions correctly.
   The fix is entirely in `content.js`.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples
that demonstrate the bug on unfixed code, then verify the fix works correctly
and preserves existing behavior.

All new tests go in `tests/description-extraction.test.js` (new file) and
`tests/description-extraction.pbt.test.js` (new file for property-based tests).
The existing `scrapeSubmission.test.js` and `tests/background.test.js` are
updated to cover the description-flow-through assertions.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating the bug BEFORE implementing the
fix. Confirm that none of the five current CSS selectors match the test DOM and
that `__NEXT_DATA__` content is never read.

**Test Plan**: Build a jsdom environment with a realistic `__NEXT_DATA__` script
containing `question.content` but without any of the five CSS selectors.
Run `scrapeSubmission()` on the unfixed code and assert `description === ""`.

**Test Cases (run on unfixed code)**:

1. **NEXT_DATA present, no CSS selectors**: DOM has valid `__NEXT_DATA__` with
   `question.content = "<p>Given an array...</p>"`, no `[data-cy="question-content"]`
   or other selector elements. Expected: `description === ""` (bug confirmed).

2. **All five selectors absent**: DOM with correct title, code editor, and
   `__NEXT_DATA__`, but none of the five selector targets present. Expected:
   `description === ""` (bug confirmed).

3. **`[data-cy="question-content"]` present**: If this selector still matches,
   the bug does not manifest for that DOM shape. Expected to fail on current live
   LeetCode DOM (selector is stale).

**Expected Counterexamples**:
- `scrapeSubmission().description === ""` even when `__NEXT_DATA__` contains a
  rich `content` field, proving the primary source is never consulted.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (i.e. CSS
selectors are absent and only `__NEXT_DATA__` has the content), the fixed
function returns a non-empty, HTML-free description.

**Pseudocode:**
```
FOR ALL page WHERE isBugCondition_OLD(page) AND __NEXT_DATA__ has content DO
  result ← scrapeSubmission_FIXED(page)
  ASSERT result.description ≠ ""
  ASSERT result.description does not contain "<" from HTML markup
  ASSERT result.description does not contain "&lt;" or "&amp;"
END FOR
```

### Preservation Checking

**Goal**: Verify that non-description fields are unchanged, and that the
placeholder fallback still fires when no source has content.

**Pseudocode:**
```
// Non-description fields are identical
FOR ALL page DO
  original ← scrapeSubmission_ORIGINAL(page) with description stripped
  fixed    ← scrapeSubmission_FIXED(page) with description stripped
  ASSERT original = fixed
END FOR

// Placeholder fallback preserved
FOR ALL page WHERE no description source has content DO
  result ← scrapeSubmission_FIXED(page)
  ASSERT result.description = ""
  ASSERT generateProblemStatement(result.description)
       = "<!-- Problem description unavailable. -->"
END FOR
```

**Testing Approach**: Property-based testing is used for preservation checking
because it generates many random combinations of `__NEXT_DATA__` shape variants,
missing fields, and wrong types, verifying that the traversal never crashes and
always returns a string.

### Unit Tests

**File**: `tests/description-extraction.test.js`

- **`htmlToPlainText`**:
  - Strips `<p>`, `<ul>`, `<li>`, `<code>`, `<strong>`, `<pre>` tags
  - Decodes `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&`, `&quot;` → `"`,
    `&#39;` → `'`
  - Produces non-empty output from typical LeetCode HTML
  - Returns `""` for null/empty input
  - Does not include raw `<` or `>` from markup in output

- **`extractDescriptionFromNextData`**:
  - Returns `found: true` when Path A (`dehydratedState.queries[0].state.data.question.content`) is present and non-empty
  - Returns `found: true` when Path B (`pageProps.question.content`) is present
  - Returns `found: true` when Path C (`pageProps.data.question.content`) is present
  - Returns `found: false` when `__NEXT_DATA__` script is absent from DOM
  - Returns `found: false` when JSON is malformed
  - Returns `found: false` when `content` field is `null`
  - Returns `found: false` when `content` field is `""` (empty)
  - Returns `found: false` when `content` field is not a string (e.g. `42`)
  - Returns `found: false` when `question` object is missing from all paths
  - Does NOT read `codeSnippets`, `hints`, `solution`, or any other field

- **`scrapeSubmission` description integration**:
  - **TC-D1**: Valid HTML `content` in `__NEXT_DATA__` → `description` is extracted
    and converted to plain text (non-empty, no HTML tags, no raw entities)
  - **TC-D2**: `content` field absent/null in `__NEXT_DATA__` → `description` is
    `""` → `generateProblemStatement("")` returns placeholder
  - **TC-D3**: Unrelated JSON fields (`codeSnippets`, `hints`, `solution`) present
    in `__NEXT_DATA__` but `content` absent → `description` is `""` (not
    accidentally populated from other fields)
  - **TC-D4**: Extracted `description` flows into `README.md` body (non-empty
    description appears in `generateReadme()` output in place of the unavailability
    placeholder)
  - **TC-D5**: Extracted `description` flows into `problem_statement.md`
    (`generateProblemStatement(description)` returns the description text, not the
    placeholder, when `description` is non-empty)
  - **TC-D6**: Repeat push for an existing problem — `pushSubmission()` fetches
    current SHA for both `README.md` and `problem_statement.md` before each PUT,
    and both PUTs include the `sha` field in the request body (existing SHA-fetch
    behavior preserved, now with real description content)
  - **TC-D7**: DOM-selector fallback fires when `__NEXT_DATA__` has no `content`
    but `[data-track-load="description-content"]` is present in the DOM

- **Diagnostics**:
  - When `ENABLE_DIAGNOSTICS` is `true` and `__NEXT_DATA__` source is used,
    exactly three `console.log` calls are made for description: source
    `"__NEXT_DATA__"`, success `true`, byte length > 0. No content preview logged.
  - When `ENABLE_DIAGNOSTICS` is `true` and extraction fails, source is `"none"`,
    success is `false`, byte length is `0`.

### Property-Based Tests

**File**: `tests/description-extraction.pbt.test.js`

- **Property 1 — `htmlToPlainText` output never contains HTML markup**: For any
  string input (including strings containing `<tag>` patterns), `htmlToPlainText`
  output never matches `/<[a-zA-Z][^>]*>/`. Uses `fast-check` `fc.string()`.

- **Property 2 — `htmlToPlainText` output never contains raw HTML entities**: For
  any string input, output does not contain `&lt;`, `&gt;`, `&amp;`, `&quot;`,
  or `&#\d+;`. Uses `fc.string()`.

- **Property 3 — `extractDescriptionFromNextData` never throws**: For any
  arbitrary JavaScript object serialized as the `__NEXT_DATA__` content (valid
  JSON, nested objects, missing fields, wrong types), `extractDescriptionFromNextData`
  always returns `{ html: string, found: boolean }` without throwing. Uses
  `fc.jsonValue()`.

- **Property 4 — Preservation: non-description fields unaffected**: For any
  page DOM with a valid `__NEXT_DATA__` of varying shapes, `scrapeSubmission()`
  returns the same `problemNumber`, `problemSlug`, `language`, `domain`, `code`
  values regardless of whether `__NEXT_DATA__` has `content` or not.

### Integration Tests

**File**: `tests/description-extraction.test.js` (integration section) and
updates to `tests/integration.test.js`

- Full push round-trip with non-empty `description` scraped from `__NEXT_DATA__`:
  `pushSubmission` is called with a payload where `description` is a real
  plain-text string; verify `problem_statement.md` PUT body (base64-decoded)
  matches the description, not the placeholder.

- Full push round-trip with empty `description`: `pushSubmission` receives
  `description: ""`; verify `problem_statement.md` PUT body (base64-decoded) is
  `"<!-- Problem description unavailable. -->"`.

- Repeat push (existing problem): `pushSubmission` is called for a problem whose
  `README.md` and `problem_statement.md` already exist (GET returns 200 + SHA);
  verify both PUT requests include the `sha` field, confirming SHA fetch-before-PUT
  behavior is preserved for both files with new description content.
