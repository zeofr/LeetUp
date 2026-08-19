// content.js — Content Script
// Attaches a MutationObserver to the LeetCode submission result panel,
// detects accepted submissions, scrapes problem data, and injects the
// modal overlay for user notes before forwarding the push payload to
// the background service worker.

// ---------------------------------------------------------------------------
// Language-to-Extension Mapping (Requirement 3.1)
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} */
const LANG_MAP = new Map([
  ['python3',        '.py'],
  ['python',         '.py'],
  ['java',           '.java'],
  ['javascript',     '.js'],
  ['typescript',     '.ts'],
  ['c++',            '.cpp'],
  ['c',              '.c'],
  ['c#',             '.cs'],
  ['go',             '.go'],
  ['rust',           '.rs'],
  ['kotlin',         '.kt'],
  ['swift',          '.swift'],
  ['ruby',           '.rb'],
  ['scala',          '.scala'],
  ['php',            '.php'],
  ['mysql',          '.sql'],
  ['ms sql server',  '.sql'],
  ['oracle',         '.sql'],
  ['bash',           '.sh'],
]);

/**
 * Maps a LeetCode submission language label to the corresponding file extension.
 *
 * The lookup is case-insensitive and whitespace-tolerant: input is trimmed and
 * lowercased before comparison. If the language is not in LANG_MAP, returns
 * ".txt" and emits a console warning containing the verbatim input string.
 *
 * Requirements: 3.1, 3.2
 *
 * @param {string} language - The submission language label (e.g. "Python3").
 * @returns {string} File extension including the leading dot (e.g. ".py").
 */
function getFileExtension(language) {
  const normalized = language.trim().toLowerCase();
  if (LANG_MAP.has(normalized)) {
    return LANG_MAP.get(normalized);
  }
  console.warn(`[LeetUp] Unrecognized language: ${language}`);
  return '.txt';
}

// ---------------------------------------------------------------------------
// Domain Classification (Requirements 4.1, 4.2, 4.3)
// ---------------------------------------------------------------------------

const SQL_LANGUAGES  = new Set(['mysql', 'ms sql server', 'oracle']);
const BASH_LANGUAGES = new Set(['bash']);

/**
 * Classifies a submission language into one of three repository top-level
 * domains: "sql-databases", "shell-scripting", or "dsa".
 *
 * Input is normalized via .trim().toLowerCase() before classification:
 *  - "mysql", "ms sql server", "oracle" → "sql-databases"
 *  - "bash"                             → "shell-scripting"
 *  - everything else                    → "dsa"
 *
 * Requirements: 4.1, 4.2, 4.3
 *
 * @param {string} language - The submission language label from LeetCode.
 * @returns {"dsa"|"sql-databases"|"shell-scripting"} Domain string.
 */
function getDomain(language) {
  const normalized = language.trim().toLowerCase();
  if (SQL_LANGUAGES.has(normalized)) {
    console.info('[LeetUp] domain: sql-databases (language: ' + normalized + ')');
    return 'sql-databases';
  }
  if (BASH_LANGUAGES.has(normalized)) {
    console.info('[LeetUp] domain: shell-scripting (language: ' + normalized + ')');
    return 'shell-scripting';
  }
  console.info('[LeetUp] domain: dsa (language: ' + normalized + ')');
  return 'dsa';
}

// ---------------------------------------------------------------------------
// Repository Path Construction (Requirements 4.4, 4.5)
// ---------------------------------------------------------------------------

/**
 * Constructs the repository target path for a problem's folder.
 *
 * The path format is:
 *   `{domain}/{paddedNumber}-{problemSlug}/`
 * where `problemNumber` is zero-padded to 4 digits.
 *
 * The topic slug is intentionally omitted — a LeetCode problem fits multiple
 * categories and the primary tag often does not reflect how the problem was
 * actually solved. Using number + slug gives a stable, unambiguous path.
 *
 * Returns null and logs a console.error if any argument is falsy.
 *
 * Requirements: 4.4
 *
 * @param {string} domain        - Top-level domain folder (e.g. "dsa").
 * @param {number|string} problemNumber - Numeric problem ID (e.g. 1 → "0001").
 * @param {string} problemSlug   - Kebab-case problem identifier (e.g. "two-sum").
 * @returns {string|null} The repository path string, or null if any arg is falsy.
 */
function buildRepoPath(domain, problemNumber, problemSlug) {
  // Validate all required arguments — any falsy value is an error
  const args = { domain, problemNumber, problemSlug };
  for (const [name, value] of Object.entries(args)) {
    if (!value && value !== 0) {
      console.error(`[LeetUp] buildRepoPath: missing required argument "${name}"`);
      return null;
    }
  }

  // Zero-pad the problem number to 4 digits
  const paddedNumber = String(Number(problemNumber)).padStart(4, '0');

  return `${domain}/${paddedNumber}-${problemSlug}/`;
}

// ---------------------------------------------------------------------------
// Topic Slug Fallback (Requirement 4.5)
// ---------------------------------------------------------------------------

/**
 * Derives a best-effort topic slug from the problem slug when the LeetCode
 * topic tag is not available in the DOM (e.g. hidden behind a toggle).
 *
 * Checks a list of known common prefixes, then falls back to the first
 * hyphen-separated segment, or "uncategorized" as a last resort.
 *
 * @param {string} problemSlug - Kebab-case problem identifier (e.g. "two-sum").
 * @returns {string} A topic slug string.
 */
function deriveTopicSlugFallback(problemSlug) {
  const KNOWN_PREFIXES = ['array', 'string', 'tree', 'graph', 'linked-list', 'binary', 'dynamic', 'stack', 'queue', 'hash'];
  for (const prefix of KNOWN_PREFIXES) {
    if (problemSlug.startsWith(prefix)) {
      return prefix;
    }
  }
  const firstSegment = problemSlug.split('-')[0];
  if (firstSegment && firstSegment.length > 2) {
    return firstSegment;
  }
  return 'uncategorized';
}

// ---------------------------------------------------------------------------
// HTML-to-Plain-Text Conversion Helper
// ---------------------------------------------------------------------------

/**
 * Converts a raw HTML string (e.g. from __NEXT_DATA__ question.content) into
 * clean, Markdown-compatible plain text.
 *
 * Steps:
 *  1. Guard — returns "" for null, undefined, or empty input.
 *  2. Replace block-level closing tags (</p>, </div>, </li>, </pre>,
 *     </h1>–</h6>) with "\n" for readable line breaks.
 *  3. Replace <br> and <br/> with "\n".
 *  4. Strip all remaining HTML tags with /<[^>]+>/g.
 *  5. Decode HTML entities via a temporary DOM textarea element.
 *  6. Normalize whitespace: collapse 3+ consecutive newlines to 2,
 *     trim leading/trailing whitespace from each line, trim overall result.
 *
 * @param {string|null|undefined} html - Raw HTML string to convert.
 * @returns {string} Clean plain-text string, or "" for empty/null input.
 */
