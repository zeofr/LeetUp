/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/description-extraction.pbt.test.js
//
// Property-Based Tests for the description extraction fix
// ─────────────────────────────────────────────────────────────────────────────
// Property 1 — htmlToPlainText output never contains HTML markup tags
// Property 2 — htmlToPlainText output never contains raw HTML entities
// Property 3 — extractDescriptionFromNextData never throws
// Property 4 — Preservation: non-description fields unaffected by __NEXT_DATA__ content variation
// ─────────────────────────────────────────────────────────────────────────────
//
// **Validates: Requirements 2.1, 2.3, 3.1, 3.7**

'use strict';

const fc = require('fast-check');
const {
  htmlToPlainText,
  extractDescriptionFromNextData,
  scrapeSubmission,
} = require('../content');

// ---------------------------------------------------------------------------
// DOM helpers shared across property tests
// ---------------------------------------------------------------------------

/** Remove all __NEXT_DATA__ script tags, reset body and title. */
function resetDOM() {
  document.title = '';
  document.body.innerHTML = '';
  const existing = document.querySelector('script#__NEXT_DATA__[type="application/json"]');
  if (existing) existing.remove();
}

/**
 * Injects a raw <script id="__NEXT_DATA__" type="application/json"> element
 * with the provided string as its textContent.
 *
 * @param {string} rawContent - The verbatim text content of the script tag.
 */
function injectRawNextDataString(rawContent) {
  const old = document.querySelector('script#__NEXT_DATA__[type="application/json"]');
  if (old) old.remove();

  const script = document.createElement('script');
  script.id = '__NEXT_DATA__';
  script.type = 'application/json';
  script.textContent = rawContent;
  document.head.appendChild(script);
}

/**
 * Injects __NEXT_DATA__ with Path B shape (pageProps.question) where
 * question.content is set to the given value (or omitted when undefined).
 *
 * @param {*} contentValue - Value for question.content; pass undefined to omit the field.
 */
function injectNextDataPathB(contentValue) {
  const question = {
    questionFrontendId: '1',
    title: 'Two Sum',
    titleSlug: 'two-sum',
  };
  if (contentValue !== undefined) {
    question.content = contentValue;
  }
  injectRawNextDataString(JSON.stringify({ props: { pageProps: { question } } }));
}

/**
 * Builds the minimal DOM required for scrapeSubmission() to return a valid
 * non-null payload.  Optionally injects a content value into __NEXT_DATA__.
 *
 * @param {*} contentValue - Value for question.content (undefined = omit field).
 */
function buildMinimalDOM(contentValue) {
  document.title = '1. Two Sum - LeetCode';
  injectNextDataPathB(contentValue);
  document.body.innerHTML = `
    <div class="view-lines">
      <div class="view-line"><span>def twoSum(nums, target):</span></div>
      <div class="view-line"><span>    pass</span></div>
    </div>
    <a href="/tag/array/">Array</a>
    <button>Python3</button>
  `;
}

// ---------------------------------------------------------------------------
// Property 1 — htmlToPlainText output never contains HTML markup tags
//
// For any string input, htmlToPlainText(input) output never matches the
// pattern /<[a-zA-Z][^>]*>/ (opening HTML tags starting with a letter).
//
// **Validates: Requirements 2.3**
// ---------------------------------------------------------------------------

