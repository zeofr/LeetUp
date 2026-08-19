# Tasks: Test Suite Migration to pendingAttempt Object Model

## Task List

- [x] 1. Fix test-helpers.js: JSDOM-safe window.location and createValidPendingAttempt fixture
  - [x] 1.1 Fix mockWindowLocation() to use Object.defineProperty instead of direct assignment
  - [x] 1.2 Add createValidPendingAttempt(overrides) helper factory function
  - Acceptance: `mockWindowLocation()` no longer throws "Not implemented: navigation"; `createValidPendingAttempt()` returns `{ payload, startedAt, problemSlug }` with all required payload fields

- [x] 2. Migrate tests/content.pbt.test.js: replace pendingSubmission with pendingAttempt
  - [x] 2.1 Replace `contentModule.pendingSubmission = true/false` with `pendingAttempt` in Property 8 (attachObserver idempotency tests)
  - [x] 2.2 Replace `contentModule.pendingSubmission = true/false` with `pendingAttempt` in Property 1 (Only "Accepted" triggers flow tests: "flow is triggered if and only if trimmed status text is exactly 'Accepted'" and "'Accepted' with surrounding whitespace DOES trigger flow")
  - Acceptance: `npm test tests/content.pbt.test.js` passes with 0 failures

- [x] 3. Migrate tests/attachObserver.test.js: replace pendingSubmission with pendingAttempt
  - [x] 3.1 Import createValidPendingAttempt from test-helpers in attachObserver.test.js
  - [x] 3.2 Replace `contentModule.pendingSubmission = true` with `contentModule.pendingAttempt = createValidPendingAttempt()` in all 4 failing tests (lines 80, 131, 217, 250)
  - [x] 3.3 Update resetDOM() helper to reset `pendingAttempt` to null instead of `pendingSubmission` to false
  - [x] 3.4 Update beforeEach/afterEach to use pendingAttempt
  - Acceptance: `npm test tests/attachObserver.test.js` passes with 0 failures

- [x] 4. Migrate tests/premature-modal.test.js: replace pendingSubmission with pendingAttempt
  - [x] 4.1 Import createValidPendingAttempt from test-helpers in premature-modal.test.js
  - [x] 4.2 Update resetAll() helper to reset `pendingAttempt` to null instead of `pendingSubmission` to false
  - [x] 4.3 Update beforeEach/afterEach to use pendingAttempt
  - [x] 4.4 Replace `contentModule.pendingSubmission = true` with `contentModule.pendingAttempt = createValidPendingAttempt()` in Tests 1, 2, 4, 5, 6 (delayed container, multiple rapid mutations, slow submission)
  - [x] 4.5 Update Test 3 (6 non-accepted verdict tests): change `expect(contentModule.pendingSubmission).toBe(false)` to `expect(contentModule.pendingAttempt).toBe(null)`; also replace the setup `pendingSubmission = true` with `pendingAttempt = createValidPendingAttempt()`
  - [x] 4.6 Update Test 7 (timeout test): change `expect(contentModule.pendingSubmission).toBe(false)` to `expect(contentModule.pendingAttempt).toBe(null)` and fix setup/cleanup references
  - Acceptance: `npm test tests/premature-modal.test.js` passes with 0 failures

- [x] 5. Fix tests/payload-capture-fix.test.js: resolve JSDOM navigation errors
  - [x] 5.1 Verify mockWindowLocation fix (from Task 1) resolves the "Not implemented: navigation" JSDOM error in this suite
  - [x] 5.2 Fix the 'scrapeSubmission is NOT called on submission-detail page' test which uses a direct `window.location = { ... }` assignment — replace with mockWindowLocation() call
  - Acceptance: `npm test tests/payload-capture-fix.test.js` passes with 0 failures

- [x] 6. Migrate tests/navigation-fix.test.js: fix JSDOM errors and replace pendingSubmission
  - [x] 6.1 Import mockWindowLocation from test-helpers and contentModule at the top of the file
  - [x] 6.2 Replace all 7 direct `window.location = { href: '...' }` assignments (in describe blocks and test bodies) with `mockWindowLocation({ href: '...', pathname: '...' })` calls
  - [x] 6.3 Update beforeEach/afterEach to use mockWindowLocation and pendingAttempt
  - [x] 6.4 Replace `require('../content.js').pendingSubmission = true/false` with `contentModule.pendingAttempt = createValidPendingAttempt()` or `contentModule.pendingAttempt = null` throughout all 6 failing navigation tests
  - [x] 6.5 Update all assertions: change `expect(require('../content.js').pendingSubmission).toBe(true)` to `expect(contentModule.pendingAttempt).not.toBe(null)` and `expect(require('../content.js').pendingSubmission).toBe(false)` to `expect(contentModule.pendingAttempt).toBe(null)`
  - Acceptance: `npm test tests/navigation-fix.test.js` passes with 0 failures

- [x] 7. Final verification: full test suite passes
  - [x] 7.1 Run `npm test` and confirm 0 failing suites, 0 failing tests
  - [x] 7.2 Verify no lingering `pendingSubmission` references remain in test files (grep test files for pendingSubmission)
  - [x] 7.3 Confirm test count is at least 308 passing tests (no tests deleted)
  - Acceptance: `npm test` exits with code 0, all suites green, ≥308 tests passing