function htmlToPlainText(html) {
  // Step 1: Guard — return "" for null, undefined, or empty input
  if (html == null || html === '') return '';

  // Step 2: Replace block-level closing tags with newlines
  let text = html
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/pre>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n');

  // Step 3: Replace <br> / <br/> with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Step 4: Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Step 5: Decode HTML entities via a temporary DOM textarea element.
  // This naturally handles &lt; &gt; &amp; &quot; &#39; and all numeric entities.
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    text = el.value;
  }

  // Step 6: Normalize whitespace
  // Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // Trim leading/trailing whitespace from each line
  text = text.split('\n').map(line => line.trim()).join('\n');
  // Trim overall result
  text = text.trim();

  return text;
}

// ---------------------------------------------------------------------------
// __NEXT_DATA__ Description Extraction Helper
// ---------------------------------------------------------------------------

/**
 * Traverses the `__NEXT_DATA__` JSON script element to extract the raw HTML
 * string for the problem description from `question.content`.
 *
 * Tries three traversal paths in order:
 *  - Path A (dehydratedState): data.props.pageProps.dehydratedState.queries[*].state.data.question
 *  - Path B (direct):          data.props.pageProps.question
 *  - Path C (nested data):     data.props.pageProps.data.question
 *
 * Only reads `question.content` — no other field on the question object is accessed.
 *
 * @returns {{ html: string, found: boolean }}
 *   `found: true` with the raw HTML string when a non-empty `content` is found;
 *   `found: false` with `html: ""` on any failure (script absent, parse error,
 *   invalid structure, or no non-empty `content` at any path).
 */
function extractDescriptionFromNextData() {
  // Step 1: Locate the __NEXT_DATA__ script element
  const script = document.querySelector('script#__NEXT_DATA__[type="application/json"]');
  if (script === null) {
    return { html: '', found: false };
  }

  // Step 2: Parse JSON — abort on parse error
  let data;
  try {
    data = JSON.parse(script.textContent);
  } catch (e) {
    return { html: '', found: false };
  }

  // Step 3: Validate top-level structure
  if (typeof data !== 'object' || data === null) {
    return { html: '', found: false };
  }
  if (typeof data.props !== 'object' || data.props === null) {
    return { html: '', found: false };
  }
  if (typeof data.props.pageProps !== 'object' || data.props.pageProps === null) {
    return { html: '', found: false };
  }

  // Step 4: Try three traversal paths to locate the question object
  let question = null;

  // Path A: dehydratedState.queries — iterate all entries
  const pathA = data.props.pageProps.dehydratedState;
  if (typeof pathA === 'object' && pathA !== null) {
    const queries = pathA.queries;
    if (Array.isArray(queries)) {
      for (const query of queries) {
        const candidate = query &&
          typeof query.state === 'object' && query.state !== null
            ? (typeof query.state.data === 'object' && query.state.data !== null
                ? query.state.data.question
                : undefined)
            : undefined;
        if (
          typeof candidate === 'object' &&
          candidate !== null &&
          typeof candidate.content === 'string' &&
          candidate.content.length > 0
        ) {
          question = candidate;
          break;
        }
      }
    }
  }

  // Path B: data.props.pageProps.question
  if (question === null) {
    const candidate = data.props.pageProps.question;
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      typeof candidate.content === 'string'
    ) {
      question = candidate;
    }
  }

  // Path C: data.props.pageProps.data.question
  if (question === null) {
    const pagePropsData = data.props.pageProps.data;
    if (typeof pagePropsData === 'object' && pagePropsData !== null) {
      const candidate = pagePropsData.question;
      if (
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof candidate.content === 'string'
      ) {
        question = candidate;
      }
    }
  }

  // Step 5: Validate the content field
  if (question === null) {
    return { html: '', found: false };
  }

  const content = question.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { html: '', found: false };
  }

  return { html: content, found: true };
}

// ---------------------------------------------------------------------------
// DOM Scraping (Requirements 2.4, 2.5, 2.6, 4.5)
// ---------------------------------------------------------------------------

/**
 * Scrapes the active LeetCode problem page and returns a submission payload
 * object, or null if any required field cannot be determined.
 *
 * Extracted fields:
 *  - problemNumber  {string}  4-digit zero-padded (e.g. "0001")
 *  - problemSlug    {string}  kebab-case slug from URL (e.g. "two-sum")
 *  - problemTitle   {string}  display title from heading (empty string fallback)
 *  - topicSlug      {string}  primary topic tag (empty string fallback)
 *  - language       {string}  submission language from the code editor selector
 *  - fileExtension  {string}  derived via getFileExtension(language)
 *  - domain         {string}  derived via getDomain(language)
 *  - code           {string}  solution code body from the code editor
 *  - description    {string}  official problem description (empty string fallback)
 *
 * Returns null (with console.error) when:
 *  - problemNumber or code is unavailable
 *  - any path component (domain, topicSlug, problemNumber, problemSlug) is missing
 *
 * Requirements: 2.4, 2.5, 2.6, 4.5
 *
 * @returns {Object|null} Scraped payload object or null on failure.
 */
