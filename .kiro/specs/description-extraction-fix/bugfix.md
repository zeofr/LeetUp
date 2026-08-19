# Bugfix Requirements Document

## Introduction

When a user clicks Submit on a LeetCode problem and the submission is accepted,
the extension captures a payload and pushes three files to GitHub: a solution
file, `README.md`, and `problem_statement.md`. The `problem_statement.md` file
is meant to contain the readable problem description, but it is currently always
created with the fallback placeholder `<!-- Problem description unavailable. -->`
(41 bytes) because `payload.description` is empty when the modal fires.

The root cause is that the five CSS selectors used in `scrapeSubmission()` to
locate the problem description container are all stale and no longer match the
live LeetCode DOM. LeetCode uses hashed/generated class names that change
between deployments, so selector-based extraction is inherently fragile.
However, the page already inlines structured JSON in the `__NEXT_DATA__` script
tag (used by Next.js for server-side hydration), which contains the full
question data including the description HTML. The current code reads
`questionFrontendId` from this source for problem number extraction but never
reads the question `content` field from the same structure.

The fix must update the description extraction to use a verified, stable source
and ensure `payload.description` is populated at Submit click time so that
`problem_statement.md` contains the real problem statement in GitHub.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user clicks Submit on any LeetCode problem page THEN the system attempts to extract the problem description using only five CSS class-name selectors (`[data-cy="question-content"]`, `[class*="question-content__JfgR"]`, `.content__u3I1`, `[class*="problem-statement"]`, `[class*="description__"]`), all of which fail to match the live DOM

1.2 WHEN none of the CSS selectors match THEN the system sets `description` to an empty string (`""`) in the scraped payload

1.3 WHEN `payload.description` is an empty string at GitHub push time THEN the system writes the fallback comment `<!-- Problem description unavailable. -->` (41 bytes) to `problem_statement.md` instead of the real problem description

1.4 WHEN the same empty description is used for `README.md` generation THEN the system substitutes `_Official problem description unavailable._` as the body, leaving the README without the real problem text

### Expected Behavior (Correct)

2.1 WHEN the user clicks Submit on any LeetCode problem page THEN the system SHALL extract the problem description from the `__NEXT_DATA__` JSON (the `content` field already embedded in the page), as a primary source that is available during the same page load and contains reliable structured data

2.2 WHEN the `__NEXT_DATA__` JSON is unavailable or does not contain a non-empty `content` field THEN the system SHALL fall back to searching the live DOM using updated, broader attribute-based selectors (`[data-track-load="description-content"]` or `[class*="elfjS"]` as a secondary heuristic) before returning an empty string

2.3 WHEN extraction succeeds and `payload.description` is non-empty at Submit click time THEN the system SHALL write the actual problem description text to `problem_statement.md`, so the file contains readable content and is larger than the 41-byte placeholder

2.4 WHEN extraction succeeds THEN the system SHALL write the same description into the body section of `README.md` in place of the unavailability placeholder

2.5 WHEN the `ENABLE_DIAGNOSTICS` flag is `true` THEN the system SHALL log (and only log): the extraction source/method used (e.g. `"__NEXT_DATA__"` vs `"DOM-selector"`), whether extraction succeeded (`true`/`false`), and the byte length of the extracted description — it SHALL NOT log any preview of the description text, source code, tokens, cookies, or credentials

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `payload.description` is empty after all extraction attempts THEN the system SHALL CONTINUE TO write the placeholder `<!-- Problem description unavailable. -->` to `problem_statement.md` (graceful fallback is preserved)

3.2 WHEN the accepted modal appears THEN the system SHALL CONTINUE TO use the payload captured at Submit click (via `pendingAttempt`) without re-scraping the submission-detail page

3.3 WHEN the submission result is not "Accepted" THEN the system SHALL CONTINUE TO dismiss the pending attempt without opening the modal or pushing to GitHub

3.4 WHEN the user pushes a solution for a problem that already exists in the repository THEN the system SHALL CONTINUE TO update all three files (solution, README.md, problem_statement.md) by fetching their current SHAs before each PUT request

3.5 WHEN credentials (PAT, username, repo) are missing or incomplete THEN the system SHALL CONTINUE TO return an error without attempting any GitHub API calls

3.6 WHEN SPA navigation occurs between problems THEN the system SHALL CONTINUE TO reset the MutationObserver and clear `pendingAttempt` for the old problem so that a new submit on the next problem works correctly

---

## Bug Condition Pseudocode

**Bug Condition Function** — identifies inputs that trigger the bug:

```pascal
FUNCTION isBugCondition(page)
  INPUT: page — the LeetCode problem page state at Submit click time
  OUTPUT: boolean

  // The bug fires whenever ALL description extraction paths fail
  // This happens because:
  //   (a) none of the five CSS selectors match the live DOM, AND
  //   (b) __NEXT_DATA__ is never consulted for description content
  RETURN scrapeDescription(page) = ""
END FUNCTION
```

**Property: Fix Checking**
```pascal
FOR ALL page WHERE isBugCondition_OLD(page) DO
  // page has __NEXT_DATA__ with a valid content field
  result ← scrapeSubmission'(page)   // fixed version
  ASSERT result.description ≠ ""
  ASSERT result.description ≠ "<!-- Problem description unavailable. -->"
END FOR
```

**Property: Preservation Checking**
```pascal
// For pages where the old code already returned a non-empty description
// (none exist in practice with current selectors, but logically):
FOR ALL page WHERE NOT isBugCondition_OLD(page) DO
  ASSERT scrapeSubmission(page).description = scrapeSubmission'(page).description
END FOR

// For the fallback path (no description available from any source):
FOR ALL page WHERE isBugCondition_FIXED(page) DO
  // No description from any source → placeholder still used
  ASSERT generateProblemStatement("") = "<!-- Problem description unavailable. -->"
END FOR
```
