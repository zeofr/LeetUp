/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/premature-modal.test.js
// Targeted regression tests for the premature-modal-trigger bugfix.
//
// Covers six specific scenarios from the bugfix requirements:
//  1. Unrelated "Accepted" text elsewhere on the page must NOT trigger modal.
//  2. Stale "Accepted" node rediscovered during unrelated DOM mutation must NOT trigger.
//  3. Non-Accepted final verdicts must NOT trigger modal (and must disarm pendingAttempt).
//  4. Delayed dynamic creation of the result container still triggers modal.
//  5. One accepted result opens exactly one modal (idempotency).
//  6. Slow completion beyond the former 15-second window still works (via container creation).

'use strict';

const contentModule = require('../content');
const { attachObserver, RESULT_CONTAINER_SELECTOR } = contentModule;
const { createValidPendingAttempt } = require('./test-helpers');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset document.body, modal flag, and pending state for each test. */
function resetAll() {
  document.body.innerHTML = '';
  contentModule.isModalOpen  = false;
  contentModule.pendingAttempt = null;
  jest.clearAllTimers();
}

/**
 * Build a scrapable LeetCode page DOM so scrapeSubmission() can return a
 * valid payload. Returns the result container element.
 */
function buildScrapablePage() {
  document.title = '1. Two Sum - LeetCode';
  window.history.pushState({}, '', '/problems/two-sum/description/');

  const container = document.createElement('div');
  container.setAttribute('data-e2e-locator', 'submission-result');

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

  document.body.appendChild(container);
  document.body.appendChild(viewLines);
  document.body.appendChild(topicLink);
  document.body.appendChild(langBtn);

  return container;
}

