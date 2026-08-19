# Failing Test Suites Analysis

This document catalogs all five failing test suites and their exact failing assertions from the `npm test` output.

## Summary
- **Total Test Suites**: 16 (5 failed, 11 passed)
- **Total Tests**: 308 (21 failed, 287 passed)
- **Root Cause**: Tests reference obsolete `pendingSubmission` boolean model; production code uses `pendingAttempt` object

---

## Suite 1: tests/content.pbt.test.js

**Status**: FAIL (Property-Based Tests)

### Failing Test 1: Property 1 - Only "Accepted" triggers submission flow
**Test Description**: Flow is triggered if and only if trimmed status text is exactly "Accepted"

**Failure**:
```
Property failed after 3 tests
{ seed: -1884379070, path: "2", endOnFailure: true }
Counterexample: [" Accepted "]
Shrunk 0 time(s)
Got error: Property failed by returning false
```

**Root Cause**: Test expects modal to appear but `pendingAttempt` is null (was checking `pendingSubmission` boolean)

### Failing Test 2: Property 1 - "Accepted" with surrounding whitespace DOES trigger flow
**Failure**:
```
Property failed after 1 tests
{ seed: -1168198999, path: "0:0", endOnFailure: true }
Counterexample: ["Accepted"]
Shrunk 1 time(s)
Got error: Property failed by returning false
```

**Root Cause**: Same as above - `pendingAttempt` state not being set correctly in property-based test setup

---

## Suite 2: tests/attachObserver.test.js

**Status**: FAIL (Unit Tests)

### Failing Test 1: "calls injectModal when a new text node with 'Accepted' is added"
**Assertion**:
```javascript
expect(document.getElementById('lgs-modal')).not.toBeNull();
```
**Result**: `Received: null`

**Root Cause**: Line 80 sets `contentModule.pendingSubmission = true` but production code checks `pendingAttempt !== null`

### Failing Test 2: "DOES inject modal when 'Accepted' has leading/trailing whitespace"
**Assertion**:
```javascript
expect(document.getElementById('lgs-modal')).not.toBeNull();
```
**Result**: `Received: null`

**Root Cause**: Line 131 sets `pendingSubmission = true` instead of creating `pendingAttempt` object

### Failing Test 3: "does NOT inject a second modal when first mutation already opened modal"
**Assertion**:
```javascript
expect(firstModal).not.toBeNull();
```
**Result**: `Received: null`

**Root Cause**: Line 217 sets `pendingSubmission = true`, no modal opened because `pendingAttempt` is null

### Failing Test 4: "detects 'Accepted' via characterData mutation"
**Assertion**:
```javascript
expect(document.getElementById('lgs-modal')).not.toBeNull();
```
**Result**: `Received: null`

**Root Cause**: Line 250 sets `pendingSubmission = true` instead of `pendingAttempt` object

---

## Suite 3: tests/premature-modal.test.js

**Status**: FAIL (Bugfix Regression Tests)

### Failing Tests 1-6: Non-Accepted verdict tests (parametrized)
**Test Names**:
- "Wrong Answer"
- "Time Limit Exceeded"
- "Runtime Error"
- "Memory Limit Exceeded"
- "Compile Error"
- "Output Limit Exceeded"

**Assertion**:
```javascript
expect(contentModule.pendingSubmission).toBe(false);
```
**Result**: `Expected: false, Received: true`

**Root Cause**: Lines 167-175 check `pendingSubmission` boolean, but production code clears `pendingAttempt` object via `clearPendingAttempt()`. Test should check `contentModule.pendingAttempt === null`

### Failing Test 7: "Delayed container creation: modal fires after container is injected with 'Accepted'"
**Assertion**:
```javascript
expect(document.getElementById('lgs-modal')).not.toBeNull();
```
**Result**: `Received: null`

**Root Cause**: Line 209 sets `pendingSubmission = true` instead of creating `pendingAttempt` object

### Failing Test 8: "Multiple rapid 'Accepted' mutations open exactly one modal"
**Assertion**:
```javascript
expect(modals.length).toBe(1);
```
**Result**: `Expected: 1, Received: 0`

**Root Cause**: Line 236 sets `pendingSubmission = true`, no modal created because `pendingAttempt` is null

### Failing Test 9: "Slow submission: container injected long after Submit click still fires modal"
**Assertion**:
```javascript
expect(document.getElementById('lgs-modal')).not.toBeNull();
```
**Result**: `Received: null`

**Root Cause**: Line 272 sets `pendingSubmission = true` instead of `pendingAttempt` object

### Failing Test 10: "15-second timeout expiry only disarms pendingSubmission, never opens modal"
**Assertion**:
```javascript
expect(contentModule.pendingSubmission).toBe(false);
```
**Result**: `Expected: false, Received: true`

