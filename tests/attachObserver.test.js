/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/attachObserver.test.js — Unit tests for attachObserver() in content.js
// Requirements: 2.1, 2.2, 2.3, 2.8

const contentModule = require('../content');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset document body and isModalOpen flag between tests. */
function resetDOM() {
  document.body.innerHTML = '';
  contentModule.isModalOpen = false;
}

/** Build a minimal result panel that attachObserver can target. */
function buildResultPanel() {
  const panel = document.createElement('div');
  panel.setAttribute('data-e2e-locator', 'submission-result');
  document.body.appendChild(panel);
  return panel;
}

/**
 * Build a minimal valid LeetCode page DOM so scrapeSubmission() can succeed.
 * attachObserver only calls injectModal when scraping succeeds.
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
  line.innerHTML = '<span>def twoSum(): pass</span>';
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

// Wait for any microtasks/promise chains to flush (MutationObserver callbacks
// are synchronous in jsdom, but this keeps tests robust).
function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('attachObserver', () => {
  beforeEach(() => {
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---- Target panel detection ----

  test('returns null and logs a warning when result panel is not in DOM', () => {
    const observer = contentModule.attachObserver();
    expect(observer).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('submission result panel not found')
    );
  });

  test('returns a MutationObserver instance when result panel is found', () => {
    buildResultPanel();
    const observer = contentModule.attachObserver();
    expect(observer).not.toBeNull();
    expect(observer).toBeInstanceOf(MutationObserver);
    observer.disconnect();
  });

  // ---- "Accepted" detection — text inserted as a child node ----

  test('calls injectModal when a new text node with "Accepted" is added', async () => {
    const panel = buildScrapablePage();
    const injectSpy = jest.spyOn(contentModule, 'injectModal' in contentModule
      ? 'injectModal'
      : 'attachObserver'); // spy on injectModal if exported, otherwise we
    // verify via DOM side-effect (#lgs-modal appears)

    const observer = contentModule.attachObserver();

    // Simulate LeetCode inserting "Accepted" into the result panel.
    const textNode = document.createTextNode('Accepted');
    const statusEl = document.createElement('span');
    statusEl.appendChild(textNode);
    panel.appendChild(statusEl);

    await flushMicrotasks();

    // injectModal is not exported, so verify its DOM side-effect.
    expect(document.getElementById('lgs-modal')).not.toBeNull();
    expect(contentModule.isModalOpen).toBe(true);

    observer.disconnect();
    injectSpy.mockRestore?.();
  });

  test('DOES inject modal when "Accepted" has leading/trailing whitespace (trim applied per spec)', async () => {
    // The spec says: "scan for a text node containing exactly 'Accepted' (strict equality after trim)"
    // So ' Accepted ' trimmed → 'Accepted' → IS a match.
    const panel = buildScrapablePage();
    const observer = contentModule.attachObserver();

    const textNode = document.createTextNode(' Accepted ');
    panel.appendChild(textNode);

    await flushMicrotasks();

    expect(document.getElementById('lgs-modal')).not.toBeNull();
    expect(contentModule.isModalOpen).toBe(true);

    observer.disconnect();
  });

  test('does NOT inject modal for "Wrong Answer"', async () => {
    const panel = buildScrapablePage();
    const observer = contentModule.attachObserver();

    const el = document.createElement('span');
    el.textContent = 'Wrong Answer';
    panel.appendChild(el);

    await flushMicrotasks();

    expect(document.getElementById('lgs-modal')).toBeNull();
    expect(contentModule.isModalOpen).toBe(false);

    observer.disconnect();
  });

  test('does NOT inject modal for "Time Limit Exceeded"', async () => {
    const panel = buildScrapablePage();
    const observer = contentModule.attachObserver();

    const el = document.createElement('span');
    el.textContent = 'Time Limit Exceeded';
    panel.appendChild(el);

    await flushMicrotasks();

    expect(document.getElementById('lgs-modal')).toBeNull();

    observer.disconnect();
  });

  test('does NOT inject modal for "Runtime Error"', async () => {
    const panel = buildScrapablePage();
    const observer = contentModule.attachObserver();

    const el = document.createElement('span');
    el.textContent = 'Runtime Error';
    panel.appendChild(el);

    await flushMicrotasks();

    expect(document.getElementById('lgs-modal')).toBeNull();

    observer.disconnect();
  });

  // ---- isModalOpen guard — no duplicate modals (Requirement 2.8) ----

  test('does NOT inject a second modal when isModalOpen is already true', async () => {
    const panel = buildScrapablePage();
    contentModule.isModalOpen = true; // simulate a modal already being open

    const observer = contentModule.attachObserver();

    const el = document.createElement('span');
    el.textContent = 'Accepted';
    panel.appendChild(el);

    await flushMicrotasks();

    // Modal element should NOT have been injected because flag was already set.
    expect(document.getElementById('lgs-modal')).toBeNull();

    observer.disconnect();
  });

  test('does NOT inject a second modal when first mutation already opened modal', async () => {
    const panel = buildScrapablePage();
    const observer = contentModule.attachObserver();

    // First accepted trigger
    const el1 = document.createElement('span');
    el1.textContent = 'Accepted';
    panel.appendChild(el1);
    await flushMicrotasks();

    const firstModal = document.getElementById('lgs-modal');
    expect(firstModal).not.toBeNull();

    // Second accepted trigger while modal is open
    const el2 = document.createElement('span');
    el2.textContent = 'Accepted';
    panel.appendChild(el2);
    await flushMicrotasks();

    const modals = document.querySelectorAll('#lgs-modal');
    expect(modals.length).toBe(1);

    observer.disconnect();
  });

  // ---- characterData mutation (text content updated in-place) ----

  test('detects "Accepted" via characterData mutation', async () => {
    const panel = buildScrapablePage();
    const observer = contentModule.attachObserver();

    // Insert a text node that will be mutated
    const textNode = document.createTextNode('Pending');
    panel.appendChild(textNode);

    await flushMicrotasks();

    // Now mutate its data to "Accepted"
    textNode.data = 'Accepted';

    await flushMicrotasks();

    expect(document.getElementById('lgs-modal')).not.toBeNull();
    expect(contentModule.isModalOpen).toBe(true);

    observer.disconnect();
  });

  // ---- scrapeSubmission failure — no modal if scraping fails ----

  test('does NOT inject modal when scrapeSubmission returns null', async () => {
    // Build a panel but WITHOUT a valid DOM (so scrapeSubmission will fail)
    const panel = document.createElement('div');
    panel.setAttribute('data-e2e-locator', 'submission-result');
    document.body.appendChild(panel);
    // No view-lines, no topic link, no code → scrapeSubmission returns null

    const observer = contentModule.attachObserver();

    const el = document.createElement('span');
    el.textContent = 'Accepted';
    panel.appendChild(el);

    await flushMicrotasks();

    expect(document.getElementById('lgs-modal')).toBeNull();
    expect(contentModule.isModalOpen).toBe(false);

    observer.disconnect();
  });

  // ---- Observer targets the correct element ----

  test('falls back to class-based result selector when e2e-locator is absent', () => {
    const panel = document.createElement('div');
    panel.className = 'result__abc123';
    document.body.appendChild(panel);

    const observer = contentModule.attachObserver();
    expect(observer).not.toBeNull();
    observer.disconnect();
  });
});