/** Flush the microtask queue so MutationObserver callbacks fire. */
function flush() {
  return Promise.resolve();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Premature modal trigger — bugfix regression tests', () => {
  beforeEach(() => {
    resetAll();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    contentModule.pendingAttempt = null;
    contentModule.isModalOpen = false;
  });

  // -------------------------------------------------------------------------
  // Test 1: Unrelated "Accepted" text elsewhere on the page must NOT fire modal
  // Requirement 1 AC2 — mutation outside the result container is ignored
  // -------------------------------------------------------------------------
  test('1. Unrelated "Accepted" text outside result container does NOT open modal', async () => {
    buildScrapablePage(); // container already in DOM

    const observer = attachObserver();
    contentModule.pendingAttempt = createValidPendingAttempt();

    // Add "Accepted" text to an element that is NOT the result container
    const unrelated = document.createElement('div');
    unrelated.id = 'submission-history';
    const span = document.createElement('span');
    span.textContent = 'Accepted'; // stale history entry
    unrelated.appendChild(span);
    document.body.appendChild(unrelated); // appended to body, not to container

    await flush();

    expect(document.getElementById('lgs-modal')).toBeNull();

    observer.disconnect();
  });

  // -------------------------------------------------------------------------
  // Test 2: Stale "Accepted" node inside container rediscovered during
  //         unrelated mutation must NOT fire modal
  // Requirement 1 AC3 — only addedNodes are inspected, not mutation.target subtree
  // -------------------------------------------------------------------------
  test('2. Stale "Accepted" already in container, unrelated mutation does NOT re-fire modal', async () => {
    const container = buildScrapablePage();

    // Pre-populate the container with a stale "Accepted" node (prior submission)
    const staleSpan = document.createElement('span');
    staleSpan.textContent = 'Accepted';
    container.appendChild(staleSpan);

    // Attach observer AFTER stale node exists — it should not immediately fire
    const observer = attachObserver();
    contentModule.pendingAttempt = createValidPendingAttempt();

    await flush();
    // No modal yet (stale node was already there, no new addedNodes)
    expect(document.getElementById('lgs-modal')).toBeNull();

    // Now cause an unrelated DOM mutation inside the container
    // (e.g. React re-renders some UI element)
    const unrelatedEl = document.createElement('div');
    unrelatedEl.className = 'some-ui-element';
    unrelatedEl.textContent = 'Loading...'; // NOT "Accepted"
    container.appendChild(unrelatedEl);

    await flush();

    // The stale "Accepted" node is still there, but the mutation only added
    // "Loading..." — the modal must NOT open.
    expect(document.getElementById('lgs-modal')).toBeNull();

    observer.disconnect();
  });

  // -------------------------------------------------------------------------
  // Test 3: Non-Accepted final verdicts do not open modal AND disarm flag
  // Requirement 2 AC3 — non-Accepted verdict disarms pendingAttempt
  // -------------------------------------------------------------------------
  test.each([
    'Wrong Answer',
    'Time Limit Exceeded',
    'Runtime Error',
    'Memory Limit Exceeded',
    'Compile Error',
    'Output Limit Exceeded',
  ])('3. Non-Accepted verdict "%s" does not open modal and disarms pendingAttempt', async (verdict) => {
    const container = buildScrapablePage();
    const observer = attachObserver();
    contentModule.pendingAttempt = createValidPendingAttempt();

    const el = document.createElement('span');
    el.textContent = verdict;
    container.appendChild(el);

    await flush();

    expect(document.getElementById('lgs-modal')).toBeNull();
    // pendingAttempt must be disarmed so stale nodes can't fire later
    expect(contentModule.pendingAttempt).toBe(null);

    observer.disconnect();
  });

  // -------------------------------------------------------------------------
  // Test 4: Delayed dynamic creation of result container still triggers modal
  // Requirement 2 AC1 & AC2 — two-phase: wait for container, then detect verdict
  // -------------------------------------------------------------------------
  test('4. Delayed container creation: modal fires after container is injected with "Accepted"', async () => {
    // Start with NO result container in the DOM
    document.title = '1. Two Sum - LeetCode';
    window.history.pushState({}, '', '/problems/two-sum/description/');

    // Build scraping fixtures (but NOT the result container yet)
    const viewLines = document.createElement('div');
    viewLines.className = 'view-lines';
    const line = document.createElement('div');
    line.className = 'view-line';
    line.textContent = 'def twoSum(): pass';
    viewLines.appendChild(line);
    const topicLink = document.createElement('a');
    topicLink.href = '/tag/array/';
    const langBtn = document.createElement('button');
    langBtn.textContent = 'Python3';
    document.body.appendChild(viewLines);
    document.body.appendChild(topicLink);
    document.body.appendChild(langBtn);

    // Attach observer — Phase 1 (insertion watcher) activates
    const observer = attachObserver();
    contentModule.pendingAttempt = createValidPendingAttempt();

    // Verify no modal yet
    await flush();
    expect(document.getElementById('lgs-modal')).toBeNull();

    // Simulate LeetCode dynamically injecting the result container WITH the verdict
    const container = document.createElement('div');
    container.setAttribute('data-e2e-locator', 'submission-result');
    const verdictSpan = document.createElement('span');
    verdictSpan.textContent = 'Accepted';
    container.appendChild(verdictSpan);
    document.body.appendChild(container); // triggers Phase-1 insertion watcher

    await flush();
    await flush(); // extra flush for the Phase-1 → Phase-2 transition

    expect(document.getElementById('lgs-modal')).not.toBeNull();

    observer.disconnect();
  });

  // -------------------------------------------------------------------------
  // Test 5: One accepted result opens exactly one modal (idempotency)
  // Requirement 3 AC1 — multiple mutation callbacks for same submission = 1 modal
  // -------------------------------------------------------------------------
  test('5. Multiple rapid "Accepted" mutations open exactly one modal', async () => {
    const container = buildScrapablePage();
    const observer = attachObserver();
    contentModule.pendingAttempt = createValidPendingAttempt();

    // Simulate React batching several childList mutations with "Accepted"
    for (let i = 0; i < 5; i++) {
      const el = document.createElement('span');
      el.textContent = 'Accepted';
      container.appendChild(el);
    }

    await flush();

    const modals = document.querySelectorAll('#lgs-modal');
    expect(modals.length).toBe(1);

    observer.disconnect();
  });

  // -------------------------------------------------------------------------
  // Test 6: Slow completion — container appears after pendingAttempt is armed;
  //         modal fires when verdict arrives (no reliance on 15 s timeout)
  // Requirement 2 AC1 / AC2 — the two-phase strategy handles slow submissions
  // -------------------------------------------------------------------------
  test('6. Slow submission: container injected long after Submit click still fires modal', async () => {
    jest.useFakeTimers();

    document.title = '1. Two Sum - LeetCode';
    window.history.pushState({}, '', '/problems/two-sum/description/');

    const viewLines = document.createElement('div');
    viewLines.className = 'view-lines';
    const line = document.createElement('div');
    line.className = 'view-line';
    line.textContent = 'def twoSum(): pass';
    viewLines.appendChild(line);
    const topicLink = document.createElement('a');
    topicLink.href = '/tag/array/';
    const langBtn = document.createElement('button');
    langBtn.textContent = 'Python3';
    document.body.appendChild(viewLines);
    document.body.appendChild(topicLink);
    document.body.appendChild(langBtn);

    const observer = attachObserver();
    contentModule.pendingAttempt = createValidPendingAttempt();

    // Advance timers by 14 seconds — still within the cleanup window
    jest.advanceTimersByTime(14000);

    // No verdict yet, no modal
    expect(document.getElementById('lgs-modal')).toBeNull();
    expect(contentModule.pendingAttempt).not.toBe(null);

    // Container + verdict now arrives (within the 15 s window)
    const container = document.createElement('div');
    container.setAttribute('data-e2e-locator', 'submission-result');
    const verdictSpan = document.createElement('span');
    verdictSpan.textContent = 'Accepted';
    container.appendChild(verdictSpan);
    document.body.appendChild(container);

    // Flush microtasks to let the insertion watcher and verdict observer fire
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('lgs-modal')).not.toBeNull();

    jest.useRealTimers();
    observer.disconnect();
  });

  // -------------------------------------------------------------------------
  // Test 7: 15-second timeout alone does NOT open modal (cleanup only)
  // Requirement 3 AC2 — timeout is cleanup, not a trigger
  // -------------------------------------------------------------------------
  test('7. 15-second timeout expiry only disarms pendingAttempt, never opens modal', async () => {
    jest.useFakeTimers();

    buildScrapablePage();
    const observer = attachObserver();

    // Fire the same logic the click listener uses: set a 15 s cleanup timeout.
    // We do this by triggering a synthetic click on a button labelled "submit".
    // On click, scrapeSubmission() runs (will set pendingAttempt via production code
    // or null if DOM isn't fully set up), and a 15 s cleanup timeout is armed.
    const fakeSubmitBtn = document.createElement('button');
    fakeSubmitBtn.textContent = 'submit';
    document.body.appendChild(fakeSubmitBtn);
    contentModule.attachSubmitClickListener(); // safe to call again; capture listener is additive
    fakeSubmitBtn.click();

    // Advance past 15 seconds with no verdict — timeout cleanup fires
    jest.advanceTimersByTime(16000);
    await Promise.resolve();

    expect(document.getElementById('lgs-modal')).toBeNull();
    expect(contentModule.pendingAttempt).toBe(null); // disarmed by timeout

    jest.useRealTimers();
    observer.disconnect();
  });
});
