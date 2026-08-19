# Requirements Document

## Introduction

This document specifies requirements for migrating the LeetUp test suite from the obsolete `pendingSubmission` boolean model to the current `pendingAttempt` object model. The production code in `content.js` has already been migrated to use a structured `pendingAttempt` object, but the test suite still references the old boolean flag, causing test failures. This migration updates all tests to align with the current implementation without changing production submission behavior.

## Glossary

- **Test_Suite**: The complete set of test files in the `tests/` directory that validate LeetUp content script behavior
- **PendingAttempt**: The current production state object with structure `{ payload, startedAt, problemSlug }` that stores a captured submission before the verdict arrives
- **PendingSubmission**: The obsolete boolean flag that tests currently reference (replaced by PendingAttempt)
- **Submit_Click_Listener**: The capture-phase event handler that detects Submit button clicks and creates PendingAttempt
- **Payload**: The scraped submission data containing problem metadata, code, language, and other fields required for GitHub push
- **Verdict_Observer**: The MutationObserver that watches the result container for "Accepted" or terminal non-accepted verdicts
- **Result_Container**: The DOM element with selector `[data-e2e-locator="submission-result"]` where LeetCode displays submission results
- **Same_Problem_Navigation**: Navigation from `/problems/slug/` to `/problems/slug/submissions/id/` that preserves PendingAttempt state
- **Different_Problem_Navigation**: Navigation from `/problems/slug-a/` to `/problems/slug-b/` that clears PendingAttempt state
- **JSDOM**: The Jest test environment that simulates browser DOM but has limitations (cannot assign `window.location` directly)
- **Terminal_Verdict**: A final submission result (Accepted, Wrong Answer, Time Limit Exceeded, Runtime Error, Memory Limit Exceeded, Compile Error, Output Limit Exceeded)

## Requirements

### Requirement 1: State Object Structure

**User Story:** As a test maintainer, I want tests to reference the current `pendingAttempt` object model, so that tests validate production behavior accurately.

#### Acceptance Criteria

1. WHEN a test needs to check pending submission state, THE Test_Suite SHALL reference `contentModule.pendingAttempt` instead of `contentModule.pendingSubmission`
2. WHEN a test verifies state is armed, THE Test_Suite SHALL check `pendingAttempt !== null` instead of `pendingSubmission === true`
3. WHEN a test verifies state is disarmed, THE Test_Suite SHALL check `pendingAttempt === null` instead of `pendingSubmission === false`
4. WHEN a test sets pending state, THE Test_Suite SHALL assign an object with structure `{ payload, startedAt, problemSlug }` instead of boolean `true`
5. THE PendingAttempt object SHALL contain a `payload` field with the complete scraped submission data
6. THE PendingAttempt object SHALL contain a `startedAt` field with a numeric timestamp from `Date.now()`
7. THE PendingAttempt object SHALL contain a `problemSlug` field matching `payload.problemSlug`

### Requirement 2: Payload Capture Timing

**User Story:** As a test maintainer, I want tests to validate that payload is captured at Submit click before navigation, so that the modal can open even when problem metadata is unavailable on the submission detail page.

#### Acceptance Criteria

1. WHEN the Submit button is clicked, THE Submit_Click_Listener SHALL capture Payload via `scrapeSubmission()` from the current problem page
2. WHEN Payload capture succeeds, THE Submit_Click_Listener SHALL create PendingAttempt with the captured Payload
3. WHEN Payload capture fails, THE Submit_Click_Listener SHALL set PendingAttempt to null
4. WHEN an Accepted verdict arrives, THE Verdict_Observer SHALL use `pendingAttempt.payload` instead of calling `scrapeSubmission()` again
5. THE Test_Suite SHALL validate that Payload contains `problemNumber`, `problemSlug`, `code`, `language`, `fileExtension`, and `domain` fields
6. WHEN tests simulate Submit click on a page with `__NEXT_DATA__` JSON, THE Test_Suite SHALL verify problem number extraction via the JSON structure
7. WHEN tests simulate Submit click on a page without required metadata, THE Test_Suite SHALL verify PendingAttempt remains null

### Requirement 3: Verdict Detection and State Lifecycle

**User Story:** As a test maintainer, I want tests to validate that PendingAttempt is created only after Submit click and cleared appropriately, so that false positives from stale DOM nodes are prevented.

#### Acceptance Criteria