function scrapeSubmission() {
  if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] scrapeSubmission called`);
    console.log(`[LeetUp:DIAG] - URL pathname: ${window.location.pathname}`);
    console.log(`[LeetUp:DIAG] - document.title: "${document.title}"`);
  }

  // ------------------------------------------------------------------
  // 1. Problem slug — derived from URL pathname
  //    e.g. https://leetcode.com/problems/two-sum/description/
  //         → "two-sum"
  // ------------------------------------------------------------------
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  // pathname: ["problems", "two-sum", ...]
  const problemSlug = (pathParts[0] === 'problems' && pathParts[1])
    ? pathParts[1]
    : '';

  if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] problemSlug extracted: "${problemSlug}"`);
  }

  // ------------------------------------------------------------------
  // 2. Problem number — from page <title> or breadcrumb/heading text
  //    LeetCode titles are typically: "1. Two Sum - LeetCode"
  //    Try <title> first, then fall back to the main problem heading.
  // ------------------------------------------------------------------
  let problemNumber = '';
  let extractionMethod = '';

  // Attempt 1: document.title  ("1. Two Sum - LeetCode")
  const titleMatch = document.title.match(/^(\d+)\./);
  if (titleMatch) {
    problemNumber = String(Number(titleMatch[1])).padStart(4, '0');
    extractionMethod = 'document.title';
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] ✓ Extraction method: document.title`);
      console.log(`[LeetUp:DIAG] ✓ Problem number: "${problemNumber}" (raw: ${titleMatch[1]})`);
    }
  } else if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] ✗ document.title did not match pattern /^(\\d+)\\./`);
  }

  // Attempt 2: heading element inside the problem content area
  // LeetCode renders the problem title as an <a> or heading containing "N. Title"
  if (!problemNumber) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Attempting heading selectors...`);
    }

    const headingSelectors = [
      '[data-cy="question-title"]',
      '.mr-2.text-label-1',
      'a[href*="/problems/"] .text-title-large',
      '[class*="text-title"]',
      '[class*="question-title"]',
      'h4', 'h3', 'h2', 'h1',
      '[class*="title"]',
    ];

    for (const selector of headingSelectors) {
      const headingEl = document.querySelector(selector);
      if (headingEl) {
        const text = headingEl.textContent.trim();
        const m = text.match(/^(\d+)\./);
        if (m) {
          problemNumber = String(Number(m[1])).padStart(4, '0');
          extractionMethod = `heading selector: ${selector}`;
          if (ENABLE_DIAGNOSTICS) {
            console.log(`[LeetUp:DIAG] ✓ Extraction method: heading selector "${selector}"`);
            console.log(`[LeetUp:DIAG] ✓ Problem number: "${problemNumber}" (raw: ${m[1]})`);
            console.log(`[LeetUp:DIAG] ✓ Element text: "${text.substring(0, 50)}"`);
          }
          break;
        } else if (ENABLE_DIAGNOSTICS) {
          console.log(`[LeetUp:DIAG] ✗ Selector "${selector}" found but text did not match /^(\\d+)\\./ pattern`);
          console.log(`[LeetUp:DIAG]   Text preview: "${text.substring(0, 50)}"`);
        }
      } else if (ENABLE_DIAGNOSTICS) {
        console.log(`[LeetUp:DIAG] ✗ Selector "${selector}" not found in DOM`);
      }
    }
  }

  // Attempt 3: Extract from URL if it contains the number
  // e.g., some LeetCode URLs might have ?id=54 or similar
  if (!problemNumber) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Attempting URL parameters...`);
    }
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id') || urlParams.get('problemId') || urlParams.get('qid');
    if (idParam && /^\d+$/.test(idParam)) {
      problemNumber = String(Number(idParam)).padStart(4, '0');
      extractionMethod = 'URL parameter';
      if (ENABLE_DIAGNOSTICS) {
        console.log(`[LeetUp:DIAG] ✓ Extraction method: URL parameter`);
        console.log(`[LeetUp:DIAG] ✓ Problem number: "${problemNumber}" (raw: ${idParam})`);
      }
    } else if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] ✗ No valid URL parameters found (checked: id, problemId, qid)`);
    }
  }

  // Attempt 4: Check if problem number is embedded in page JSON/script tags
  if (!problemNumber) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Attempting script tag extraction...`);
    }
    const scripts = document.querySelectorAll('script');
    let scriptCheckCount = 0;
    
    // First try __NEXT_DATA__ which is commonly used by Next.js (LeetCode's framework)
    for (const script of scripts) {
      if (script.id === '__NEXT_DATA__' && script.type === 'application/json') {
        try {
          const data = JSON.parse(script.textContent);
          // Navigate through common Next.js data structures
          const questionId = 
            data?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.question?.questionFrontendId ||
            data?.props?.pageProps?.question?.questionFrontendId ||
            data?.props?.pageProps?.data?.question?.questionFrontendId;
          
          if (questionId) {
            problemNumber = String(Number(questionId)).padStart(4, '0');
            extractionMethod = '__NEXT_DATA__ JSON';
            if (ENABLE_DIAGNOSTICS) {
              console.log(`[LeetUp:DIAG] ✓ Extraction method: __NEXT_DATA__ JSON`);
              console.log(`[LeetUp:DIAG] ✓ Problem number: "${problemNumber}" (raw: ${questionId})`);
            }
            break;
          }
        } catch (e) {
          // Invalid JSON, continue to other methods
          if (ENABLE_DIAGNOSTICS) {
            console.log(`[LeetUp:DIAG] ✗ __NEXT_DATA__ found but JSON parse failed`);
          }
        }
      }
    }
    
    // Then try inline script tags with questionFrontendId
    if (!problemNumber) {
      for (const script of scripts) {
        const content = script.textContent;
        if (content.includes('questionFrontendId') || content.includes('questionId')) {
          scriptCheckCount++;
          // Look for patterns like "questionFrontendId":"54" or questionFrontendId:54
          const match = content.match(/"questionFrontendId"\s*:\s*"?(\d+)"?/);
          if (match) {
            problemNumber = String(Number(match[1])).padStart(4, '0');
            extractionMethod = 'script tag questionFrontendId';
            if (ENABLE_DIAGNOSTICS) {
              console.log(`[LeetUp:DIAG] ✓ Extraction method: script tag questionFrontendId`);
              console.log(`[LeetUp:DIAG] ✓ Problem number: "${problemNumber}" (raw: ${match[1]})`);
            }
            break;
          }
        }
      }
    }
    
    if (!problemNumber && ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] ✗ Script tag extraction failed (checked ${scriptCheckCount} inline scripts, __NEXT_DATA__ not found or invalid)`);
    }
  }

  // Attempt 5: Search for any visible text containing "Problem #" pattern
  if (!problemNumber) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Attempting body text patterns...`);
    }
    
    // Safety check for document.body existence and innerText support
    if (document.body && document.body.innerText) {
      const bodyText = document.body.innerText;
      const patterns = [
        { regex: /Problem\s+#?(\d+)/i, name: 'Problem #N' },
        { regex: /Question\s+#?(\d+)/i, name: 'Question #N' },
        { regex: /\b(\d+)\s*\.\s*[A-Z]/, name: 'N. Title' },
      ];
      
      for (const { regex, name } of patterns) {
        const match = bodyText.match(regex);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > 0 && num < 10000) {  // Sanity check
            problemNumber = String(num).padStart(4, '0');
            extractionMethod = `body text pattern: ${name}`;
            if (ENABLE_DIAGNOSTICS) {
              console.log(`[LeetUp:DIAG] ✓ Extraction method: body text pattern "${name}"`);
              console.log(`[LeetUp:DIAG] ✓ Problem number: "${problemNumber}" (raw: ${match[1]})`);
            }
            break;
          }
        }
      }
    }
    
    if (!problemNumber && ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] ✗ Body text patterns failed (document.body.innerText ${document.body && document.body.innerText ? 'available but' : 'not available or'} no match found)`);
    }
  }

  // Required: log error and return null if problemNumber is unavailable
  if (!problemNumber) {
    console.error('[LeetUp] scrapeSubmission: missing required field "problemNumber"');
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] ✗ All problem number extraction methods failed`);
      console.log(`[LeetUp:DIAG]   Context: pathname=${window.location.pathname}, title="${document.title}"`);
      console.log(`[LeetUp:DIAG]   DOM state: document.body exists=${!!document.body}, scripts count=${document.querySelectorAll('script').length}`);
    }
    return null;
  }

  if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] ✓ Problem number extraction succeeded via: ${extractionMethod}`);
  }

  // ------------------------------------------------------------------
  // 3. Problem title — from heading or page title (optional, fallback '')
  // ------------------------------------------------------------------
  let problemTitle = '';

  // Try heading selector first
  const titleEl =
    document.querySelector('[data-cy="question-title"]') ||
    document.querySelector('.mr-2.text-label-1') ||
    document.querySelector('[class*="question-title"]') ||
    Array.from(document.querySelectorAll('h4, h3, h2, h1, [class*="title"]'))
      .find(el => /^\d+\./.test(el.textContent.trim()));

  if (titleEl) {
    // Strip leading "N. " prefix if present
    problemTitle = titleEl.textContent.trim().replace(/^\d+\.\s*/, '');
  } else {
    // Fall back to document.title: "1. Two Sum - LeetCode" → "Two Sum"
    const docTitleMatch = document.title.match(/^\d+\.\s*(.+?)(?:\s*[-|]\s*LeetCode)?$/i);
    if (docTitleMatch) {
      problemTitle = docTitleMatch[1].trim();
    }
  }

  // ------------------------------------------------------------------
  // 4. Language — from the code editor language selector button
  //    LeetCode renders this as a button/span inside the editor toolbar.
  // ------------------------------------------------------------------
  const languageEl =
    document.querySelector('[data-cy="lang-select"] button') ||
    document.querySelector('.ant-select-selection-item') ||
    document.querySelector('[class*="select-trigger"] [class*="item"]') ||
    document.querySelector('button[id*="headlessui-listbox-button"]') ||
    document.querySelector('[class*="CodeMirror-lang"]') ||
    // Generic: look for a button near the editor that contains a known language name
    (() => {
      const candidates = document.querySelectorAll('button, [role="option"], [class*="lang"]');
      for (const el of candidates) {
        const text = el.textContent.trim().toLowerCase();
        if (LANG_MAP.has(text)) return el;
      }
      return null;
    })();

  const language = languageEl ? languageEl.textContent.trim() : '';

  // ------------------------------------------------------------------
  // 5. Code — from the Monaco/CodeMirror editor
  //    LeetCode uses Monaco editor; the code lines are in .view-lines.
  // ------------------------------------------------------------------
  let code = '';

  // Monaco editor lines
  const monacoLines = document.querySelectorAll('.view-lines .view-line');
  if (monacoLines.length > 0) {
    code = Array.from(monacoLines)
      .map(line => line.textContent)
      .join('\n');
  }

  // CodeMirror fallback
  if (!code) {
    const cmContent = document.querySelector('.CodeMirror-code');
    if (cmContent) {
      code = Array.from(cmContent.querySelectorAll('.CodeMirror-line'))
        .map(line => line.textContent)
        .join('\n');
    }
  }

  // Required: log error and return null if code is unavailable
  if (!code) {
    console.error('[LeetUp] scrapeSubmission: missing required field "code"');
    return null;
  }

  // ------------------------------------------------------------------
  // 6. Topic slug — scraped for README metadata only (not used in path)
  //    LeetCode renders topic tags as links like /tag/array/
  // ------------------------------------------------------------------
  let topicSlug = '';

  const topicEl =
    document.querySelector('a[href*="/tag/"]') ||
    document.querySelector('[class*="topic-tag"] a') ||
    document.querySelector('[data-cy="topic-tags"] a');

  if (topicEl) {
    // href is typically "/tag/array/" → extract "array"
    const tagMatch = (topicEl.getAttribute('href') || '').match(/\/tag\/([^/]+)/);
    if (tagMatch) {
      topicSlug = tagMatch[1];
    } else {
      topicSlug = topicEl.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    }
  }

  // ------------------------------------------------------------------
  // 7. Description — fallback chain: __NEXT_DATA__ JSON → DOM selectors
  // ------------------------------------------------------------------

  // --- Primary: __NEXT_DATA__ JSON ---
  let description = '';
  let extractionSource = 'none';

  const nextDataResult = extractDescriptionFromNextData();
  if (nextDataResult.found) {
    const converted = htmlToPlainText(nextDataResult.html);
    if (converted.length > 0) {
      description = converted;
      extractionSource = '__NEXT_DATA__';
    }
  }

  // --- Secondary fallback: DOM selectors ---
  if (description === '') {
    const descEl =
      document.querySelector('[data-track-load="description-content"]') ||
      document.querySelector('[class*="elfjS"]') ||
      document.querySelector('[data-cy="question-content"]') ||
      document.querySelector('[class*="question-content"]') ||
      document.querySelector('[class*="description"]');
    if (descEl !== null) {
      description = descEl.textContent.trim();
      extractionSource = 'DOM-selector';
    }
  }

  // --- Diagnostics ---
  if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] description extraction source: "${extractionSource}"`);
    console.log(`[LeetUp:DIAG] description extraction success: ${description.length > 0}`);
    console.log(`[LeetUp:DIAG] description byte length: ${new TextEncoder().encode(description).length}`);
  }

  // ------------------------------------------------------------------
  // 8. Derive fileExtension and domain from language
  // ------------------------------------------------------------------
  const fileExtension = getFileExtension(language);
  const domain        = getDomain(language);

  // ------------------------------------------------------------------
  // 9. Validate path components — domain, problemNumber, problemSlug required
  //    (topicSlug is optional metadata — not used in path construction)
  // ------------------------------------------------------------------
  if (!domain) {
    console.error('[LeetUp] scrapeSubmission: missing required path component "domain"');
    return null;
  }
  if (!problemNumber) {
    // Already checked above, but kept for defensive completeness
    console.error('[LeetUp] scrapeSubmission: missing required path component "problemNumber"');
    return null;
  }
  if (!problemSlug) {
    console.error('[LeetUp] scrapeSubmission: missing required path component "problemSlug"');
    return null;
  }

  // ------------------------------------------------------------------
  // 10. Return the complete payload
  // ------------------------------------------------------------------
  return {
    problemNumber,
    problemSlug,
    problemTitle,
    topicSlug,
    language,
    fileExtension,
    domain,
    code,
    description,
  };
}

