# Testing Guide

## Overview

LeetUp has 264 automated tests across 12 test suites. The suite combines three test styles:

| Style | Purpose | Tool |
|---|---|---|
| Unit tests | Verify individual functions in isolation | Jest + jsdom |
| Integration tests | Verify the full content → background message flow | Jest + jsdom |
| Property-based tests (PBT) | Verify invariants hold for arbitrary inputs | Jest + fast-check |

---

## Running Tests

Install dependencies first:

```bash
npm install
```

Run the full suite:

```bash
npm test
```

Tests run serially (`--runInBand`) because they share a global `chrome` mock object. Parallel execution would cause test pollution.

---

## Test File Map

```
leetcode-github-sync/
├── content.test.js                       # Unit — content script functions
├── scrapeSubmission.test.js              # Unit — scrapeSubmission edge cases
└── tests/
    ├── attachObserver.test.js            # Unit — MutationObserver attachment
    ├── modal.test.js                     # Unit — modal inject, submit, dismiss
    ├── background.test.js                # Unit — background worker functions
    ├── popup.test.js                     # Unit — popup credential handling
    ├── manifest.test.js                  # Unit — manifest structure smoke test
    ├── integration.test.js               # Integration — full message flow
    ├── content.pbt.test.js               # PBT — Properties 1, 6, 7, 8, 9, 10
    ├── background.pbt.test.js            # PBT — Properties 11–19
    ├── popup.pbt.test.js                 # PBT — Properties 2, 3
    └── pat-storage-location.pbt.test.js  # PBT — Property 19 / security model
```

---

## Property Inventory

All 19 properties verified by the property-based test suite:

| Property | Description | File |
|---|---|---|
| 1 | Only `"Accepted"` (exact after trim) triggers the submission flow | `content.pbt.test.js` |
| 2 | Credential save rejects whitespace-only input for all three fields | `popup.pbt.test.js` |
| 3 | Popup pre-populates fields from whatever is in storage | `popup.pbt.test.js` |
| 4 | `getFileExtension` is case-insensitive and whitespace-tolerant | `content.pbt.test.js` |
| 5 | Unknown languages always fall back to `.txt` | `content.pbt.test.js` |
| 6 | `getDomain` is total — every language maps to exactly one domain | `content.pbt.test.js` |
| 7 | `buildRepoPath` output always matches `domain/topic/NNNN-slug/` | `content.pbt.test.js` |
| 8 | `injectModal` is idempotent — N triggers never produce >1 modal | `content.pbt.test.js` |
| 9 | `reconnectObserver` is called exactly once per SPA navigation | `content.pbt.test.js` |
| 10 | The PUSH_SUBMISSION payload always contains all 10 required fields | `content.pbt.test.js` |
| 11 | `generateReadme` structure is correct for all notes/description combos | `background.pbt.test.js` |
| 12 | Commit message always matches `"Add solution for N. Title"` format | `background.pbt.test.js` |
| 13 | SHA from GET is included in the subsequent PUT body | `background.pbt.test.js` |
| 14 | `toBase64` round-trips correctly for all Unicode input | `background.pbt.test.js` |
| 15 | Solution file is always pushed before README; failure aborts sequence | `background.pbt.test.js` |
| 16 | Any non-2xx HTTP status produces a `{ ok: false, error }` result | `background.pbt.test.js` |
| 17 | Every GitHub API request carries `Authorization` and `Content-Type` headers | `background.pbt.test.js` |
| 18 | PAT never appears in the request URL or body, only in the header | `background.pbt.test.js` |
| 19 | PAT is stored only in `chrome.storage.local`, never in `chrome.storage.sync` | `pat-storage-location.pbt.test.js` |

---

## Test Environment

Tests run in `jest-environment-jsdom` which simulates a browser DOM. The `chrome` API is mocked globally in each test file since it is not available in Node.

A typical `chrome` mock looks like:

```js
global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys, cb) => cb({ pat: 'test', username: 'user', repo: 'repo' })),
      set: jest.fn((_data, cb) => cb()),
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  runtime: {
    lastError: null,
    sendMessage: jest.fn(),
  },
};
```

`fetch` is also mocked in background tests to avoid real network calls:

```js
global.fetch = jest.fn(() =>
  Promise.resolve({ status: 201, json: () => Promise.resolve({}) })
);
```

---

## Property-Based Testing Strategy

Property tests use `fast-check` to generate hundreds of arbitrary inputs and verify that invariants hold for all of them.

Each property test:
1. Declares the property in plain English (comment at the top)
2. Uses `fc.assert(fc.property(...))` with `numRuns: 100` (or 200 for critical paths)
3. Uses `fc.asyncProperty` for async functions, with `await Promise.resolve()` to flush microtasks after DOM mutations
4. Returns a boolean — `true` if the property holds for the given input

Example pattern:

```js
test('result is always one of the three valid domain strings', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...allLanguages),
      (language) => {
        const domain = getDomain(language);
        return ['dsa', 'sql-databases', 'future-explorations'].includes(domain);
      }
    ),
    { numRuns: 100 }
  );
});
```

---

## Adding New Tests

1. For a new utility function in `content.js` or `background.js`, add a unit test in the corresponding `tests/*.test.js` file.
2. For a new behavioural invariant, add a property test in the corresponding `tests/*.pbt.test.js` file.
3. Follow the comment pattern: `// Feature: leetup, Property N: description` so tests are traceable to requirements.
4. Run `npm test` and confirm the suite is still green before committing.