1. WHEN an Accepted verdict text node is added to Result_Container AND PendingAttempt is not null, THE Verdict_Observer SHALL inject the modal using `pendingAttempt.payload`
2. WHEN an Accepted verdict text node is added to Result_Container AND PendingAttempt is null, THE Verdict_Observer SHALL NOT inject the modal
3. WHEN a Terminal_Verdict that is not Accepted appears, THE Verdict_Observer SHALL call `clearPendingAttempt()` with reason "non-accepted-verdict"
4. WHEN the modal is injected for an Accepted verdict, THE Verdict_Observer SHALL call `clearPendingAttempt()` with reason "accepted-verdict"
5. WHEN 15 seconds elapse after Submit click without a verdict, THE Submit_Click_Listener timeout SHALL call `clearPendingAttempt()` with reason "15s-timeout"
6. WHEN Different_Problem_Navigation occurs, THE reconnectObserver function SHALL call `clearPendingAttempt()` with reason "navigation"
7. WHEN clearPendingAttempt is called, THE function SHALL set `pendingAttempt` to null and clear any active timeout

### Requirement 4: Same-Problem Navigation Preservation

**User Story:** As a test maintainer, I want tests to validate that PendingAttempt is preserved during same-problem navigation, so that the modal can appear after LeetCode redirects to the submission detail page.

#### Acceptance Criteria

1. WHEN navigation occurs from `/problems/slug/` to `/problems/slug/submissions/id/`, THE reconnectObserver function SHALL preserve PendingAttempt unchanged
2. WHEN navigation occurs from `/problems/slug/` to `/problems/other-slug/`, THE reconnectObserver function SHALL clear PendingAttempt
3. WHEN navigation occurs from `/problems/slug/` to a non-problem URL, THE reconnectObserver function SHALL clear PendingAttempt
4. WHEN Same_Problem_Navigation occurs AND PendingAttempt is null, THE reconnectObserver function SHALL NOT throw an error
5. THE Test_Suite SHALL use `extractProblemSlug()` to compare previous and current URLs for same-problem detection

### Requirement 5: JSDOM Compatibility

**User Story:** As a test maintainer, I want tests to avoid JSDOM limitations, so that navigation tests can run without errors.

#### Acceptance Criteria

1. THE Test_Suite SHALL NOT assign `window.location` directly using `window.location = ...`
2. WHEN tests need to change the URL, THE Test_Suite SHALL use helper functions like `mockWindowLocation()` that handle JSDOM limitations
3. WHEN tests need to change the pathname, THE Test_Suite SHALL use `window.history.pushState({}, '', newPath)` or equivalent safe methods
4. WHEN tests validate URL parsing logic, THE Test_Suite SHALL call `extractProblemSlug(url)` with string arguments instead of relying on `window.location`

### Requirement 6: Stale Node Prevention

**User Story:** As a test maintainer, I want tests to validate that stale "Accepted" nodes from previous submissions do not trigger the modal, so that false positives are eliminated.

#### Acceptance Criteria

1. WHEN Result_Container already contains an "Accepted" text node before observer attachment, THE Verdict_Observer SHALL NOT inject the modal unless a NEW "Accepted" node is added
2. WHEN an unrelated DOM mutation occurs in Result_Container that does not add "Accepted" text, THE Verdict_Observer SHALL NOT inject the modal even if stale "Accepted" nodes exist
3. WHEN "Accepted" text appears outside Result_Container, THE Verdict_Observer SHALL NOT inject the modal
4. THE Test_Suite SHALL validate that only `mutation.addedNodes` (not `mutation.target` subtrees) are inspected for childList mutations

### Requirement 7: Idempotency and Duplicate Modal Prevention

**User Story:** As a test maintainer, I want tests to validate that exactly one modal appears per accepted submission, so that duplicate modals are prevented.

#### Acceptance Criteria

1. WHEN multiple "Accepted" mutations fire rapidly for the same submission, THE Verdict_Observer SHALL inject exactly one modal
2. WHEN `isModalOpen` is already true, THE injectModal function SHALL return early without creating a second modal element
3. WHEN PendingAttempt is cleared after modal injection, THE Verdict_Observer SHALL NOT inject additional modals for subsequent "Accepted" nodes
4. THE Test_Suite SHALL verify that `document.querySelectorAll('#lgs-modal').length` equals 1 after multiple "Accepted" mutations

### Requirement 8: Test File Coverage

**User Story:** As a test maintainer, I want every failing test to be migrated or replaced, so that the complete test suite passes.

#### Acceptance Criteria

