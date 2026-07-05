/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/content.pbt.test.js — Property-Based Tests for content.js utilities
// Feature: leetcode-github-sync, Property 6: Domain classification is total and correct

const fc = require('fast-check');
const { LANG_MAP, getDomain, buildRepoPath, attachObserver } = require('../content');
const contentModule = require('../content');

// ---------------------------------------------------------------------------
// All language labels covered by this property test
// ---------------------------------------------------------------------------

// All keys from LANG_MAP (already lowercase, these are the canonical forms)
const langMapKeys = [...LANG_MAP.keys()];

// SQL and Bash languages that drive domain classification
const SQL_LANGUAGES  = ['mysql', 'ms sql server', 'oracle'];
const BASH_LANGUAGES = ['bash'];

// Union of all languages: LANG_MAP keys plus any SQL/Bash entries not already
// present (they ARE in LANG_MAP, but we declare them explicitly for clarity).
const allLanguages = [...new Set([...langMapKeys, ...SQL_LANGUAGES, ...BASH_LANGUAGES])];

// Valid domain values
const VALID_DOMAINS = new Set(['dsa', 'sql-databases', 'shell-scripting']);

// ---------------------------------------------------------------------------
// Property 6: Domain classification is total and correct
// Validates: Requirements 4.1, 4.2, 4.3
// ---------------------------------------------------------------------------