// ---------------------------------------------------------------------------
// Markdown Toolbar Helpers (Fix 4)
// ---------------------------------------------------------------------------

/**
 * Inserts markdown syntax around selected text (or a placeholder) in a textarea.
 *
 * @param {HTMLTextAreaElement} textarea - The notes textarea element.
 * @param {[string, string]} param1 - [prefix, suffix] strings to wrap around selection.
 * @param {string} placeholder - Text to use when nothing is selected.
 */
function insertMarkdown(textarea, [prefix, suffix], placeholder) {
  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const selected = textarea.value.substring(start, end) || placeholder;
  const insertion = prefix + selected + suffix;
  textarea.value = textarea.value.substring(0, start) + insertion + textarea.value.substring(end);
  const newPos = start + insertion.length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd   = newPos;
  textarea.focus();
}

/**
 * Creates a markdown formatting toolbar with Bold, Inline Code, Fenced Code Block,
 * and Bullet List buttons. Each button calls insertMarkdown on click.
 *
 * @param {HTMLTextAreaElement} textarea - The notes textarea element to target.
 * @returns {HTMLDivElement} The toolbar div element.
 */
function createToolbar(textarea) {
  const toolbar = document.createElement('div');
  toolbar.id = 'lgs-toolbar';

  const BUTTONS = [
    { label: 'B',         title: 'Bold',             wrap: ['**', '**'],       placeholder: 'text' },
    { label: '`code`',    title: 'Inline Code',       wrap: ['`', '`'],         placeholder: 'code' },
    { label: '``` block', title: 'Fenced Code Block', wrap: ['```\n', '\n```'], placeholder: 'code' },
    { label: '- list',    title: 'Bullet List',       wrap: ['- ', ''],         placeholder: 'item' },
  ];

  for (const btn of BUTTONS) {
    const el = document.createElement('button');
    el.className = 'lgs-toolbar-btn';
    el.type = 'button';
    el.textContent = btn.label;
    el.title = btn.title;
    el.addEventListener('click', () => insertMarkdown(textarea, btn.wrap, btn.placeholder));
    toolbar.appendChild(el);
  }

  return toolbar;
}