1. THE Test_Suite SHALL migrate 2 failing property-based tests in `tests/content.pbt.test.js`:
   - Property 1 test: "flow is triggered if and only if trimmed status text is exactly 'Accepted'"
   - Property 1 test: "'Accepted' with surrounding whitespace (trims to 'Accepted') DOES trigger flow"
2. THE Test_Suite SHALL migrate 4 failing unit tests in `tests/attachObserver.test.js`:
   - "calls injectModal when a new text node with 'Accepted' is added" (line 80 sets pendingSubmission)
   - "DOES inject modal when 'Accepted' has leading/trailing whitespace" (line 131 sets pendingSubmission)
   - "does NOT inject a second modal when first mutation already opened modal" (line 217 sets pendingSubmission)
   - "detects 'Accepted' via characterData mutation" (line 250 sets pendingSubmission)
3. THE Test_Suite SHALL migrate 10 failing regression tests in `tests/premature-modal.test.js`:
   - 6 parameterized non-accepted verdict tests (lines 167-175 check pendingSubmission boolean)
   - "Delayed container creation: modal fires after container is injected with 'Accepted'" (line 209)
   - "Multiple rapid 'Accepted' mutations open exactly one modal" (line 236)
   - "Slow submission: container injected long after Submit click still fires modal" (line 272)
   - "15-second timeout expiry only disarms pendingSubmission, never opens modal" (line 312)
4. THE Test_Suite SHALL migrate 2 failing payload tests in `tests/payload-capture-fix.test.js`:
   - "payload is captured via __NEXT_DATA__ JSON" (JSDOM navigation error at test-helpers.js:18)
   - "payload is captured at Submit click before route navigation" (same JSDOM error)
5. THE Test_Suite SHALL migrate 6 failing navigation tests in `tests/navigation-fix.test.js`:
   - "preserves pendingSubmission when navigating within same problem" (lines 61, 84)
   - "clears pendingSubmission when navigating to different problem" (lines 77, 84)
   - "clears pendingSubmission when navigating away from problem pages" (lines 93, 100)
   - "handles navigation when pendingSubmission is already false" (line 109)
   - "handles empty previousUrl gracefully" (lines 125, 131)
   - "regression: same-problem navigation fix preserves pending state" (lines 144, 151)
6. WHEN a test validates state is armed, THE Test_Suite SHALL create a complete PendingAttempt object with valid `payload`, `startedAt`, and `problemSlug` fields
7. WHEN a test uses `mockWindowLocation()`, THE Test_Suite SHALL fix the helper in `test-helpers.js` to avoid direct `window.location` assignment (JSDOM error)
8. WHEN tests call `reconnectObserver()`, THE Test_Suite SHALL use valid helper implementations that work within JSDOM constraints
9. THE Test_Suite SHALL replace all 21 instances of `pendingSubmission` boolean references with `pendingAttempt` object checks
10. THE Test_Suite SHALL fix `mockWindowLocation()` in `test-helpers.js` line 18 to use `Object.defineProperty(window, 'location', ...)` instead of direct assignment

### Requirement 9: Test Execution Success

**User Story:** As a developer, I want `npm test` to complete with zero failures, so that I can confidently commit test suite changes.

#### Acceptance Criteria

1. WHEN `npm test` is executed, THE Test_Suite SHALL complete with zero failing test suites
2. WHEN `npm test` is executed, THE Test_Suite SHALL complete with zero failing individual tests
3. THE Test_Suite SHALL maintain all existing test coverage for observer attachment, verdict detection, modal injection, navigation handling, and payload capture
4. WHEN a test validates modal injection, THE Test_Suite SHALL verify both the modal element existence (`document.getElementById('lgs-modal')`) and `isModalOpen` flag state
5. THE Test_Suite SHALL NOT remove any test that validates current production behavior (only obsolete-model tests may be removed)

### Requirement 10: Timeout Behavior

**User Story:** As a test maintainer, I want tests to validate that the 15-second timeout clears state but never triggers the modal, so that timeout is correctly understood as cleanup-only.

#### Acceptance Criteria

1. WHEN 15 seconds elapse after Submit click without a verdict, THE Submit_Click_Listener timeout SHALL set PendingAttempt to null
2. WHEN the 15-second timeout fires, THE Submit_Click_Listener timeout SHALL NOT call `injectModal()`
3. WHEN an Accepted verdict arrives before the 15-second timeout, THE Verdict_Observer SHALL clear the timeout via `clearPendingAttempt()`
4. THE Test_Suite SHALL use `jest.useFakeTimers()` and `jest.advanceTimersByTime()` to validate timeout behavior without waiting 15 real seconds
5. WHEN tests validate slow submissions (13-14 seconds), THE Test_Suite SHALL verify that PendingAttempt remains non-null until verdict arrives or timeout expires

