# Implementation Plan

## Overview

Implementation tasks for the description-extraction-fix bugfix. The workflow follows the exploratory bug condition methodology: write a failing exploration test first, write preservation tests second, then implement the fix, and finally verify all tests pass.

## Task Dependency Graph

```
1 (exploration test) → 2 (preservation tests) → 3.1 (branch)
                                                  → 3.2 (htmlToPlainText)
                                                  → 3.3 (extractDescriptionFromNextData)
                                                  → 3.4 (replace description block) [depends on 3.2, 3.3]
                                                  → 3.5 (unit + integration tests) [depends on 3.2, 3.3, 3.4]
                                                  → 3.6 (pbt tests) [depends on 3.2, 3.3, 3.4]
                                                  → 3.7 (verify exploration test passes) [depends on 3.4, 3.5]
                                                  → 3.8 (verify preservation tests pass) [depends on 3.4, 3.6]
→ 4 (checkpoint — all tests pass) [depends on 3.5, 3.6, 3.7, 3.8]
```

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Stale CSS Selectors Return Empty Description
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug: `__NEXT_DATA__` has a rich `content` field, but `scrapeSubmission()` still returns `description: ""`
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — DOM with valid `__NEXT_DATA__` (Path A, B, and C shapes) but none of the five stale CSS selectors present
  - Create `tests/description-extraction.test.js` with the Bug Condition exploration section
  - Build a jsdom fixture that injects a `<script id="__NEXT_DATA__" type="application/json">` element containing `question.content = "<p>Given an array of integers <code>nums</code> and an integer <code>target</code>...</p>"` via Path A (`dehydratedState.queries[0].state.data.question`)
  - Do NOT add any of the five stale selector elements (`[data-cy="question-content"]`, `[class*="question-content__JfgR"]`, `.content__u3I1`, `[class*="problem-statement"]`, `[class*="description__"]`) to the DOM
  - Also add `document.title = "1. Two Sum - LeetCode"` and `.view-lines` code lines so `scrapeSubmission()` can return a non-null payload
  - Run `scrapeSubmission()` on the **unfixed** code and assert `result.description === ""`
  - The test assertions match the Expected Behavior (non-empty, HTML-tag-free description) — they will PASS only after the fix
  - Run test on UNFIXED code: `npx jest tests/description-extraction.test.js --runInBand`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves `__NEXT_DATA__` content is never consulted)
  - Document counterexample found (e.g. `scrapeSubmission().description === ""` even when `__NEXT_DATA__` contains `"<p>Given an array...</p>"`)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Description Fields and Fallback Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology — run unfixed code first, observe outputs, then encode as tests
  - Create `tests/description-extraction.pbt.test.js` with Property 2 preservation tests
  - **Observe on UNFIXED code**: For any DOM where `scrapeSubmission()` returns non-null, the fields `problemNumber`, `problemSlug`, `language`, `domain`, `code` are correctly extracted (description is `""` but all other fields are accurate)
  - **Observe on UNFIXED code**: When `description === ""`, `generateProblemStatement("")` returns `"<!-- Problem description unavailable. -->"` (placeholder fallback fires)
  - Write **Property 2: Preservation** — for any DOM with valid `__NEXT_DATA__` of varying shapes (missing `content`, wrong types, null values), `scrapeSubmission()` returns the same `problemNumber`, `problemSlug`, `language`, `domain`, `code` as without `__NEXT_DATA__`; the function never throws
  - Write **Property 2: Preservation** — for any DOM where no description source yields content, `generateProblemStatement("")` always returns `"<!-- Problem description unavailable. -->"` (placeholder preserved)
  - Run property tests on UNFIXED code: `npx jest tests/description-extraction.pbt.test.js --runInBand`
  - **EXPECTED OUTCOME**: All preservation tests PASS on unfixed code (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.7_

- [x] 3. Fix description extraction in content.js

  - [x] 3.1 Create branch `fix/description-extraction-fix`
    - Run `git checkout -b fix/description-extraction-fix` from the repository root
    - All subsequent commits go on this branch
    - _Requirements: 2.1_

  - [x] 3.2 Implement `htmlToPlainText(html)` helper in `content.js`
    - Add the function immediately before `scrapeSubmission()` in `content.js`
    - Step 1 — Replace block-level closing tags with newlines for readable spacing: `</p>` → `\n`, `</div>` → `\n`, `</li>` → `\n`, `</pre>` → `\n`, `<br>` / `<br/>` → `\n`, `</h1>`–`</h6>` → `\n\n`
    - Step 2 — Strip all remaining HTML tags with `/<[^>]+>/g`
    - Step 3 — Decode HTML entities using a temporary `document.createElement("textarea")` — set `.innerHTML`, read `.value`; handles `&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#39;`, and all numeric entities
    - Step 4 — Normalize whitespace: trim each line, collapse runs of 3+ blank lines to 2, trim overall result
    - Return `""` for null/empty/non-string input (guard at top of function)
    - _Bug_Condition: isBugCondition(page) — current code never calls htmlToPlainText because __NEXT_DATA__ content is never read_
    - _Expected_Behavior: htmlToPlainText("<p>Given an array...</p>") === "Given an array..."_
    - _Preservation: htmlToPlainText is a pure helper; it does not affect any existing code paths_
    - _Requirements: 2.1, 2.3, 2.4_

  - [x] 3.3 Implement `extractDescriptionFromNextData()` helper in `content.js`
    - Add the function immediately before `scrapeSubmission()` in `content.js` (after `htmlToPlainText`)
    - Step 1 — Locate `document.querySelector('script#__NEXT_DATA__[type="application/json"]')`; return `{ html: "", found: false }` if absent
    - Step 2 — `JSON.parse(script.textContent)` inside a try/catch; return `{ html: "", found: false }` on parse error
    - Step 3 — Validate that `data`, `data.props`, and `data.props.pageProps` are all non-null objects before accessing children
    - Step 4 — Try three traversal paths in order; for each, check that the candidate is a non-null object and that `candidate.content` is a non-empty string:
      - **Path A**: `data.props.pageProps.dehydratedState.queries` — iterate all entries, look for `query.state.data.question.content`
      - **Path B**: `data.props.pageProps.question.content`
      - **Path C**: `data.props.pageProps.data.question.content`
    - Step 5 — If no path yields a non-empty string, return `{ html: "", found: false }`
    - Only read `question.content` — do NOT access `codeSnippets`, `hints`, `solution`, `topicTags`, `questionFrontendId`, or any other field
    - Return `{ html: content, found: true }` on success
    - _Bug_Condition: isBugCondition(page) — current scrapeSubmission() never calls extractDescriptionFromNextData()_
    - _Expected_Behavior: extractDescriptionFromNextData() returns { html: "<p>...</p>", found: true } when __NEXT_DATA__ has valid content_
    - _Preservation: This is a new helper; does not modify any existing code path until step 3.4 replaces the description block_
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Replace stale CSS-selector description block in `scrapeSubmission()` with fallback chain
    - Locate step 7 in `scrapeSubmission()` — the `let description = ''` block with the five stale selectors (`[data-cy="question-content"]`, `[class*="question-content__JfgR"]`, `.content__u3I1`, `[class*="problem-statement"]`, `[class*="description__"]`)
    - Replace the entire block with the three-tier fallback chain:
      1. **Primary** — call `extractDescriptionFromNextData()`; if `found === true`, call `htmlToPlainText(result.html)` and store in `description`; set `extractionSource = "__NEXT_DATA__"`
      2. **Secondary** — if `description` is still empty, try updated DOM selectors in order: `[data-track-load="description-content"]`, `[class*="elfjS"]`, `[data-cy="question-content"]`, `[class*="question-content"]`, `[class*="description"]`; if any match, use `descEl.textContent.trim()` and set `extractionSource = "DOM-selector"`
      3. **Fallback** — if still empty, `description = ""`; set `extractionSource = "none"`
    - After the chain, add a diagnostics block gated by `ENABLE_DIAGNOSTICS`:
      - `console.log('[LeetUp:DIAG] description extraction source: "' + extractionSource + '"')`
      - `console.log('[LeetUp:DIAG] description extraction success: ' + (description.length > 0))`
      - `console.log('[LeetUp:DIAG] description byte length: ' + new TextEncoder().encode(description).length)`
    - Declare `let extractionSource = "none"` before the chain
    - _Bug_Condition: isBugCondition(page) where ALL five stale selectors fail AND __NEXT_DATA__ content is never read → description === ""_
    - _Expected_Behavior: expectedBehavior — for any page where __NEXT_DATA__ has question.content, scrapeSubmission() returns description that is non-empty, has no raw HTML tags, and has no raw HTML entities_
    - _Preservation: All fields other than description (problemNumber, problemSlug, problemTitle, topicSlug, language, fileExtension, domain, code) produced by exactly the same logic; placeholder fallback in background.js untouched; pendingAttempt semantics, SHA-fetch-before-PUT, credential validation, SPA navigation reset all unmodified_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.5 Create `tests/description-extraction.test.js` unit and integration tests
    - Add `htmlToPlainText` unit tests:
      - Strips `<p>`, `<ul>`, `<li>`, `<code>`, `<strong>`, `<pre>` tags → plain text with no `<` or `>` from markup
      - Decodes `&lt;` → `<`, `&gt;` → `>`, `&amp;` → `&`, `&quot;` → `"`, `&#39;` → `'`
      - Returns non-empty output from a realistic LeetCode HTML string
      - Returns `""` for null input, `""` for empty string input
    - Add `extractDescriptionFromNextData` unit tests:
      - Returns `found: true` from Path A (`dehydratedState.queries[0].state.data.question.content`)
      - Returns `found: true` from Path B (`pageProps.question.content`)
      - Returns `found: true` from Path C (`pageProps.data.question.content`)
      - Returns `found: false` when `__NEXT_DATA__` script absent from DOM
      - Returns `found: false` when JSON is malformed
      - Returns `found: false` when `content` is `null`
      - Returns `found: false` when `content` is `""` (empty)
      - Returns `found: false` when `content` is `42` (not a string)
      - Returns `found: false` when `question` is missing from all three paths
      - Does NOT read `codeSnippets`, `hints`, `solution`, or any other field (assert these fields being present don't affect the result)
    - Add `scrapeSubmission` description integration unit tests:
      - **TC-D1**: Valid HTML in `__NEXT_DATA__` → `description` non-empty, no HTML tags, no raw entities
      - **TC-D2**: `content` absent/null in `__NEXT_DATA__`, no DOM fallback element → `description === ""` → `generateProblemStatement("")` returns placeholder
      - **TC-D3**: Unrelated JSON fields (`codeSnippets`, `hints`, `solution`) present but `content` absent → `description === ""` (not accidentally populated)
      - **TC-D4**: Non-empty `description` flows into `generateReadme()` output — real description appears in place of `_Official problem description unavailable._`
      - **TC-D5**: Non-empty `description` flows into `generateProblemStatement()` — returns description text, not the placeholder
      - **TC-D6**: Repeat push — `pushSubmission()` with existing README and problem_statement (GET returns 200 + SHA) includes `sha` field in both PUT bodies even when description is a real non-empty string
      - **TC-D7**: DOM-selector fallback fires when `__NEXT_DATA__` has no `content` but `[data-track-load="description-content"]` is present — `description` equals `descEl.textContent.trim()`
    - Add diagnostics unit tests:
      - When `ENABLE_DIAGNOSTICS` is true and `__NEXT_DATA__` source is used: exactly three description-related `console.log` calls with source `"__NEXT_DATA__"`, success `true`, byte length > 0; no description content preview logged
      - When `ENABLE_DIAGNOSTICS` is true and all extraction fails: source `"none"`, success `false`, byte length `0`
    - Add integration tests (full push round-trip using mocked `fetch`):
      - Non-empty description round-trip: `pushSubmission` with `description` scraped from `__NEXT_DATA__`; base64-decode `problem_statement.md` PUT body and assert it matches the plain-text description, not the placeholder
      - Empty description round-trip: `pushSubmission` with `description: ""`; base64-decode PUT body and assert it equals `"<!-- Problem description unavailable. -->"`
      - Repeat push (existing problem): GET returns 200 + SHA for README and problem_statement; both PUT requests include `sha` field (SHA fetch-before-PUT preserved with real description content)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.4_

  - [x] 3.6 Create `tests/description-extraction.pbt.test.js` property-based tests
    - Add four property-based tests using `fast-check`:
      - **Property 1 (in pbt file)** — `htmlToPlainText` output never contains HTML markup: for any `fc.string()` input, output does not match `/<[a-zA-Z][^>]*>/`
      - **Property 2 (in pbt file)** — `htmlToPlainText` output never contains raw HTML entities: for any `fc.string()` input, output does not contain `&lt;`, `&gt;`, `&amp;`, `&quot;`, or `&#\d+;`
      - **Property 3** — `extractDescriptionFromNextData` never throws: for any `fc.jsonValue()` serialized as `__NEXT_DATA__` content (arbitrary JSON including nested objects, missing fields, wrong types), the function always returns `{ html: string, found: boolean }` without throwing
      - **Property 4** — Preservation: non-description fields unaffected: for any DOM with varying `__NEXT_DATA__` shapes (with/without `content`, with wrong types), `scrapeSubmission()` returns the same `problemNumber`, `problemSlug`, `language`, `domain`, `code` as a baseline DOM without `__NEXT_DATA__`
    - _Requirements: 2.1, 2.3, 3.1, 3.7_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - `__NEXT_DATA__` Content Extraction Succeeds
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (non-empty, HTML-tag-free, entity-free description)
    - When this test passes, it confirms `scrapeSubmission()` now reads `__NEXT_DATA__.question.content` and converts it to clean plain text
    - Run: `npx jest tests/description-extraction.test.js --runInBand`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug condition is fixed — description is no longer `""` when `__NEXT_DATA__` has content)
    - _Requirements: 2.1, 2.3, 2.4_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Description Fields and Fallback Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run: `npx jest tests/description-extraction.pbt.test.js --runInBand`
    - **EXPECTED OUTCOME**: All preservation tests PASS (confirms no regressions — non-description fields unchanged, placeholder fallback intact)
    - Confirm `problemNumber`, `problemSlug`, `language`, `domain`, `code` values are identical before and after the fix for all tested DOM shapes

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite: `npx jest --runInBand`
  - Verify **zero failures** across all test files, including:
    - `tests/description-extraction.test.js` (all TC-D1 through TC-D7 and integration tests)
    - `tests/description-extraction.pbt.test.js` (all four property-based tests)
    - `scrapeSubmission.test.js` (no regressions — existing description test with `[data-cy="question-content"]` still passes because the DOM-selector fallback path now includes that selector)
    - `tests/integration.test.js` (full push round-trip tests unaffected)
    - All other existing test files (`tests/background.test.js`, `tests/content.pbt.test.js`, `tests/fixes.pbt.test.js`, etc.)
  - If any test fails, diagnose and fix before proceeding
  - Ensure all work is committed on branch `fix/description-extraction-fix`
  - Ask the user if any questions arise