// ---------------------------------------------------------------------------
// Modal Injection (Requirements 5.1, 5.2, 5.3, 5.4)
// ---------------------------------------------------------------------------

/**
 * Injects the modal overlay into the current LeetCode page.
 *
 * Creates the root #lgs-modal element and all required child elements:
 *  - #lgs-notes     textarea (maxlength 10000)
 *  - #lgs-submit-btn button
 *  - #lgs-spinner   loading indicator (hidden by default)
 *  - #lgs-close-btn dismiss control
 *  - #lgs-status    status/error message display area
 *
 * The modal is appended to document.body. isModalOpen is set to true on
 * injection and false when the modal is removed (close button click or
 * Escape key).
 *
 * Guard: returns early (idempotent) if #lgs-modal already exists in the DOM.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 *
 * @param {Object} payload - The scraped submission payload from scrapeSubmission().
 */
function injectModal(payload) {
  // Idempotency guard: do not inject if a modal already exists in the DOM
  if (document.getElementById('lgs-modal')) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] injectModal blocked: modal already exists, timestamp: ${Date.now()}`);
    }
    return;
  }

  if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] injectModal called, timestamp: ${Date.now()}`);
  }

  isModalOpen = true;

  // Root modal container
  const modal = document.createElement('div');
  modal.id = 'lgs-modal';
  modal.setAttribute('data-payload', JSON.stringify(payload));

  // All variables declared upfront so every inner function can reference them.
  const spinner = document.createElement('div');
  spinner.id = 'lgs-spinner';
  spinner.style.display = 'none';

  const status = document.createElement('div');
  status.id = 'lgs-status';

  const submitBtn = document.createElement('button');
  submitBtn.id = 'lgs-submit-btn';
  submitBtn.textContent = 'Submit & Push to GitHub';

  const notes = document.createElement('textarea');
  notes.id = 'lgs-notes';
  notes.maxLength = 10000;
  notes.placeholder = 'Write your approach, complexity notes, etc. (optional)';

  // closeModal uses modal/spinner/isModalOpen — all declared above.
  const closeModal = () => {
    modal.remove();
    isModalOpen = false;
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') closeModal();
  };

  // Close button — use capture phase to intercept before React's synthetic
  // event system, and stop propagation so LeetCode's own handlers don't interfere.
  const closeBtn = document.createElement('button');
  closeBtn.id = 'lgs-close-btn';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeModal();
  }, true /* capture */);

  // Also close when clicking the backdrop (outside the card)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      e.stopPropagation();
      closeModal();
    }
  }, true /* capture */);

  // Modal title
  const modalTitle = document.createElement('div');
  modalTitle.id = 'lgs-modal-title';
  modalTitle.textContent = '📝 Add Notes (Optional)';

  // Markdown formatting toolbar
  const toolbar = createToolbar(notes);

  // Submit button click handler
  submitBtn.addEventListener('click', () => {
    spinner.style.display = '';
    submitBtn.disabled = true;

    const notesValue = notes.value;
    const messagePayload = { ...payload, notes: notesValue };

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(
        { type: 'PUSH_SUBMISSION', payload: messagePayload },
        (response) => {
          if (!document.getElementById('lgs-modal')) return;

          if (response && response.ok === true) {
            spinner.style.display = 'none';
            status.textContent = 'Pushed successfully!';
            setTimeout(closeModal, 2000);
          } else {
            spinner.style.display = 'none';
            status.textContent = (response && response.error) ? response.error : 'An unknown error occurred.';
            submitBtn.disabled = false;
          }
        }
      );
    }
  });

  // Card — same structure as original, with title and toolbar added
  const card = document.createElement('div');
  card.className = 'lgs-card';
  card.append(closeBtn, modalTitle, toolbar, notes, spinner, status, submitBtn);
  modal.appendChild(card);
  document.body.appendChild(modal);
  document.addEventListener('keydown', onKeyDown);
}

// ---------------------------------------------------------------------------
// SPA Navigation Reconnect (Requirement 2.9)
// ---------------------------------------------------------------------------

/**
 * Tracks the current page URL so that SPA navigation can be detected by
 * comparing against `window.location.href` on each animation frame.
 *
 * @type {string}
 */
let currentUrl = typeof window !== 'undefined' ? window.location.href : '';

