/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/fixes.pbt.test.js — Bug-condition exploration PBTs and preservation PBTs
// for the four LeetUp bugfixes.
//
// Property 1 tests (exploration) are expected to FAIL on unfixed code — failure
// confirms each bug exists. They are written as xtest stubs here; Task 1 will
// promote them to live tests.
//
// Property 2 tests (preservation) are expected to PASS on unfixed code — they
// confirm existing correct behaviours that must not regress after the fixes.

'use strict';

const fc = require('fast-check');
const contentModule = require('../content');
const { injectModal, getDomain } = contentModule;
const { pushSubmission } = require('../background');

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

/** A minimal valid payload matching the shape returned by scrapeSubmission(). */
const SAMPLE_PAYLOAD = {
  problemNumber: '0001',
  problemSlug:   'two-sum',
  problemTitle:  'Two Sum',
  topicSlug:     'array',
  language:      'Python3',
  fileExtension: '.py',
  domain:        'dsa',
  code:          'def twoSum(): pass',
  description:   'Given an array of integers...',
};

/** Reset document.body and the isModalOpen flag before each test run. */
function resetDOM() {
  document.body.innerHTML = '';
  contentModule.isModalOpen = false;
}

// ---------------------------------------------------------------------------
// Property 1 — Exploration tests (EXPECTED TO FAIL on unfixed code)
// Failure confirms each bug exists. Promoted from xtest stubs.
// ---------------------------------------------------------------------------

