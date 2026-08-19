/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/description-extraction-bug.test.js
//
// Bug Condition Exploration Test
// ─────────────────────────────────────────────────────────────────────────────
// PURPOSE: Confirm the bug exists on UNFIXED code.
//
// This test intentionally asserts the BROKEN behavior:
//   scrapeSubmission().description === ""
// even when __NEXT_DATA__ contains a valid question.content field.
//
// A PASSING test here means the bug is confirmed (the code does NOT read
// __NEXT_DATA__ for the description, and the five stale CSS selectors are all
// absent from the DOM, so description always comes back empty).
//
// When the fix is applied, this test will FAIL — which is the correct signal
// that the bug has been resolved.
// ─────────────────────────────────────────────────────────────────────────────

const { scrapeSubmission } = require('../content');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wipe title + body between tests. */
function resetDOM() {
  document.title = '';
  document.body.innerHTML = '';
}

/** Navigate to the two-sum problem URL via History API (jsdom-compatible). */
function setTwoSumLocation() {
  window.history.pushState({}, '', '/problems/two-sum/description/');
}

/**
 * Injects a __NEXT_DATA__ <script> tag into document.head.
 *
 * The JSON matches the Path B shape that the existing problem-number extraction
 * already relies on (data.props.pageProps.question.questionFrontendId), and it
 * also supplies a non-empty question.content HTML string — the field that the
 * unfixed code never reads.
 *
 * @param {string} contentHtml - The HTML string for question.content
 */
function injectNextData(contentHtml) {
  const nextData = {
    props: {
      pageProps: {
        question: {
          questionFrontendId: '1',
          title: 'Two Sum',
          titleSlug: 'two-sum',
          content: contentHtml,
        },
      },
    },
  };

  const script = document.createElement('script');
  script.id = '__NEXT_DATA__';
  script.type = 'application/json';
  script.textContent = JSON.stringify(nextData);
  document.head.appendChild(script);
}

/**
 * Builds a minimal DOM that satisfies all the OTHER requirements of
 * scrapeSubmission() so it returns a non-null payload — but deliberately
 * omits every one of the five stale CSS-selector description targets:
 *
 *   [data-cy="question-content"]
 *   [class*="question-content__JfgR"]
 *   .content__u3I1
 *   [class*="problem-statement"]
 *   [class*="description__"]
 *
 * This isolates the description extraction path cleanly.
 *
 * @param {string} contentHtml - Forwarded to injectNextData()
 */
function buildMinimalDOM(contentHtml) {
  document.title = '1. Two Sum - LeetCode';

  // Inject __NEXT_DATA__ with the valid question.content field
  injectNextData(contentHtml);

  // Code editor — required for scrapeSubmission() to succeed (returns null otherwise)
  document.body.innerHTML = `
    <div class="view-lines">
      <div class="view-line"><span>def twoSum(nums, target):</span></div>
      <div class="view-line"><span>    pass</span></div>
    </div>
    <a href="/tag/array/">Array</a>
    <button>Python3</button>
  `;
  // NOTE: No [data-cy="question-content"], no [class*="question-content__JfgR"],
  //       no .content__u3I1, no [class*="problem-statement"], no [class*="description__"].
  //       These are intentionally absent to trigger the bug condition.
}

// ---------------------------------------------------------------------------
// Bug Condition Exploration Tests
// ---------------------------------------------------------------------------