/**
 * Extracts the problem slug from a LeetCode problem or submission URL.
 * Returns null if the URL is not a recognized problem/submission page.
 *
 * Examples:
 *   /problems/two-sum/ → "two-sum"
 *   /problems/two-sum/description/ → "two-sum"
 *   /problems/two-sum/submissions/123456/ → "two-sum"
 *
 * @param {string} url - The URL to parse.
 * @returns {string|null} The problem slug or null.
 */
function extractProblemSlug(url) {
  const match = url.match(/\/problems\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Holds a reference to the active MutationObserver so that it can be
 * disconnected before re-attaching on SPA navigation.
 *
 * @type {MutationObserver|null}
 */
let activeObserver = null;

/**
 * Disconnects the current observer (if any) and re-attaches a new one to
 * the (potentially updated) submission result panel.
 *
 * Called on `popstate`, `hashchange`, and URL-polling detection when the
 * current URL matches `https://leetcode.com/problems/*`.
 *
 * Fix: Preserves pendingAttempt when navigating within the same problem
 * (e.g., /problems/two-sum/ → /problems/two-sum/submissions/123/).
 * Only clears state when navigating to a different problem or leaving problem pages.
 *
 * Requirements: 2.9
 *
 * @param {string} previousUrl - The URL before navigation (for comparison).
 */
function reconnectObserver(previousUrl = '') {
  const currentHref = window.location.href;
  
  if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] reconnectObserver called, previousURL: ${previousUrl}, currentURL: ${currentHref}, timestamp: ${Date.now()}`);
  }
  
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }

  // Extract problem slugs to determine if this is same-problem navigation
  const previousSlug = extractProblemSlug(previousUrl);
  const currentSlug = extractProblemSlug(currentHref);
  
  const isSameProblemNavigation = previousSlug && currentSlug && previousSlug === currentSlug;

  // Only clear pending attempt if navigating to a DIFFERENT problem or leaving problem pages
  // Preserve state for same-problem navigation (e.g., problem page → submission detail page)
  if (!isSameProblemNavigation && pendingAttempt) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Different problem navigation detected (${previousSlug} → ${currentSlug}), clearing state`);
    }
    clearPendingAttempt('navigation');
  } else if (isSameProblemNavigation && pendingAttempt) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Same-problem navigation detected (${currentSlug}), preserving pendingAttempt`);
    }
  }

  // Only attach on problem pages
  if (/^https:\/\/leetcode\.com\/problems\//.test(currentHref)) {
    // The new result panel may not yet be in the DOM; wait one tick so the
    // SPA has a chance to mount the new route before we query for the panel.
    setTimeout(() => {
      activeObserver = attachObserver();
    }, 0);
  }
}

/**
 * Polls for URL changes on every animation frame to catch SPA navigations
 * (such as React-router `pushState` calls) that do not fire `popstate` or
 * `hashchange` events.
 *
 * When a URL change to a LeetCode problem page is detected, calls
 * `reconnectObserver()` with the previous URL and updates `currentUrl`.
 *
 * Requirements: 2.9
 */
function startUrlPolling() {
  function poll() {
    const latestUrl = window.location.href;
    if (latestUrl !== currentUrl) {
      const previousUrl = currentUrl;
      currentUrl = latestUrl;
      reconnectObserver(previousUrl);
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
}

// Listen for browser history navigation events that *do* fire events
// For these events, we don't have the previous URL, so pass empty string
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => reconnectObserver(''));
  window.addEventListener('hashchange', () => reconnectObserver(''));
}

// ---------------------------------------------------------------------------
// MutationObserver Attachment (Requirements 2.1, 2.2, 2.3, 2.8)
// ---------------------------------------------------------------------------

/**
 * Boolean flag that tracks whether the notes modal is currently visible.
 * Guards against opening duplicate modals when multiple mutation records
 * fire for the same accepted-submission event.
 *
 * Requirements: 2.8
 *
 * @type {boolean}
 */
let isModalOpen = false;

/**
 * Stores the complete submission payload captured at Submit click, before
 * LeetCode navigates to the submission-detail page where problem metadata
 * is unavailable.
 *
 * Structure: { payload, startedAt, problemSlug } | null
 *
 * Lifecycle:
 *  - Set at Submit click after successful scrapeSubmission()
 *  - Preserved during same-problem navigation
 *  - Cleared on: accepted verdict, non-accepted verdict, different-problem navigation, timeout
 *
 * @type {Object|null}
 */
let pendingAttempt = null;

/**
 * Enable/disable diagnostic logging for live validation.
 * Set to true to log state transitions, container lifecycle, and verdict detection.
 * SECURITY: Logs contain ONLY state names, boolean flags, element selectors,
 * verdict strings, and timestamps. No credentials, tokens, or source code.
 *
 * @type {boolean}
 */
const ENABLE_DIAGNOSTICS = false;

/**
 * Holds the setTimeout handle for resetting pendingAttempt after 15 seconds.
 * Cleared when the modal fires so we don't reset the state twice.
 *
 * @type {ReturnType<typeof setTimeout>|null}
 */
let pendingAttemptTimeout = null;

/**
 * Clears the pending attempt state and its safety timeout.
 * @param {string} reason - Diagnostic reason for clearing (for logging only).
 */
function clearPendingAttempt(reason = 'unknown') {
  if (ENABLE_DIAGNOSTICS && pendingAttempt) {
    console.log(`[LeetUp:DIAG] clearPendingAttempt — reason: ${reason}, timestamp: ${Date.now()}`);
  }
  pendingAttempt = null;
  if (pendingAttemptTimeout !== null) {
    clearTimeout(pendingAttemptTimeout);
    pendingAttemptTimeout = null;
  }
}

/**
 * Attaches a capture-phase click listener to document that watches for clicks
 * on LeetCode's "Submit" button. When detected:
 *  1. Scrapes submission payload from the CURRENT page (before navigation)
 *  2. Stores payload in pendingAttempt state
 *  3. Arms a 15-second safety timeout to reset state
 *
 * LeetCode renders its submit button as a button element whose text contains
 * "Submit" (case-insensitive). We use capture phase so React's synthetic event
 * system cannot stop propagation before we see it.
 *
 * Fix: Payload is captured BEFORE LeetCode navigates to /submissions/<id>/
 * where problem metadata is unavailable.
 */
function attachSubmitClickListener() {
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    // Walk up to 3 levels to find a button (click may land on inner span/icon)
    let el = target;
    for (let i = 0; i < 3; i++) {
      if (!el) break;
      const tag  = el.tagName && el.tagName.toLowerCase();
      const text = el.textContent && el.textContent.trim().toLowerCase();
      if (tag === 'button' && text === 'submit') {
        // LeetCode submit button clicked — capture payload NOW before navigation
        const existingContainer = document.querySelector(RESULT_CONTAINER_SELECTOR);
        const containerState = existingContainer
          ? `exists (verdict: ${existingContainer.textContent.trim().substring(0, 50)})`
          : 'not present';
        
        if (ENABLE_DIAGNOSTICS) {
          console.log(`[LeetUp:DIAG] Submit button clicked, timestamp: ${Date.now()}, result container: ${containerState}`);
        }

        // Scrape payload from CURRENT page (has problem metadata)
        const payload = scrapeSubmission();
        
        if (payload) {
          // Success: store the payload and arm the observer
          pendingAttempt = {
            payload,
            startedAt: Date.now(),
            problemSlug: payload.problemSlug,
          };
          
          if (pendingAttemptTimeout !== null) clearTimeout(pendingAttemptTimeout);
          pendingAttemptTimeout = setTimeout(() => clearPendingAttempt('15s-timeout'), 15000);
          
          if (ENABLE_DIAGNOSTICS) {
            console.log(`[LeetUp:DIAG] Payload captured successfully, pendingAttempt armed for problem: ${payload.problemSlug}`);
          }
        } else {
          // Failure: payload unavailable, no modal possible
          if (ENABLE_DIAGNOSTICS) {
            console.log(`[LeetUp:DIAG] Payload capture failed at Submit click, no modal will be shown`);
          }
          pendingAttempt = null;
        }
        
        break;
      }
      el = el.parentElement;
    }
  }, true /* capture phase */);
}

/**
 * Selector for the LeetCode submission result container.
 * LeetCode injects this element dynamically after the user clicks Submit.
 *
 * @type {string}
 */
const RESULT_CONTAINER_SELECTOR = '[data-e2e-locator="submission-result"]';

/**
 * Final verdict strings that signal the submission is complete (but not Accepted).
 * When any of these appear in the result container we disarm pendingSubmission
 * without opening the modal.
 *
 * @type {Set<string>}
 */
const FINAL_NON_ACCEPTED_VERDICTS = new Set([
  'Wrong Answer',
  'Time Limit Exceeded',
  'Runtime Error',
  'Memory Limit Exceeded',
  'Compile Error',
  'Output Limit Exceeded',
]);

/**
 * Recursively walks the subtree of *newly added* nodes to check whether any
 * text node trims to exactly "Accepted".  Only call this on nodes from
 * `MutationRecord.addedNodes` — never on `mutation.target` — to avoid
 * rediscovering stale nodes that were already in the DOM.
 *
 * @param {Node} node - A newly added DOM node.
 * @returns {boolean} True if an "Accepted" text node was found.
 */
function hasAcceptedTextInAdded(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.trim() === 'Accepted';
  }
  for (const child of node.childNodes) {
    if (hasAcceptedTextInAdded(child)) return true;
  }
  return false;
}

/**
 * Recursively checks whether any newly added node (or its descendants) contains
 * a final non-Accepted verdict string.
 *
 * @param {Node} node - A newly added DOM node.
 * @returns {boolean} True if a terminal non-Accepted verdict was found.
 */
function hasNonAcceptedVerdictInAdded(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return FINAL_NON_ACCEPTED_VERDICTS.has(node.textContent.trim());
  }
  for (const child of node.childNodes) {
    if (hasNonAcceptedVerdictInAdded(child)) return true;
  }
  return false;
}

/**
 * Attaches a MutationObserver to detect "Accepted" verdicts on LeetCode using
 * a two-phase strategy that avoids both whole-page scanning and stale-node
 * rediscovery:
 *
 * Phase 1 — Container insertion watcher:
 *   Observe document.body (childList+subtree) *only* to detect when
 *   [data-e2e-locator="submission-result"] is inserted into the DOM.
 *   If the container already exists, skip Phase 1 and proceed directly.
 *
 * Phase 2 — Verdict observer:
 *   Once the container is present, disconnect the Phase-1 watcher and
 *   attach a narrowly scoped observer on the container itself.
 *   The callback inspects ONLY:
 *     - `mutation.addedNodes` (and their subtrees) for childList mutations
 *     - `mutation.target` for characterData mutations
 *   It never walks `mutation.target`'s full subtree on childList records,
 *   which eliminates rediscovery of stale "Accepted" nodes.
 *
 * Additional guards:
 *   - Only fires when pendingSubmission is true (user clicked Submit).
 *   - Opens the modal at most once (isModalOpen guard).
 *   - Disarms pendingSubmission on any final verdict (Accepted or non-Accepted).
 *
 * Requirements: 1.1–1.5, 2.1–2.4, 3.1–3.4
 *
 * @returns {{ disconnect: function }} An object with a disconnect() method that
 *   tears down whichever phase is currently active. Compatible with the existing
 *   activeObserver API.
 */
function attachObserver() {
  if (!document.body) {
    console.warn('[LeetUp] attachObserver: document.body not available');
    return null;
  }

  // Tracks whether this observer handle has been disconnected.
  let disconnected = false;

  // Reference to whichever MutationObserver is currently active so that
  // disconnect() can always tear down the live one.
  let currentObserver = null;

  // Public handle returned to callers — wraps whichever internal observer
  // is active at any moment.
  const handle = {
    disconnect() {
      disconnected = true;
      if (currentObserver) {
        currentObserver.disconnect();
        currentObserver = null;
      }
    },
  };

  // ------------------------------------------------------------------
  // Phase 2: Verdict observer — scoped to the result container only.
  // Inspects ONLY newly added nodes and characterData targets; never
  // walks mutation.target's existing subtree.
  //
  // Fix: Uses stored payload from pendingAttempt instead of re-scraping
  // on the submission-detail page where problem metadata is unavailable.
  // ------------------------------------------------------------------
  function attachVerdictObserver(container) {
    if (disconnected) return;

    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Phase 2: Verdict observer attaching to container, timestamp: ${Date.now()}, pendingAttempt: ${pendingAttempt ? 'exists' : 'null'}`);
    }

    const verdictObserver = new MutationObserver((mutations) => {
      if (isModalOpen) return;
      if (!pendingAttempt) return;  // Changed from pendingSubmission

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          // Text node data changed in-place — check the target directly.
          const text = mutation.target.textContent.trim();
          if (text === 'Accepted') {
            if (ENABLE_DIAGNOSTICS) {
              console.log(`[LeetUp:DIAG] Accepted verdict detected (characterData), timestamp: ${Date.now()}`);
            }
            // Use stored payload from pendingAttempt (captured before navigation)
            const storedPayload = pendingAttempt.payload;
            clearPendingAttempt('accepted-verdict');
            injectModal(storedPayload);  // No scrapeSubmission() call
            return;
          }
          if (FINAL_NON_ACCEPTED_VERDICTS.has(text)) {
            if (ENABLE_DIAGNOSTICS) {
              console.log(`[LeetUp:DIAG] Non-accepted verdict detected: ${text}, timestamp: ${Date.now()}`);
            }
            clearPendingAttempt('non-accepted-verdict');
            return;
          }
        } else if (mutation.type === 'childList') {
          // Inspect only newly added nodes — never mutation.target's subtree.
          for (const addedNode of mutation.addedNodes) {
            if (hasAcceptedTextInAdded(addedNode)) {
              if (ENABLE_DIAGNOSTICS) {
                console.log(`[LeetUp:DIAG] Accepted verdict detected (childList), timestamp: ${Date.now()}`);
              }
              // Use stored payload from pendingAttempt (captured before navigation)
              const storedPayload = pendingAttempt.payload;
              clearPendingAttempt('accepted-verdict');
              injectModal(storedPayload);  // No scrapeSubmission() call
              return;
            }
            if (hasNonAcceptedVerdictInAdded(addedNode)) {
              const verdictText = addedNode.textContent ? addedNode.textContent.trim().substring(0, 50) : 'unknown';
              if (ENABLE_DIAGNOSTICS) {
                console.log(`[LeetUp:DIAG] Non-accepted verdict detected: ${verdictText}, timestamp: ${Date.now()}`);
              }
              clearPendingAttempt('non-accepted-verdict');
              return;
            }
          }
        }
      }
    });

    verdictObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    currentObserver = verdictObserver;
    console.info('[LeetUp] Verdict observer attached to result container');
  }

  // ------------------------------------------------------------------
  // Phase 1: Container insertion watcher — watches document.body only
  // for the insertion of the result container, then hands off to Phase 2.
  // ------------------------------------------------------------------

  // If the container is already present (e.g. after SPA navigation where
  // the previous result panel persists), skip Phase 1 entirely.
  const existingContainer = document.querySelector(RESULT_CONTAINER_SELECTOR);
  if (existingContainer) {
    if (ENABLE_DIAGNOSTICS) {
      console.log(`[LeetUp:DIAG] Phase 1 skipped: container already exists, timestamp: ${Date.now()}`);
    }
    attachVerdictObserver(existingContainer);
    return handle;
  }

  if (ENABLE_DIAGNOSTICS) {
    console.log(`[LeetUp:DIAG] Phase 1: Container insertion watcher starting, timestamp: ${Date.now()}`);
  }

  const insertionWatcher = new MutationObserver((mutations) => {
    if (disconnected) return;

    // Only care about insertions while we are waiting for a submission result.
    // If pendingAttempt is null, ignore — we'll re-arm when needed.
    if (!pendingAttempt) return;

    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;

        // Check if the added node IS the container.
        let container = null;
        if (addedNode.matches && addedNode.matches(RESULT_CONTAINER_SELECTOR)) {
          container = addedNode;
        } else if (addedNode.querySelector) {
          // Or if the container was inserted as a descendant of the added node.
          container = addedNode.querySelector(RESULT_CONTAINER_SELECTOR);
        }

        if (container) {
          if (ENABLE_DIAGNOSTICS) {
            console.log(`[LeetUp:DIAG] Phase 1→2: Result container inserted, timestamp: ${Date.now()}`);
          }
          // Disconnect Phase 1, switch to Phase 2.
          insertionWatcher.disconnect();
          attachVerdictObserver(container);

          // The container may have been inserted with the verdict node already
          // inside it (common when LeetCode renders the result in one React
          // commit). Check the addedNodes subtree of the container itself now,
          // since the verdict observer was not yet attached for that mutation.
          if (pendingAttempt && !isModalOpen) {
            if (hasAcceptedTextInAdded(container)) {
              if (ENABLE_DIAGNOSTICS) {
                console.log(`[LeetUp:DIAG] Accepted verdict found in newly inserted container, timestamp: ${Date.now()}`);
              }
              // Use stored payload from pendingAttempt
              const storedPayload = pendingAttempt.payload;
              clearPendingAttempt('accepted-verdict');
              injectModal(storedPayload);
            } else if (hasNonAcceptedVerdictInAdded(container)) {
              if (ENABLE_DIAGNOSTICS) {
                console.log(`[LeetUp:DIAG] Non-accepted verdict found in newly inserted container, timestamp: ${Date.now()}`);
              }
              clearPendingAttempt('non-accepted-verdict');
            }
          }
          return;
        }
      }
    }
  });

  insertionWatcher.observe(document.body, {
    childList: true,
    subtree: true,
  });

  currentObserver = insertionWatcher;
  console.info('[LeetUp] Container insertion watcher active');
  return handle;
}

