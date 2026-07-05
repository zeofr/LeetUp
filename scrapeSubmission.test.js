/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// scrapeSubmission.test.js — Unit tests for scrapeSubmission() in content.js
// Requires jsdom environment for document/window access.

const { scrapeSubmission } = require('./content');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resets document title and body between tests. */
function resetDOM() {
  document.title = '';
  document.body.innerHTML = '';
}

/**
 * Sets window.location pathname via History API (jsdom-compatible).
 * @param {string} path - e.g. "/problems/two-sum/"
 */
function setLocation(path) {
  window.history.pushState({}, '', path);
}

/**
 * Builds a minimal LeetCode-like DOM for scrapeSubmission to operate on.
 *
 * @param {object}  opts
 * @param {string}  opts.title            - document.title value
 * @param {string}  opts.language         - Language label in editor toolbar button
 * @param {string}  opts.code             - Multiline code (split into .view-line divs)
 * @param {string}  opts.topicHref        - href for topic tag anchor (e.g. "/tag/array/")
 * @param {string}  opts.descriptionText  - Text of the description container
 */
function buildDOM({
  title = '1. Two Sum - LeetCode',
  language = 'Python3',
  code = 'def twoSum(self, nums, target):\n    pass',
  topicHref = '/tag/array/',
  descriptionText = 'Given an array of integers, return indices of the two numbers.',
} = {}) {
  document.title = title;

  const codeLines = code
    .split('\n')
    .map(line => `<div class="view-line"><span>${line}</span></div>`)
    .join('');

  document.body.innerHTML = `
    <div>
      <div class="view-lines">
        ${codeLines}
      </div>
      <a href="${topicHref}">Array</a>
      <div data-cy="question-content">${descriptionText}</div>
      <button>${language}</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scrapeSubmission', () => {
  beforeEach(() => {
    setLocation('/problems/two-sum/description/');
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---- Happy path ----

  test('returns a complete payload for a well-formed page', () => {
    buildDOM();
    const result = scrapeSubmission();

    expect(result).not.toBeNull();
    expect(result.problemNumber).toBe('0001');
    expect(result.problemSlug).toBe('two-sum');
    expect(result.language).toBe('Python3');
    expect(result.fileExtension).toBe('.py');
    expect(result.domain).toBe('dsa');
    expect(result.topicSlug).toBe('array');
    expect(result.code).toBeTruthy();
    expect(result.description).toBeTruthy();
  });

  test('payload contains all required keys when scraping succeeds', () => {
    buildDOM();
    const result = scrapeSubmission();

    expect(result).not.toBeNull();
    const requiredKeys = [
      'problemNumber', 'problemSlug', 'problemTitle',
      'topicSlug', 'language', 'fileExtension', 'domain',
      'code', 'description',
    ];
    for (const key of requiredKeys) {
      expect(result).toHaveProperty(key);
    }
  });

  test('extracts problemSlug from URL pathname', () => {
    setLocation('/problems/longest-substring-without-repeating-characters/');
    buildDOM({
      title: '3. Longest Substring Without Repeating Characters - LeetCode',
    });

    const result = scrapeSubmission();

    expect(result).not.toBeNull();
    expect(result.problemSlug).toBe('longest-substring-without-repeating-characters');
    expect(result.problemNumber).toBe('0003');
  });

  test('fileExtension is derived from the detected language', () => {
    buildDOM({ language: 'Java' });
    const result = scrapeSubmission();

    expect(result).not.toBeNull();
    expect(result.language).toBe('Java');
    expect(result.fileExtension).toBe('.java');
  });

  test('domain is correctly derived as sql-databases for MySQL', () => {
    buildDOM({ language: 'MySQL' });
    const result = scrapeSubmission();

    expect(result).not.toBeNull();
    expect(result.domain).toBe('sql-databases');
  });

  test('domain is correctly derived as future-explorations for Bash', () => {
    buildDOM({ language: 'Bash' });
    const result = scrapeSubmission();

    expect(result).not.toBeNull();
    expect(result.domain).toBe('future-explorations');
  });

  test('strips leading "N. " prefix from problemTitle', () => {
    buildDOM({ title: '1. Two Sum - LeetCode' });
    const result = scrapeSubmission();

    expect(result).not.toBeNull();
    expect(result.problemTitle).not.toMatch(/^\d+\./);
  });

  // ---- Required field: problemNumber ----

  test('returns null and logs error with "problemNumber" when title has no number', () => {
    buildDOM({ title: 'LeetCode - The Coding Interview' });
    const result = scrapeSubmission();

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('problemNumber')
    );
  });

  // ---- Required field: code ----

  test('returns null and logs error with "code" when no editor lines are present', () => {
    document.title = '1. Two Sum - LeetCode';
    document.body.innerHTML = `
      <a href="/tag/array/">Array</a>
      <button>Python3</button>
      <div data-cy="question-content">Some description</div>
    `;
    const result = scrapeSubmission();

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('code')
    );
  });

  // ---- Required path component: topicSlug ----

  test('returns null and logs error with "topicSlug" when no topic tag links exist', () => {
    buildDOM();
    document.body.querySelectorAll('a').forEach(a => a.remove());

    const result = scrapeSubmission();

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('topicSlug')
    );
  });

  // ---- Required path component: problemSlug ----

  test('returns null and logs error when URL has no problem slug', () => {
    setLocation('/');
    buildDOM();

    const result = scrapeSubmission();

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  // ---- Optional field: description ----

  test('description is empty string when description element is absent', () => {
    document.title = '1. Two Sum - LeetCode';
    document.body.innerHTML = `
      <div class="view-lines">
        <div class="view-line"><span>def solve(): pass</span></div>
      </div>
      <a href="/tag/array/">Array</a>
      <button>Python3</button>
    `;

    const result = scrapeSubmission();

    if (result !== null) {
      expect(result.description).toBe('');
    }
  });
});
