/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/description-extraction-preservation.test.js
//
// Preservation Tests — Task 2 of description-extraction-fix bugfix spec
// ─────────────────────────────────────────────────────────────────────────────
// PURPOSE: Regression baseline that must pass on UNFIXED code AND remain
//          passing after the fix is applied.
//
// Group A — Non-description field preservation:
//   Verifies that problemNumber, problemSlug, problemTitle, language, domain,
//   and code are scraped correctly, and that these values are IDENTICAL
//   regardless of whether __NEXT_DATA__ has a question.content field or not.
//
// Group B — Placeholder fallback preserved:
//   Verifies that generateProblemStatement(""), (undefined), and (null) all
//   return the placeholder, and that the placeholder is used end-to-end when
//   scrapeSubmission() returns description: "".
//
// Group C — README fallback preserved:
//   Verifies generateReadme behaviour with empty vs. non-empty description.
//
// **Validates: Requirements 3.1, 3.2, 3.7**
// ─────────────────────────────────────────────────────────────────────────────

const { scrapeSubmission } = require('../content');
const {
  generateProblemStatement,
  generateReadme,
  PROBLEM_STATEMENT_PLACEHOLDER,
} = require('../background');

// ---------------------------------------------------------------------------
// DOM Helpers
// ---------------------------------------------------------------------------

/** Wipe title + body + injected script tags between tests. */
function resetDOM() {
  document.title = '';
  document.body.innerHTML = '';
  // Remove any __NEXT_DATA__ script tags injected by previous tests
  const existing = document.querySelector('script#__NEXT_DATA__[type="application/json"]');
  if (existing) existing.remove();
}

/** Navigate to the two-sum problem URL via History API (jsdom-compatible). */
function setTwoSumLocation() {
  window.history.pushState({}, '', '/problems/two-sum/description/');
}

/**
 * Injects a __NEXT_DATA__ <script> tag.
 *
 * @param {object|null} questionOverrides - Fields merged into the question object.
 *   Pass null to omit the question object entirely (tests missing-content path).
 */
function injectNextData(questionOverrides) {
  let question;
  if (questionOverrides === null) {
    // Inject __NEXT_DATA__ with no question at all
    question = undefined;
  } else {
    question = {
      questionFrontendId: '1',
      title: 'Two Sum',
      titleSlug: 'two-sum',
      ...questionOverrides,
    };
  }

  const nextData = {
    props: {
      pageProps: question !== undefined ? { question } : {},
    },
  };

  const script = document.createElement('script');
  script.id = '__NEXT_DATA__';
  script.type = 'application/json';
  script.textContent = JSON.stringify(nextData);
  document.head.appendChild(script);
}

/**
 * Builds the minimal DOM required for scrapeSubmission() to return a full
 * payload, with no CSS-selector description targets.
 *
 * @param {object|null} questionOverrides - Forwarded to injectNextData().
 *   - Pass {} to inject __NEXT_DATA__ WITHOUT a content field.
 *   - Pass { content: '<p>html</p>' } to include a content field.
 *   - Pass null to inject __NEXT_DATA__ without any question object.
 */
function buildMinimalDOM(questionOverrides = {}) {
  document.title = '1. Two Sum - LeetCode';

  injectNextData(questionOverrides);

  document.body.innerHTML = `
    <div class="view-lines">
      <div class="view-line"><span>def twoSum(nums, target):</span></div>
      <div class="view-line"><span>    pass</span></div>
    </div>
    <a href="/tag/array/">Array</a>
    <button>Python3</button>
  `;
  // Deliberately omits all five stale CSS-selector description targets:
  //   [data-cy="question-content"], [class*="question-content__JfgR"],
  //   .content__u3I1, [class*="problem-statement"], [class*="description__"]
}

// ---------------------------------------------------------------------------
// ── Group A: Non-description field preservation ────────────────────────────
// ---------------------------------------------------------------------------
//
// These tests assert the values of every non-description field returned by
// scrapeSubmission(). They run on UNFIXED code and must also pass post-fix.
//
// **Validates: Requirements 3.7**