// ---------------------------------------------------------------------------
// Initialisation — browser (content script) context only
// Fix: attachObserver and startUrlPolling were defined but never called,
// so the MutationObserver was never started. Adding these calls here ensures
// the observer is active as soon as the content script is injected.
// ---------------------------------------------------------------------------
if (typeof module === 'undefined') {
  attachSubmitClickListener();
  activeObserver = attachObserver();
  startUrlPolling();
}

// ---------------------------------------------------------------------------
// Exports (Node/Jest environment — no-op in browser context)
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LANG_MAP,
    RESULT_CONTAINER_SELECTOR,
    FINAL_NON_ACCEPTED_VERDICTS,
    getFileExtension,
    getDomain,
    deriveTopicSlugFallback,
    buildRepoPath,
    htmlToPlainText,
    extractDescriptionFromNextData,
    scrapeSubmission,
    insertMarkdown,
    createToolbar,
    injectModal,
    attachObserver,
    attachSubmitClickListener,
    reconnectObserver,
    startUrlPolling,
    extractProblemSlug,
    clearPendingAttempt,
    // Export getter/setter for isModalOpen so tests can inspect and reset it.
    get isModalOpen() { return isModalOpen; },
    set isModalOpen(v) { isModalOpen = v; },
    // Export getter/setter for pendingAttempt so tests can inspect and reset it.
    get pendingAttempt() { return pendingAttempt; },
    set pendingAttempt(v) { pendingAttempt = v; },
    // Export getter/setter for currentUrl so tests can inspect and reset it.
    get currentUrl() { return currentUrl; },
    set currentUrl(v) { currentUrl = v; },
    // Export getter/setter for activeObserver so tests can inspect and reset it.
    get activeObserver() { return activeObserver; },
    set activeObserver(v) { activeObserver = v; },
  };
}