describe('Property 1 — htmlToPlainText output never contains HTML markup tags', () => {
  /**
   * Validates: Requirements 2.3
   */
  test('for any fc.string() input, output never matches /<[a-zA-Z][^>]*>/', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          const output = htmlToPlainText(input);
          // Must not contain an opening HTML tag (letter after <, then anything up to >)
          return !/<[a-zA-Z][^>]*>/.test(output);
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 — htmlToPlainText output never contains raw HTML entities
//
// For any string input, htmlToPlainText(input) output does not contain:
//   &lt;   &gt;   &amp;   &quot;   &#<digits>;
//
// **Validates: Requirements 2.3**
// ---------------------------------------------------------------------------

describe('Property 2 — htmlToPlainText output never contains raw HTML entities', () => {
  /**
   * Validates: Requirements 2.3
   */
  test('for any fc.string() input, output does not contain &lt;, &gt;, &amp;, &quot;, or &#digits;', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          const output = htmlToPlainText(input);
          if (output.includes('&lt;'))  return false;
          if (output.includes('&gt;'))  return false;
          if (output.includes('&amp;')) return false;
          if (output.includes('&quot;')) return false;
          // &#<digits>; numeric character references
          if (/&#\d+;/.test(output))   return false;
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 — extractDescriptionFromNextData never throws
//
// For any arbitrary JSON value serialized as the __NEXT_DATA__ script content,
// extractDescriptionFromNextData() always returns { html: string, found: boolean }
// without throwing.
//
// **Validates: Requirements 2.1, 2.2**
// ---------------------------------------------------------------------------

describe('Property 3 — extractDescriptionFromNextData never throws', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetDOM();
  });

  /**
   * Validates: Requirements 2.1, 2.2
   */
  test('for any fc.jsonValue() injected as __NEXT_DATA__, always returns { html: string, found: boolean } without throwing', () => {
    fc.assert(
      fc.property(
        fc.jsonValue(),
        (arbitraryJson) => {
          // Clean up any previous script tag
          const old = document.querySelector('script#__NEXT_DATA__[type="application/json"]');
          if (old) old.remove();

          // Inject the arbitrary JSON value as the __NEXT_DATA__ content
          injectRawNextDataString(JSON.stringify(arbitraryJson));

          let result;
          try {
            result = extractDescriptionFromNextData();
          } catch (e) {
            // Must never throw
            return false;
          }

          // Must return an object with exactly the two fields
          if (result === null || typeof result !== 'object') return false;
          if (typeof result.html !== 'string')    return false;
          if (typeof result.found !== 'boolean')  return false;

          return true;
        }
      ),
      { numRuns: 500 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 — Preservation: non-description fields unaffected by __NEXT_DATA__
//              content variation
//
// For scrapeSubmission() on a fixed minimal DOM, the fields:
//   problemNumber, problemSlug, language, domain, code
// must be identical regardless of whether __NEXT_DATA__ has a content field
// (a string value) or not (undefined / missing).
//
// **Validates: Requirements 3.1, 3.7**
// ---------------------------------------------------------------------------

describe('Property 4 — Preservation: non-description fields unaffected by __NEXT_DATA__ content variation', () => {
  // Expected fixed values for the minimal two-sum DOM
  const EXPECTED = {
    problemNumber: '0001',
    problemSlug:   'two-sum',
    language:      'Python3',
    domain:        'dsa',
  };

  const NON_DESC_FIELDS = ['problemNumber', 'problemSlug', 'language', 'domain', 'code'];

  beforeEach(() => {
    window.history.pushState({}, '', '/problems/two-sum/description/');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetDOM();
  });

  /**
   * Validates: Requirements 3.1, 3.7
   */
  test(
    'for any fc.option(fc.string()) content value, non-description fields always match expected values',
    () => {
      fc.assert(
        fc.property(
          // Vary only the content field: a string or undefined (nil)
          fc.option(fc.string(), { nil: undefined }),
          (contentValue) => {
            resetDOM();
            buildMinimalDOM(contentValue);

            const result = scrapeSubmission();

            // scrapeSubmission must not return null (the minimal DOM is always valid)
            if (result === null) return false;

            // Non-description fields must match the expected fixed values
            if (result.problemNumber !== EXPECTED.problemNumber) return false;
            if (result.problemSlug   !== EXPECTED.problemSlug)   return false;
            if (result.language      !== EXPECTED.language)       return false;
            if (result.domain        !== EXPECTED.domain)         return false;

            // code must be non-empty and contain the expected snippet
            if (!result.code)                             return false;
            if (!result.code.includes('def twoSum'))      return false;

            return true;
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  /**
   * Validates: Requirements 3.1, 3.7
   *
   * Additional check: verify that all non-description fields are identical
   * between a run with content and a run without content (deterministic baseline).
   */
  test(
    'non-description fields are identical between content present and content absent',
    () => {
      // Run 1: with a typical content string
      resetDOM();
      buildMinimalDOM('<p>Given an array of integers <code>nums</code>.</p>');
      const withContent = scrapeSubmission();

      // Run 2: without content field
      resetDOM();
      buildMinimalDOM(undefined);
      const withoutContent = scrapeSubmission();

      expect(withContent).not.toBeNull();
      expect(withoutContent).not.toBeNull();

      for (const field of NON_DESC_FIELDS) {
        expect(withContent[field]).toBe(withoutContent[field]);
      }
    }
  );
});