describe('Property 1 - Bug Condition Exploration (stubs — Task 1 implements these)', () => {
  // ---------------------------------------------------------------------------
  // Fix 1: modal closes after { ok: true }
  // Expected to FAIL on unfixed code — proves bug 1 exists
  // Validates: Requirements 2.1, 2.2
  // ---------------------------------------------------------------------------
  describe('Fix 1 timer setup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      resetDOM();
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
      delete global.chrome;
    });

    /**
     * Validates: Requirements 2.1, 2.2
     */
    test('Property 1 - Fix 1: for all { ok: true } responses — modal is removed within 2000 ms', () => {
      fc.assert(
        fc.property(
          fc.constant({ ok: true }),
          (response) => {
            resetDOM();

            // Mock chrome.runtime.sendMessage to immediately call back with { ok: true }
            global.chrome = {
              runtime: {
                sendMessage: jest.fn((_msg, callback) => {
                  callback(response);
                }),
              },
            };

            injectModal(SAMPLE_PAYLOAD);

            const submitBtn = document.getElementById('lgs-submit-btn');
            submitBtn.click();

            // Advance fake timers past the 2000 ms close delay
            jest.advanceTimersByTime(2000);

            // On UNFIXED code: modal still present → test FAILS (proves bug exists)
            // On FIXED code: modal removed → test PASSES
            return document.getElementById('lgs-modal') === null;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Fix 2: bash routes to "shell-scripting" and emits console.info
  // Expected to FAIL on unfixed code — proves bug 2 exists
  // Validates: Requirements 2.6
  // ---------------------------------------------------------------------------

  /**
   * Validates: Requirements 2.6
   */
  test('Property 1 - Fix 2: for all BASH_LANGUAGES — getDomain returns "shell-scripting" and emits console.info', () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    try {
      fc.assert(
        fc.property(
          fc.constantFrom('bash'),
          (lang) => {
            infoSpy.mockClear();

            const result = getDomain(lang);

            // On UNFIXED code: result === 'future-explorations' → test FAILS (proves bug exists)
            // On FIXED code: result === 'shell-scripting' and console.info called → test PASSES
            const domainCorrect = result === 'shell-scripting';
            const infoEmitted = infoSpy.mock.calls.some(
              (args) => args.some((a) => typeof a === 'string' && a.includes('shell-scripting'))
            );

            return domainCorrect && infoEmitted;
          }
        ),
        { numRuns: 20 }
      );
    } finally {
      infoSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // Fix 3: pushSubmission issues a PUT to problem_statement.md
  // Expected to FAIL on unfixed code — proves bug 3 exists
  // Validates: Requirements 2.7, 2.8
  // ---------------------------------------------------------------------------

  /**
   * Validates: Requirements 2.7, 2.8
   */
  test('Property 1 - Fix 3: for any accepted submission payload — pushSubmission issues a PUT to problem_statement.md', async () => {
    const CREDENTIALS = { pat: 'test-pat', username: 'user', repo: 'repo' };

    await fc.assert(
      fc.asyncProperty(
        fc.constant(SAMPLE_PAYLOAD),
        async (payload) => {
          const allCalls = [];

          global.fetch = (url, options) => {
            const method = (options && options.method) || 'GET';
            allCalls.push({ url, method });

            if (method === 'GET') {
              return Promise.resolve({
                status: 404,
                json: () => Promise.resolve({}),
              });
            }

            // PUT — return 201 success
            return Promise.resolve({
              status: 201,
              json: () => Promise.resolve({}),
            });
          };

          await pushSubmission(payload, CREDENTIALS);

          // On UNFIXED code: no call to problem_statement.md → test FAILS (proves bug exists)
          // On FIXED code: at least one PUT to problem_statement.md → test PASSES
          return allCalls.some(
            (c) => c.method === 'PUT' && c.url.endsWith('problem_statement.md')
          );
        }
      ),
      { numRuns: 10 }
    );
  });

  // ---------------------------------------------------------------------------
  // Fix 4: toolbar injected with ≥ 4 buttons
  // Expected to FAIL on unfixed code — proves bug 4 exists
  // Validates: Requirements 2.10, 2.11
  // ---------------------------------------------------------------------------

  beforeEach(() => {
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Validates: Requirements 2.10, 2.11
   */
  test('Property 1 - Fix 4: for any modal injection — toolbar is present with ≥ 4 buttons', () => {
    fc.assert(
      fc.property(
        fc.constant(SAMPLE_PAYLOAD),
        (payload) => {
          resetDOM();

          injectModal(payload);

          const toolbar = document.getElementById('lgs-toolbar');

          // On UNFIXED code: toolbar is null → test FAILS (proves bug exists)
          // On FIXED code: toolbar present with ≥ 4 buttons → test PASSES
          if (toolbar === null) return false;

          const buttons = toolbar.querySelectorAll('button');
          return buttons.length >= 4;
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — Preservation tests (MUST PASS on unfixed code)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Group A — Modal error path stays open
// Validates: Requirements 3.1, 3.2
// ---------------------------------------------------------------------------

describe('Property 2 - Group A: for all error responses — modal stays open, error shown, button re-enabled', () => {
  beforeEach(() => {
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.chrome;
  });

  /**
   * Validates: Requirements 3.1, 3.2
   */
  test('Property 2 - Group A: for all error responses — modal stays open, error shown, button re-enabled', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (errorString) => {
          resetDOM();

          // Mock chrome.runtime.sendMessage to respond with { ok: false, error: errorString }
          global.chrome = {
            runtime: {
              sendMessage: jest.fn((_msg, callback) => {
                callback({ ok: false, error: errorString });
              }),
            },
          };

          injectModal(SAMPLE_PAYLOAD);

          const submitBtn = document.getElementById('lgs-submit-btn');
          submitBtn.click();

          // Assert: modal stays open
          const modalPresent = document.getElementById('lgs-modal') !== null;
          // Assert: error message displayed
          const statusText = document.getElementById('lgs-status').textContent;
          const errorShown = statusText === errorString;
          // Assert: submit button re-enabled
          const btnEnabled = document.getElementById('lgs-submit-btn').disabled === false;

          return modalPresent && errorShown && btnEnabled;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Group B — Manual close (× / Escape) not affected
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------

describe('Property 2 - Group B: clicking × or pressing Escape removes the modal immediately', () => {
  beforeEach(() => {
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Validates: Requirements 3.1
   */
  test('Property 2 - Group B: clicking × removes the modal immediately', () => {
    injectModal(SAMPLE_PAYLOAD);

    const closeBtn = document.getElementById('lgs-close-btn');
    closeBtn.click();

    expect(document.getElementById('lgs-modal')).toBeNull();
  });

  /**
   * Validates: Requirements 3.1
   */
  test('Property 2 - Group B: pressing Escape removes the modal immediately', () => {
    injectModal(SAMPLE_PAYLOAD);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('lgs-modal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group C — SQL and DSA domain routing unchanged
// Validates: Requirements 3.3, 3.4
// ---------------------------------------------------------------------------

describe('Property 2 - Group C: domain routing for SQL and DSA languages unchanged', () => {
  /**
   * Validates: Requirements 3.4
   */
  test('Property 2 - Group C: for all SQL_LANGUAGES — getDomain returns sql-databases', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('mysql', 'ms sql server', 'oracle'),
        (lang) => {
          return getDomain(lang) === 'sql-databases';
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 3.3
   */
  test('Property 2 - Group C: for all DSA languages — getDomain returns dsa', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('python3', 'java', 'javascript', 'typescript', 'c++', 'go', 'rust'),
        (lang) => {
          return getDomain(lang) === 'dsa';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Group D — Solution and README write order unchanged
// Validates: Requirements 3.9
// ---------------------------------------------------------------------------

describe('Property 2 - Group D: solution PUT precedes README PUT in fetch call order', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const CREDENTIALS = { pat: 'test-pat', username: 'user', repo: 'repo' };

  /**
   * Validates: Requirements 3.9
   */
  test('Property 2 - Group D: solution PUT precedes README PUT in fetch call order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // No arbitrary inputs needed — the property holds for any accepted submission
        fc.constant(SAMPLE_PAYLOAD),
        async (payload) => {
          const fetchCalls = [];

          global.fetch = (url, options) => {
            const method = (options && options.method) || 'GET';
            fetchCalls.push({ url, method });

            // GET calls — return 404 (no existing file)
            if (method === 'GET') {
              return Promise.resolve({
                status: 404,
                json: () => Promise.resolve({}),
              });
            }

            // PUT calls — return 201 success
            return Promise.resolve({
              status: 201,
              json: () => Promise.resolve({}),
            });
          };

          await pushSubmission(payload, CREDENTIALS);

          // Find PUT indices
          const solutionPutIndex = fetchCalls.findIndex(
            c => c.method === 'PUT' && !c.url.includes('README.md') && !c.url.includes('problem_statement')
          );
          const readmePutIndex = fetchCalls.findIndex(
            c => c.method === 'PUT' && c.url.includes('README.md')
          );

          // Both must be present and solution must come first
          return (
            solutionPutIndex !== -1 &&
            readmePutIndex   !== -1 &&
            solutionPutIndex < readmePutIndex
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Group E — Notes value in submit message unchanged
// Validates: Requirements 3.6, 3.7
// ---------------------------------------------------------------------------

describe('Property 2 - Group E: notes value in PUSH_SUBMISSION message unchanged', () => {
  beforeEach(() => {
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.chrome;
  });

  /**
   * Validates: Requirements 3.6, 3.7
   */
  test('Property 2 - Group E: for any notes string — PUSH_SUBMISSION message.payload.notes equals textarea.value', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (notesString) => {
          resetDOM();

          let capturedMessage = null;

          global.chrome = {
            runtime: {
              sendMessage: jest.fn((msg, _callback) => {
                capturedMessage = msg;
                // Do not call callback — we only need to capture the message
              }),
            },
          };

          injectModal(SAMPLE_PAYLOAD);

          // Set notes value and click submit
          document.getElementById('lgs-notes').value = notesString;
          document.getElementById('lgs-submit-btn').click();

          if (!capturedMessage) return false;
          if (capturedMessage.type !== 'PUSH_SUBMISSION') return false;
          if (!capturedMessage.payload) return false;

          return capturedMessage.payload.notes === notesString;
        }
      ),
      { numRuns: 100 }
    );
  });
});