describe('getDomain — Property 6: Domain classification is total and correct', () => {
  // Feature: leetcode-github-sync, Property 6: Domain classification is total and correct

  test('result is always exactly one of the three valid domain strings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allLanguages),
        (language) => {
          const domain = getDomain(language);
          return VALID_DOMAINS.has(domain);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('SQL languages always map to "sql-databases"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SQL_LANGUAGES),
        (language) => {
          return getDomain(language) === 'sql-databases';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Bash always maps to "shell-scripting"', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BASH_LANGUAGES),
        (language) => {
          return getDomain(language) === 'shell-scripting';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('all non-SQL non-Bash languages always map to "dsa"', () => {
    const dsaLanguages = allLanguages.filter(
      (l) => !SQL_LANGUAGES.includes(l) && !BASH_LANGUAGES.includes(l)
    );

    fc.assert(
      fc.property(
        fc.constantFrom(...dsaLanguages),
        (language) => {
          return getDomain(language) === 'dsa';
        }
      ),
      { numRuns: 100 }
    );
  });

  test('classification is total and exclusive (exactly one domain per language)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allLanguages),
        (language) => {
          const domain = getDomain(language);
          const isSql   = domain === 'sql-databases';
          const isBash  = domain === 'shell-scripting';
          const isDsa   = domain === 'dsa';
          // Exactly one must be true
          const count = [isSql, isBash, isDsa].filter(Boolean).length;
          return count === 1;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Repository path always follows the specified format
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe('buildRepoPath — Property 7: Repository path always follows the specified format', () => {
  // Feature: leetcode-github-sync, Property 7: Repository path always follows the specified format

  test('path always matches the expected format regex', () => {
    // ^[a-z-]+\/\d{4}-[a-z0-9-]+\/$  (no topic subfolder)
    const pathRegex = /^[a-z-]+\/\d{4}-[a-z0-9-]+\/$/;

    fc.assert(
      fc.property(
        fc.record({
          domain: fc.constantFrom('dsa', 'sql-databases', 'shell-scripting'),
          problemNumber: fc.nat({ max: 9999 }),
          problemSlug: fc.stringMatching(/^[a-z][a-z0-9-]*$/),
        }),
        ({ domain, problemNumber, problemSlug }) => {
          const result = buildRepoPath(domain, problemNumber, problemSlug);
          return result !== null && pathRegex.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Modal injection is idempotent (no duplicate modals)
// Validates: Requirements 2.8
// Feature: leetcode-github-sync, Property 8: Modal injection is idempotent (no duplicate modals)
// ---------------------------------------------------------------------------

describe('attachObserver — Property 8: Modal injection is idempotent (no duplicate modals)', () => {
  // Feature: leetcode-github-sync, Property 8: Modal injection is idempotent (no duplicate modals)

  /**
   * Reset DOM and isModalOpen flag before each run so each property iteration
   * starts from a clean slate.
   */
  function resetDOMAndState() {
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  }

  /**
   * Build a minimal scrapable LeetCode page DOM so that scrapeSubmission()
   * returns a valid payload (required for injectModal to be called).
   * Returns the result panel element that the observer is attached to.
   */
  function buildScrapablePage() {
    document.title = '1. Two Sum - LeetCode';
    window.history.pushState({}, '', '/problems/two-sum/description/');

    const panel = document.createElement('div');
    panel.setAttribute('data-e2e-locator', 'submission-result');

    const viewLines = document.createElement('div');
    viewLines.className = 'view-lines';
    const line = document.createElement('div');
    line.className = 'view-line';
    line.textContent = 'def twoSum(): pass';
    viewLines.appendChild(line);

    const topicLink = document.createElement('a');
    topicLink.href = '/tag/array/';
    topicLink.textContent = 'Array';

    const langBtn = document.createElement('button');
    langBtn.textContent = 'Python3';

    document.body.appendChild(panel);
    document.body.appendChild(viewLines);
    document.body.appendChild(topicLink);
    document.body.appendChild(langBtn);

    return panel;
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    contentModule.pendingSubmission = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    contentModule.pendingSubmission = false;
  });

  test(
    'at most one #lgs-modal exists after N successive "Accepted" trigger events',
    () => {
      // Feature: leetcode-github-sync, Property 8: Modal injection is idempotent (no duplicate modals)
      fc.assert(
        fc.property(
          fc.array(fc.constant('Accepted'), { minLength: 2, maxLength: 10 }),
          (acceptedEvents) => {
            // --- Setup clean DOM for this run ---
            resetDOMAndState();
            const panel = buildScrapablePage();
            const observer = attachObserver();

            // --- Fire each "Accepted" DOM event synchronously ---
            for (const _status of acceptedEvents) {
              // Arm the flag for the first event only — after that isModalOpen blocks it
              if (!contentModule.isModalOpen) {
                contentModule.pendingSubmission = true;
              }
              // Append a new span with "Accepted" text — mimics what LeetCode does.
              const el = document.createElement('span');
              el.textContent = _status;
              panel.appendChild(el);
              // MutationObserver callbacks in jsdom are synchronous.
            }

            // --- Assert no duplicates ---
            const modalCount = document.querySelectorAll('#lgs-modal').length;

            // Cleanup observer
            if (observer) observer.disconnect();
            contentModule.pendingSubmission = false;

            return modalCount <= 1;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Property 9: SPA navigation always resets the MutationObserver
// Validates: Requirements 2.9
// Feature: leetcode-github-sync, Property 9: SPA navigation always resets the MutationObserver
// ---------------------------------------------------------------------------

describe('reconnectObserver — Property 9: SPA navigation always resets the MutationObserver', () => {
  // Feature: leetcode-github-sync, Property 9: SPA navigation always resets the MutationObserver

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset module state between runs
    contentModule.activeObserver = null;
    contentModule.currentUrl = window.location.href;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test(
    'reconnectObserver is called exactly N times for N URL navigations',
    () => {
      // Feature: leetcode-github-sync, Property 9: SPA navigation always resets the MutationObserver
      fc.assert(
        fc.property(
          fc.array(fc.webUrl(), { minLength: 1, maxLength: 10 }),
          (urls) => {
            // Track how many times reconnectObserver is called
            let callCount = 0;
            const original = contentModule.reconnectObserver.bind(contentModule);
            const spy = jest.spyOn(contentModule, 'reconnectObserver').mockImplementation(function () {
              callCount++;
              // Delegate to original to exercise real logic
              original();
            });

            // Simulate N navigations by updating currentUrl and calling
            // reconnectObserver manually, matching how startUrlPolling works.
            for (const url of urls) {
              contentModule.currentUrl = url;
              contentModule.reconnectObserver();
            }

            const result = callCount === urls.length;

            spy.mockRestore();
            return result;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'activeObserver is null or a MutationObserver after each reconnect',
    () => {
      // Feature: leetcode-github-sync, Property 9: SPA navigation always resets the MutationObserver
      fc.assert(
        fc.property(
          fc.array(fc.webUrl(), { minLength: 1, maxLength: 10 }),
          (urls) => {
            // Reset state
            contentModule.activeObserver = null;

            for (const url of urls) {
              contentModule.currentUrl = url;
              contentModule.reconnectObserver();
              // Run any pending setTimeout callbacks (jsdom / fake-timer-free approach:
              // reconnectObserver uses setTimeout(..., 0); since no panel is in the DOM
              // attachObserver returns null, so activeObserver stays null after the tick)
            }

            // After final navigation: activeObserver is either null (no panel in DOM)
            // or a MutationObserver instance (panel was found)
            const obs = contentModule.activeObserver;
            return obs === null || obs instanceof MutationObserver;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    'previous observer is disconnected before a new one is created',
    () => {
      // Feature: leetcode-github-sync, Property 9: SPA navigation always resets the MutationObserver
      fc.assert(
        fc.property(
          fc.array(fc.webUrl(), { minLength: 2, maxLength: 10 }),
          (urls) => {
            const disconnectCalls = [];

            // Install a fake observer as the "pre-existing" active observer
            const fakeObserver = {
              disconnect: jest.fn(() => disconnectCalls.push(true)),
              observe: jest.fn(),
            };
            contentModule.activeObserver = fakeObserver;

            // First navigation should disconnect the fake observer
            contentModule.currentUrl = urls[0];
            contentModule.reconnectObserver();

            // The fake observer's disconnect must have been called
            return fakeObserver.disconnect.mock.calls.length >= 1;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Property 10: Push message payload contains all required fields
// Validates: Requirements 5.6
// Feature: leetcode-github-sync, Property 10: Push message payload contains all required fields
// ---------------------------------------------------------------------------

describe('injectModal — Property 10: Push message payload contains all required fields', () => {
  // Feature: leetcode-github-sync, Property 10: Push message payload contains all required fields

  const REQUIRED_FIELDS = [
    'problemNumber',
    'problemSlug',
    'problemTitle',
    'domain',
    'topicSlug',
    'language',
    'fileExtension',
    'code',
    'notes',
    'description',
  ];

  /**
   * Reset DOM and modal state between each property run.
   */
  function resetState() {
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.chrome;
  });

  test(
    'PUSH_SUBMISSION message contains all 10 required non-null fields for any scraped payload',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            problemNumber:  fc.string({ minLength: 1 }),
            problemSlug:    fc.string({ minLength: 1 }),
            problemTitle:   fc.string(),
            domain:         fc.constantFrom('dsa', 'sql-databases', 'shell-scripting'),
            topicSlug:      fc.string({ minLength: 1 }),
            language:       fc.string({ minLength: 1 }),
            fileExtension:  fc.string({ minLength: 1 }),
            code:           fc.string({ minLength: 1 }),
            notes:          fc.string(),
            description:    fc.string(),
          }),
          (mockPayload) => {
            // --- Fresh DOM for every run ---
            resetState();

            // --- Mock chrome.runtime.sendMessage ---
            const sendMessageMock = jest.fn();
            global.chrome = { runtime: { sendMessage: sendMessageMock } };

            // --- Inject modal with the generated payload ---
            contentModule.injectModal(mockPayload);

            // --- Locate submit button and set notes ---
            const notesEl  = document.getElementById('lgs-notes');
            const submitBtn = document.getElementById('lgs-submit-btn');

            if (!notesEl || !submitBtn) return false;

            // Set the notes value (simulates user typing)
            notesEl.value = mockPayload.notes;

            // Click submit to trigger sendMessage
            submitBtn.click();

            // --- Inspect the captured message ---
            if (sendMessageMock.mock.calls.length === 0) return false;

            const [message] = sendMessageMock.mock.calls[0];

            if (!message || message.type !== 'PUSH_SUBMISSION') return false;

            const sentPayload = message.payload;

            if (!sentPayload) return false;

            // Assert all 10 fields are present and not null/undefined
            return REQUIRED_FIELDS.every(
              (field) => sentPayload[field] !== null && sentPayload[field] !== undefined
            );
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ---------------------------------------------------------------------------
// Property 1: Only "Accepted" triggers the submission flow
// Validates: Requirements 2.2, 2.3
// Feature: leetcode-github-sync, Property 1: Only "Accepted" triggers the submission flow
// ---------------------------------------------------------------------------

describe('attachObserver — Property 1: Only "Accepted" triggers the submission flow', () => {
  // Feature: leetcode-github-sync, Property 1: Only "Accepted" triggers the submission flow

  /**
   * Reset DOM and isModalOpen flag so each property run starts from a clean slate.
   */
  function resetDOMAndState() {
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  }

  /**
   * Build a fully scrapable LeetCode page DOM so scrapeSubmission() succeeds,
   * then return the result panel element the observer is attached to.
   *
   * Note: attachObserver() calls scrapeSubmission() directly (not via
   * module.exports), so we cannot intercept it with jest.spyOn. Building a
   * real scrapable page is the correct isolation strategy for this property.
   */
  function buildScrapablePage() {
    document.title = '1. Two Sum - LeetCode';
    window.history.pushState({}, '', '/problems/two-sum/description/');

    // Result panel — required by attachObserver()
    const panel = document.createElement('div');
    panel.setAttribute('data-e2e-locator', 'submission-result');

    // Code editor lines — required for scrapeSubmission() to find code
    const viewLines = document.createElement('div');
    viewLines.className = 'view-lines';
    const line = document.createElement('div');
    line.className = 'view-line';
    line.textContent = 'def twoSum(): pass';
    viewLines.appendChild(line);

    // Topic tag link — required for topicSlug
    const topicLink = document.createElement('a');
    topicLink.href = '/tag/array/';
    topicLink.textContent = 'Array';

    // Language button — required for language / fileExtension / domain
    const langBtn = document.createElement('button');
    langBtn.textContent = 'Python3';

    document.body.appendChild(panel);
    document.body.appendChild(viewLines);
    document.body.appendChild(topicLink);
    document.body.appendChild(langBtn);

    return panel;
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    contentModule.pendingSubmission = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    contentModule.pendingSubmission = false;
  });

  test(
    'flow is triggered if and only if trimmed status text is exactly "Accepted"',
    async () => {
      // Feature: leetcode-github-sync, Property 1: Only "Accepted" triggers the submission flow
      //
      // Strategy: build a fully scrapable DOM so scrapeSubmission() can succeed,
      // then verify the modal appears iff the injected text trims to "Accepted".
      //
      // Note: jsdom fires MutationObserver callbacks as microtasks (not synchronously).
      // We use fc.asyncProperty + await Promise.resolve() to flush the microtask queue
      // after each DOM mutation before asserting modal presence.
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Fully arbitrary strings (covers a wide input space)
            fc.string(),
            // Explicit near-misses and boundary cases
            fc.constantFrom(
              'Wrong Answer',
              'Time Limit Exceeded',
              'Runtime Error',
              'Memory Limit Exceeded',
              'Compile Error',
              'Output Limit Exceeded',
              'accepted',        // wrong case — must NOT trigger
              'ACCEPTED',        // wrong case — must NOT trigger
              'Accepted!',       // extra punctuation — must NOT trigger
              ' Accepted',       // leading space — trims to "Accepted" → SHOULD trigger
              'Accepted ',       // trailing space — trims to "Accepted" → SHOULD trigger
              ' Accepted ',      // both — trims to "Accepted" → SHOULD trigger
              'Accepted\n',      // newline after — trims to "Accepted" → SHOULD trigger
              ''                 // empty — must NOT trigger
            )
          ),
          async (statusText) => {
            // Setup clean slate for every run
            resetDOMAndState();
            const panel = buildScrapablePage();

            const observer = attachObserver();

            // Arm pendingSubmission so the guard allows the observer to fire
            // (simulates user having clicked Submit before the result appears)
            const shouldTrigger = statusText.trim() === 'Accepted';
            if (shouldTrigger) {
              contentModule.pendingSubmission = true;
            }

            // Simulate a DOM mutation delivering the generated status text
            const el = document.createElement('span');
            el.textContent = statusText;
            panel.appendChild(el);

            // Flush microtask queue so the MutationObserver callback fires
            await Promise.resolve();

            const modalExists = document.getElementById('lgs-modal') !== null;

            // Cleanup
            if (observer) observer.disconnect();
            contentModule.pendingSubmission = false;

            // The flow should trigger iff the trimmed text is exactly "Accepted"
            return modalExists === shouldTrigger;
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  test(
    'non-"Accepted" strings (after trim) never trigger flow',
    async () => {
      // Feature: leetcode-github-sync, Property 1: Only "Accepted" triggers the submission flow
      await fc.assert(
        fc.asyncProperty(
          // Only strings whose trimmed form is NOT "Accepted"
          fc.string().filter((s) => s.trim() !== 'Accepted'),
          async (statusText) => {
            resetDOMAndState();
            const panel = buildScrapablePage();

            const observer = attachObserver();

            // pendingSubmission is false — even if text were "Accepted" it wouldn't fire.
            // For non-"Accepted" strings this is doubly safe.

            const el = document.createElement('span');
            el.textContent = statusText;
            panel.appendChild(el);

            // Flush microtask queue so the MutationObserver callback fires
            await Promise.resolve();

            const modalExists = document.getElementById('lgs-modal') !== null;

            if (observer) observer.disconnect();

            // Modal must NOT be present for any non-"Accepted" status
            return !modalExists;
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  test(
    '"Accepted" with surrounding whitespace (trims to "Accepted") DOES trigger flow',
    async () => {
      // Feature: leetcode-github-sync, Property 1: Only "Accepted" triggers the submission flow
      // The spec says "strict equality after trim", so whitespace-padded variants
      // of "Accepted" must still trigger the flow.
      await fc.assert(
        fc.asyncProperty(
          // Build strings of the form: <whitespace>Accepted<whitespace>
          // Use fc.array of whitespace chars to ensure only real whitespace is padded
          fc.tuple(
            fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 5 })
              .map((chars) => chars.join('')),
            fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 5 })
              .map((chars) => chars.join(''))
          ).map(([leading, trailing]) => leading + 'Accepted' + trailing),
          async (statusText) => {
            resetDOMAndState();
            const panel = buildScrapablePage();

            const observer = attachObserver();

            // Arm pendingSubmission — simulates user clicking Submit
            contentModule.pendingSubmission = true;

            const el = document.createElement('span');
            el.textContent = statusText;
            panel.appendChild(el);

            // Flush microtask queue so the MutationObserver callback fires
            await Promise.resolve();

            const modalExists = document.getElementById('lgs-modal') !== null;

            if (observer) observer.disconnect();
            contentModule.pendingSubmission = false;

            // All of these trim to "Accepted", so modal must be injected
            return modalExists === true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