### Requirement 11: Backward Compatibility with Test Helpers

**User Story:** As a test maintainer, I want test helper functions to support the new object model, so that shared test utilities work correctly.

#### Acceptance Criteria

1. WHEN `resetDOM()` or equivalent helper is called, THE helper SHALL reset PendingAttempt to null (not pendingSubmission to false)
2. WHEN `buildScrapablePage()` or equivalent helper creates a mock LeetCode page, THE helper SHALL include all fields required for successful Payload capture
3. WHEN tests need to arm pending state, THE Test_Suite SHALL use a helper that creates a valid PendingAttempt object with realistic `startedAt` and `problemSlug` values
4. THE Test_Suite SHALL verify that `test-helpers.js` exports any required mock utilities (like `mockWindowLocation`)

### Requirement 12: Non-Accepted Verdict Handling

**User Story:** As a test maintainer, I want tests to validate that non-accepted terminal verdicts clear PendingAttempt without opening the modal, so that only Accepted submissions trigger the GitHub push flow.

#### Acceptance Criteria

1. WHEN "Wrong Answer" verdict appears in Result_Container, THE Verdict_Observer SHALL call `clearPendingAttempt()` and NOT inject the modal
2. WHEN "Time Limit Exceeded" verdict appears in Result_Container, THE Verdict_Observer SHALL call `clearPendingAttempt()` and NOT inject the modal
3. WHEN "Runtime Error" verdict appears in Result_Container, THE Verdict_Observer SHALL call `clearPendingAttempt()` and NOT inject the modal
4. WHEN "Memory Limit Exceeded" verdict appears in Result_Container, THE Verdict_Observer SHALL call `clearPendingAttempt()` and NOT inject the modal
5. WHEN "Compile Error" verdict appears in Result_Container, THE Verdict_Observer SHALL call `clearPendingAttempt()` and NOT inject the modal
6. WHEN "Output Limit Exceeded" verdict appears in Result_Container, THE Verdict_Observer SHALL call `clearPendingAttempt()` and NOT inject the modal
7. THE Test_Suite SHALL use parameterized tests (`test.each`) to validate all non-accepted verdicts with a single test implementation

### Requirement 13: Delayed Container Creation

**User Story:** As a test maintainer, I want tests to validate that the two-phase observer strategy handles delayed Result_Container creation, so that slow page renders do not prevent modal injection.

#### Acceptance Criteria

1. WHEN observer is attached AND Result_Container does not yet exist in the DOM, THE attachObserver function SHALL start Phase 1 (container insertion watcher)
2. WHEN Result_Container is dynamically inserted into the DOM, THE attachObserver function SHALL transition to Phase 2 (verdict observer)
3. WHEN Result_Container is inserted with an "Accepted" node already inside it, THE attachObserver function SHALL immediately check the container and inject the modal if PendingAttempt is not null
4. WHEN Result_Container already exists at observer attachment time, THE attachObserver function SHALL skip Phase 1 and attach Phase 2 directly
5. THE Test_Suite SHALL simulate delayed container creation by starting with an empty DOM and inserting Result_Container after observer attachment

### Requirement 14: Payload Field Validation

**User Story:** As a test maintainer, I want tests to validate that captured Payload contains all required fields, so that modal injection and GitHub push have complete data.

#### Acceptance Criteria

1. WHEN Payload is captured via Submit click, THE captured object SHALL contain a `problemNumber` field as a zero-padded 4-digit string
2. WHEN Payload is captured via Submit click, THE captured object SHALL contain a `problemSlug` field matching the URL path component
3. WHEN Payload is captured via Submit click, THE captured object SHALL contain a `code` field with the editor content
4. WHEN Payload is captured via Submit click, THE captured object SHALL contain a `language` field from the language selector button
5. WHEN Payload is captured via Submit click, THE captured object SHALL contain a `fileExtension` field derived via `getFileExtension(language)`
6. WHEN Payload is captured via Submit click, THE captured object SHALL contain a `domain` field derived via `getDomain(language)`
7. THE Test_Suite SHALL validate that all required Payload fields are non-empty strings (or valid numeric values for timestamps)