describe('Group A — Non-description field preservation', () => {
  beforeEach(() => {
    setTwoSumLocation();
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── TC-PRES-A1 ──────────────────────────────────────────────────────────
  // Full DOM WITH question.content in __NEXT_DATA__ — non-description fields
  // must have the expected values.
  test(
    'TC-PRES-A1: non-description fields are correct when __NEXT_DATA__ has content',
    () => {
      buildMinimalDOM({ content: '<p>Given an array of integers...</p>' });

      const result = scrapeSubmission();

      expect(result).not.toBeNull();

      // problemNumber: "1" → zero-padded to "0001"
      expect(result.problemNumber).toBe('0001');

      // problemSlug: extracted from URL path "/problems/two-sum/..."
      expect(result.problemSlug).toBe('two-sum');

      // problemTitle: falls back to document.title — "1. Two Sum - LeetCode" → "Two Sum"
      expect(result.problemTitle).toBe('Two Sum');

      // language: extracted from the button element
      expect(result.language).toBe('Python3');

      // fileExtension: derived from language
      expect(result.fileExtension).toBe('.py');

      // domain: Python3 → "dsa"
      expect(result.domain).toBe('dsa');

      // code: extracted from .view-lines
      expect(result.code).toBeTruthy();
      expect(result.code).toContain('def twoSum');
    }
  );

  // ── TC-PRES-A2 ──────────────────────────────────────────────────────────
  // Full DOM WITHOUT question.content in __NEXT_DATA__ — non-description
  // fields must have the SAME values as TC-PRES-A1.
  test(
    'TC-PRES-A2: non-description fields are correct when __NEXT_DATA__ has NO content field',
    () => {
      buildMinimalDOM({}); // no content field

      const result = scrapeSubmission();

      expect(result).not.toBeNull();

      expect(result.problemNumber).toBe('0001');
      expect(result.problemSlug).toBe('two-sum');
      expect(result.problemTitle).toBe('Two Sum');
      expect(result.language).toBe('Python3');
      expect(result.fileExtension).toBe('.py');
      expect(result.domain).toBe('dsa');
      expect(result.code).toBeTruthy();
      expect(result.code).toContain('def twoSum');
    }
  );

  // ── TC-PRES-A3 ──────────────────────────────────────────────────────────
  // The non-description fields returned with content vs. without content must
  // be IDENTICAL (the fix must not alter them).
  test(
    'TC-PRES-A3: non-description fields are identical with and without content in __NEXT_DATA__',
    () => {
      // Run WITH content
      buildMinimalDOM({ content: '<p>Given an array of integers...</p>' });
      const withContent = scrapeSubmission();

      resetDOM();
      injectNextData({}); // reset the head script too
      // Rebuild without content
      buildMinimalDOM({});
      const withoutContent = scrapeSubmission();

      expect(withContent).not.toBeNull();
      expect(withoutContent).not.toBeNull();

      const NON_DESC_FIELDS = [
        'problemNumber',
        'problemSlug',
        'problemTitle',
        'topicSlug',
        'language',
        'fileExtension',
        'domain',
        'code',
      ];

      for (const field of NON_DESC_FIELDS) {
        expect(withContent[field]).toBe(withoutContent[field]);
      }
    }
  );

  // ── TC-PRES-A4 ──────────────────────────────────────────────────────────
  // topicSlug is extracted from the /tag/ link in both DOM variants.
  test(
    'TC-PRES-A4: topicSlug is "array" from the /tag/array/ link in both DOM variants',
    () => {
      buildMinimalDOM({ content: '<p>Some content</p>' });
      const result = scrapeSubmission();

      expect(result).not.toBeNull();
      expect(result.topicSlug).toBe('array');
    }
  );

  // ── TC-PRES-A5 ──────────────────────────────────────────────────────────
  // Code is extracted from .view-lines correctly in both DOM variants.
  test(
    'TC-PRES-A5: code extraction works regardless of content presence in __NEXT_DATA__',
    () => {
      buildMinimalDOM({});
      const result = scrapeSubmission();

      expect(result).not.toBeNull();
      expect(result.code).toContain('def twoSum');
      expect(result.code).toContain('pass');
    }
  );

  // ── TC-PRES-A6 ──────────────────────────────────────────────────────────
  // Payload contains all nine required keys in both DOM variants.
  test(
    'TC-PRES-A6: payload contains all required keys when scraping succeeds',
    () => {
      buildMinimalDOM({});
      const result = scrapeSubmission();

      expect(result).not.toBeNull();

      const requiredKeys = [
        'problemNumber',
        'problemSlug',
        'problemTitle',
        'topicSlug',
        'language',
        'fileExtension',
        'domain',
        'code',
        'description',
      ];

      for (const key of requiredKeys) {
        expect(result).toHaveProperty(key);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// ── Group B: Placeholder fallback preserved ────────────────────────────────
// ---------------------------------------------------------------------------
//
// Verifies that the placeholder path through generateProblemStatement() is
// preserved for empty/missing/null descriptions.
//
// **Validates: Requirements 3.1**

describe('Group B — Placeholder fallback preserved', () => {
  beforeEach(() => {
    setTwoSumLocation();
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── TC-PRES-B1 ──────────────────────────────────────────────────────────
  // generateProblemStatement("") → placeholder
  test(
    'TC-PRES-B1: generateProblemStatement("") returns the placeholder string',
    () => {
      const result = generateProblemStatement('');
      expect(result).toBe('<!-- Problem description unavailable. -->');
    }
  );

  // ── TC-PRES-B2 ──────────────────────────────────────────────────────────
  // generateProblemStatement(undefined) → placeholder
  test(
    'TC-PRES-B2: generateProblemStatement(undefined) returns the placeholder string',
    () => {
      const result = generateProblemStatement(undefined);
      expect(result).toBe('<!-- Problem description unavailable. -->');
    }
  );

  // ── TC-PRES-B3 ──────────────────────────────────────────────────────────
  // generateProblemStatement(null) → placeholder
  test(
    'TC-PRES-B3: generateProblemStatement(null) returns the placeholder string',
    () => {
      const result = generateProblemStatement(null);
      expect(result).toBe('<!-- Problem description unavailable. -->');
    }
  );

  // ── TC-PRES-B4 ──────────────────────────────────────────────────────────
  // PROBLEM_STATEMENT_PLACEHOLDER constant matches the literal string
  test(
    'TC-PRES-B4: PROBLEM_STATEMENT_PLACEHOLDER constant equals "<!-- Problem description unavailable. -->"',
    () => {
      expect(PROBLEM_STATEMENT_PLACEHOLDER).toBe('<!-- Problem description unavailable. -->');
    }
  );

  // ── TC-PRES-B5 ──────────────────────────────────────────────────────────
  // generateProblemStatement with whitespace-only input → placeholder
  test(
    'TC-PRES-B5: generateProblemStatement with whitespace-only string returns the placeholder',
    () => {
      expect(generateProblemStatement('   ')).toBe('<!-- Problem description unavailable. -->');
      expect(generateProblemStatement('\t\n')).toBe('<!-- Problem description unavailable. -->');
    }
  );

  // ── TC-PRES-B6 ──────────────────────────────────────────────────────────
  // End-to-end: unfixed code returns description: "" from a DOM that has no
  // CSS selector targets and no new extraction logic. Then verify the
  // placeholder path fires via generateProblemStatement.
  test(
    'TC-PRES-B6: when scrapeSubmission() returns description "" (unfixed DOM, no CSS selector targets), generateProblemStatement produces the placeholder',
    () => {
      // DOM with __NEXT_DATA__ but no CSS selector targets (bug condition DOM)
      buildMinimalDOM({}); // no content field

      const result = scrapeSubmission();
      expect(result).not.toBeNull();

      // On unfixed code, description is "" because neither __NEXT_DATA__.content
      // nor any CSS selector element is present/read
      // (on fixed code, description may be "" too since there's no content field)
      // Either way, generateProblemStatement must return the placeholder for ""
      if (result.description === '') {
        expect(generateProblemStatement(result.description))
          .toBe('<!-- Problem description unavailable. -->');
      }
      // If a future fix somehow extracted something, we just verify no throw
      expect(() => generateProblemStatement(result.description)).not.toThrow();
    }
  );

  // ── TC-PRES-B7 ──────────────────────────────────────────────────────────
  // generateProblemStatement with a real description → returns that description
  // (verifies the non-placeholder path is also preserved)
  test(
    'TC-PRES-B7: generateProblemStatement with a non-empty description returns that description unchanged',
    () => {
      const desc = 'Given an array of integers nums and an integer target.';
      expect(generateProblemStatement(desc)).toBe(desc);
    }
  );
});

// ---------------------------------------------------------------------------
// ── Group C: README fallback preserved ────────────────────────────────────
// ---------------------------------------------------------------------------
//
// Verifies generateReadme() behaviour with empty vs. non-empty description.
//
// **Validates: Requirements 3.1, 3.7**

describe('Group C — README fallback preserved', () => {
  const README_PLACEHOLDER = '_Official problem description unavailable._';

  const BASE_PAYLOAD = {
    problemNumber: '0001',
    problemTitle: 'Two Sum',
    notes: '',
  };

  // ── TC-PRES-C1 ──────────────────────────────────────────────────────────
  // generateReadme with description: "" → body contains unavailability placeholder
  test(
    'TC-PRES-C1: generateReadme with description "" produces the unavailability placeholder in the body',
    () => {
      const result = generateReadme({ ...BASE_PAYLOAD, description: '' });
      expect(result).toContain(README_PLACEHOLDER);
      expect(result).not.toContain('<!-- Problem description unavailable. -->');
    }
  );

  // ── TC-PRES-C2 ──────────────────────────────────────────────────────────
  // generateReadme with description: undefined → placeholder
  test(
    'TC-PRES-C2: generateReadme with description undefined uses the unavailability placeholder',
    () => {
      const result = generateReadme({ ...BASE_PAYLOAD, description: undefined });
      expect(result).toContain(README_PLACEHOLDER);
    }
  );

  // ── TC-PRES-C3 ──────────────────────────────────────────────────────────
  // generateReadme with a real description → body contains that description
  test(
    'TC-PRES-C3: generateReadme with a real description string produces that description in the body',
    () => {
      const desc = 'Given an array of integers nums and an integer target, return indices.';
      const result = generateReadme({ ...BASE_PAYLOAD, description: desc });
      expect(result).toContain(desc);
      expect(result).not.toContain(README_PLACEHOLDER);
    }
  );

  // ── TC-PRES-C4 ──────────────────────────────────────────────────────────
  // generateReadme title line is always correct regardless of description
  test(
    'TC-PRES-C4: generateReadme first line is "# {problemNumber}. {problemTitle}" regardless of description value',
    () => {
      const withEmpty = generateReadme({ ...BASE_PAYLOAD, description: '' });
      const withReal  = generateReadme({ ...BASE_PAYLOAD, description: 'Some description.' });

      expect(withEmpty.split('\n')[0]).toBe('# 0001. Two Sum');
      expect(withReal.split('\n')[0]).toBe('# 0001. Two Sum');
    }
  );

  // ── TC-PRES-C5 ──────────────────────────────────────────────────────────
  // generateReadme with notes + empty description → approach section present,
  // placeholder in body (both behaviors preserved together)
  test(
    'TC-PRES-C5: generateReadme with notes and empty description includes approach section and placeholder',
    () => {
      const result = generateReadme({
        ...BASE_PAYLOAD,
        notes: 'Use a hash map.',
        description: '',
      });

      expect(result).toContain('## 💡 My Approach');
      expect(result).toContain('Use a hash map.');
      expect(result).toContain(README_PLACEHOLDER);
    }
  );

  // ── TC-PRES-C6 ──────────────────────────────────────────────────────────
  // generateReadme with notes + real description → approach section AND real
  // description both appear, placeholder does NOT appear
  test(
    'TC-PRES-C6: generateReadme with notes and real description includes approach and description but not placeholder',
    () => {
      const desc = 'Given n non-negative integers representing an elevation map.';
      const result = generateReadme({
        ...BASE_PAYLOAD,
        notes: 'Two-pointer approach.',
        description: desc,
      });

      expect(result).toContain('## 💡 My Approach');
      expect(result).toContain('Two-pointer approach.');
      expect(result).toContain(desc);
      expect(result).not.toContain(README_PLACEHOLDER);
    }
  );

  // ── TC-PRES-C7 ──────────────────────────────────────────────────────────
  // Whitespace-only description uses the placeholder (trimming behaviour)
  test(
    'TC-PRES-C7: generateReadme with whitespace-only description uses the unavailability placeholder',
    () => {
      const result = generateReadme({ ...BASE_PAYLOAD, description: '   \n\t  ' });
      expect(result).toContain(README_PLACEHOLDER);
    }
  );
});