**Root Cause**: Line 312 checks `pendingSubmission` boolean, should check `pendingAttempt === null`

---

## Suite 4: tests/payload-capture-fix.test.js

**Status**: FAIL (Payload Capture Tests)

### Failing Test 1: "payload is captured via __NEXT_DATA__ JSON"
**Assertion**:
```javascript
expect(captured).not.toBeNull();
```
**Result**: `Received: null`

**Root Cause**: Test reads `contentModule.pendingAttempt` (correct) but Submit button click doesn't create `pendingAttempt` because test uses direct `window.location` assignment which triggers JSDOM error

**JSDOM Error**:
```
Error: Not implemented: navigation (except hash changes)
at window.location = { ... }
```

**Location**: `tests/test-helpers.js:18` - `mockWindowLocation()` function uses `window.location = {...}` which is not supported in JSDOM

### Failing Test 2: "payload is captured at Submit click before route navigation"
**Same issue as Test 1**: JSDOM navigation error prevents payload capture

---

## Suite 5: tests/navigation-fix.test.js

**Status**: FAIL (Navigation Tests)

### All Tests Failing with JSDOM Error
**Error**:
```
Error: Not implemented: navigation (except hash changes)
at module.exports (node_modules/jsdom/lib/jsdom/browser/not-implemented.js:9:17)
```

**Failing Tests**:
1. "preserves pendingSubmission when navigating within same problem"
2. "clears pendingSubmission when navigating to different problem"
3. "clears pendingSubmission when navigating away from problem pages"
4. "handles navigation when pendingSubmission is already false"
5. "handles empty previousUrl gracefully"
6. "regression: same-problem navigation fix preserves pending state"

### Root Cause 1: JSDOM Incompatibility
**Locations**:
- Line 61: `window.location = { href: '...' }`
- Line 77: `window.location = { href: '...' }`
- Line 93: `window.location = { href: '...' }`
- Line 109: `window.location = { href: '...' }`
- Line 125: `window.location = { href: '...' }`
- Line 144: `window.location = { href: '...' }`
- Line 151: `window.location = { href: '...' }`

All direct `window.location` assignments throw "Not implemented: navigation" error in JSDOM

### Root Cause 2: Obsolete State Model
**Assertions checking wrong property**:
- Line 84: `expect(require('../content.js').pendingSubmission).toBe(false);`
  - **Result**: `Expected: false, Received: true`
  - Should check: `pendingAttempt === null`

- Line 100: `expect(require('../content.js').pendingSubmission).toBe(false);`
  - **Result**: `Expected: false, Received: true`
  - Should check: `pendingAttempt === null`

- Line 131: `expect(require('../content.js').pendingSubmission).toBe(false);`
  - **Result**: `Expected: false, Received: true`
  - Should check: `pendingAttempt === null`

---

## Migration Requirements

### State Model Updates
1. Replace all `contentModule.pendingSubmission = true` with:
   ```javascript
   contentModule.pendingAttempt = {
     payload: mockPayload,
     startedAt: Date.now(),
     problemSlug: mockPayload.problemSlug
   };
   ```

2. Replace all `contentModule.pendingSubmission = false` with:
   ```javascript
   contentModule.pendingAttempt = null;
   ```

3. Replace all checks `pendingSubmission === true` with:
   ```javascript
   pendingAttempt !== null
   ```

4. Replace all checks `pendingSubmission === false` with:
   ```javascript
   pendingAttempt === null
   ```

### JSDOM Navigation Fixes
1. Replace `window.location = { href: '...' }` with:
   ```javascript
   Object.defineProperty(window, 'location', {
     writable: true,
     value: { href: '...', pathname: '...', search: '', hash: '' }
   });
   ```

2. OR use `window.history.pushState({}, '', newPath)` for pathname-only changes

3. OR mock `window.location.href` as a getter that returns test values

4. Extract URL parsing logic (`extractProblemSlug()`) to testable pure functions

### Test Helper Updates
1. Fix `mockWindowLocation()` in `tests/test-helpers.js` to use safe JSDOM-compatible approach
2. Add helper to create valid `pendingAttempt` objects with realistic payloads
3. Update `resetDOM()` helpers to reset `pendingAttempt` instead of `pendingSubmission`

---

## Files Requiring Changes

1. **tests/content.pbt.test.js** (2 property tests)
2. **tests/attachObserver.test.js** (4 unit tests)
3. **tests/premature-modal.test.js** (10 regression tests)
4. **tests/payload-capture-fix.test.js** (2 payload tests)
5. **tests/navigation-fix.test.js** (6 navigation tests)
6. **tests/test-helpers.js** (`mockWindowLocation()` function)

---

## Acceptance Criterion
After migration: `npm test` reports **0 failing suites, 0 failing tests** (308 passing tests).