describe('Bug Condition: description extraction fails on unfixed code', () => {
  beforeEach(() => {
    setTwoSumLocation();
    resetDOM();
    // Silence expected console noise from scrapeSubmission internals
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── TC-BUG-1 ──────────────────────────────────────────────────────────────
  // __NEXT_DATA__ present with rich question.content HTML, no CSS selector targets.
  // Bug: description === "" because the code never reads __NEXT_DATA__.content.
  test(
    'TC-BUG-1: description is "" when __NEXT_DATA__ has question.content but no CSS selector elements exist',
    () => {
      const richContentHtml =
        '<p>Given an array of integers <code>nums</code> and an integer ' +
        '<code>target</code>, return <em>indices of the two numbers</em> such ' +
        'that they add up to <code>target</code>.</p>' +
        '<p>You may assume that each input would have <strong>exactly one solution' +
        '</strong>, and you may not use the same element twice.</p>' +
        '<ul><li><code>2 &lt;= nums.length &lt;= 10<sup>4</sup></code></li>' +
        '<li><code>-10<sup>9</sup> &lt;= nums[i] &lt;= 10<sup>9</sup></code></li>' +
        '<li><code>-10<sup>9</sup> &lt;= target &lt;= 10<sup>9</sup></code></li>' +
        '</ul>';

      buildMinimalDOM(richContentHtml);

      const result = scrapeSubmission();

      // scrapeSubmission() must return a payload (DOM is otherwise valid)
      expect(result).not.toBeNull();

      // ── BUG ASSERTION ──────────────────────────────────────────────────────
      // On unfixed code: description is "" because __NEXT_DATA__ content is ignored.
      // This assertion PASSES when the bug exists, FAILS when the fix is applied.
      expect(result.description).toBe('');
    }
  );

  // ── TC-BUG-2 ──────────────────────────────────────────────────────────────
  // Confirms all five stale selectors are absent (none resolve in this DOM).
  // This verifies our test DOM setup is correct and the bug trigger is genuine.
  test(
    'TC-BUG-2: none of the five stale CSS selector elements exist in the test DOM',
    () => {
      buildMinimalDOM('<p>Some description content here.</p>');

      // Verify every one of the five stale selectors is absent from the DOM
      expect(document.querySelector('[data-cy="question-content"]')).toBeNull();
      expect(document.querySelector('[class*="question-content__JfgR"]')).toBeNull();
      expect(document.querySelector('.content__u3I1')).toBeNull();
      expect(document.querySelector('[class*="problem-statement"]')).toBeNull();
      expect(document.querySelector('[class*="description__"]')).toBeNull();
    }
  );

  // ── TC-BUG-3 ──────────────────────────────────────────────────────────────
  // __NEXT_DATA__ is present and parseable with a non-empty content field.
  // This verifies the bug trigger: the data SOURCE is valid, but the code ignores it.
  test(
    'TC-BUG-3: __NEXT_DATA__ script is present and contains a non-empty question.content field',
    () => {
      const contentHtml = '<p>Valid problem content.</p>';
      buildMinimalDOM(contentHtml);

      const scriptEl = document.querySelector('script#__NEXT_DATA__[type="application/json"]');
      expect(scriptEl).not.toBeNull();

      const data = JSON.parse(scriptEl.textContent);
      const content =
        data?.props?.pageProps?.question?.content ??
        data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.question?.content ??
        data?.props?.pageProps?.data?.question?.content;

      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
    }
  );

  // ── TC-BUG-4 ──────────────────────────────────────────────────────────────
  // End-to-end: even with deeply nested dehydratedState path (Path A shape),
  // the unfixed code returns description === "".
  test(
    'TC-BUG-4: description is "" when __NEXT_DATA__ uses the dehydratedState path (Path A)',
    () => {
      // Inject __NEXT_DATA__ using the Path A shape (dehydratedState.queries[].state.data.question)
      const nextDataPathA = {
        props: {
          pageProps: {
            dehydratedState: {
              queries: [
                {
                  state: {
                    data: {
                      question: {
                        questionFrontendId: '1',
                        title: 'Two Sum',
                        titleSlug: 'two-sum',
                        content:
                          '<p>Given an array of integers <code>nums</code> and an integer ' +
                          '<code>target</code>, return indices of the two numbers such that ' +
                          'they add up to target.</p>',
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      };

      document.title = '1. Two Sum - LeetCode';

      const script = document.createElement('script');
      script.id = '__NEXT_DATA__';
      script.type = 'application/json';
      script.textContent = JSON.stringify(nextDataPathA);
      document.head.appendChild(script);

      document.body.innerHTML = `
        <div class="view-lines">
          <div class="view-line"><span>def twoSum(nums, target):</span></div>
          <div class="view-line"><span>    pass</span></div>
        </div>
        <a href="/tag/array/">Array</a>
        <button>Python3</button>
      `;

      const result = scrapeSubmission();

      expect(result).not.toBeNull();

      // ── BUG ASSERTION ──────────────────────────────────────────────────────
      // Unfixed code never consults __NEXT_DATA__ for content → always ""
      expect(result.description).toBe('');
    }
  );

  // ── TC-BUG-5 ──────────────────────────────────────────────────────────────
  // Sanity: when the [data-cy="question-content"] element IS present, the
  // existing CSS selector DOES find it (this proves the selector path works
  // when the DOM matches, validating our understanding of the code).
  // This test will continue to pass both before and after the fix.
  test(
    'TC-BUG-5 (sanity): description IS populated when [data-cy="question-content"] element exists',
    () => {
      document.title = '1. Two Sum - LeetCode';

      // Inject __NEXT_DATA__ for problem number extraction
      injectNextData('<p>Content from __NEXT_DATA__ (ignored by unfixed code).</p>');

      // DOM includes the stale selector element so the current code CAN find it
      document.body.innerHTML = `
        <div class="view-lines">
          <div class="view-line"><span>def twoSum(nums, target):</span></div>
          <div class="view-line"><span>    pass</span></div>
        </div>
        <a href="/tag/array/">Array</a>
        <button>Python3</button>
        <div data-cy="question-content">
          Given an array of integers nums and an integer target, return indices.
        </div>
      `;

      const result = scrapeSubmission();

      expect(result).not.toBeNull();
      // The [data-cy="question-content"] selector matches → description is non-empty
      expect(result.description).not.toBe('');
      expect(result.description.length).toBeGreaterThan(0);
    }
  );
});
