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
 *   `{domain}/{topicSlug}/{paddedNumber}-{problemSlug}/`
 * where `problemNumber` is zero-padded to 4 digits.
 *
 * Returns null and logs a console.error if any argument is falsy.
 *
 * Requirements: 4.4, 4.5
 *
 * @param {string} domain        - Top-level domain folder (e.g. "dsa").
 * @param {string} topicSlug     - Primary topic tag slug (e.g. "array").
 * @param {number|string} problemNumber - Numeric problem ID (e.g. 1 → "0001").
 * @param {string} problemSlug   - Kebab-case problem identifier (e.g. "two-sum").
 * @returns {string|null} The repository path string, or null if any arg is falsy.
 */
function buildRepoPath(domain, topicSlug, problemNumber, problemSlug) {
  // Validate all required arguments — any falsy value is an error
  const args = { domain, topicSlug, problemNumber, problemSlug };
  for (const [name, value] of Object.entries(args)) {
    if (!value && value !== 0) {
      console.error(`[LeetUp] buildRepoPath: missing required argument "${name}"`);
      return null;
    }
  }

  // Zero-pad the problem number to 4 digits
  const paddedNumber = String(Number(problemNumber)).padStart(4, '0');

  return `${domain}/${topicSlug}/${paddedNumber}-${problemSlug}/`;
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

  // ------------------------------------------------------------------
  // 2. Problem number — from page <title> or breadcrumb/heading text
  //    LeetCode titles are typically: "1. Two Sum - LeetCode"
  //    Try <title> first, then fall back to the main problem heading.
  // ------------------------------------------------------------------
  let problemNumber = '';

  // Attempt 1: document.title  ("1. Two Sum - LeetCode")
  const titleMatch = document.title.match(/^(\d+)\./);
  if (titleMatch) {
    problemNumber = String(Number(titleMatch[1])).padStart(4, '0');
  }

  // Attempt 2: heading element inside the problem content area
  // LeetCode renders the problem title as an <a> or heading containing "N. Title"
  if (!problemNumber) {
    const headingEl =
      document.querySelector('[data-cy="question-title"]') ||
      document.querySelector('.mr-2.text-label-1') ||
      document.querySelector('a[href*="/problems/"] .text-title-large') ||
      // Generic: any heading-level element whose text starts with a digit and dot
      Array.from(document.querySelectorAll('h4, h3, h2, h1, [class*="title"]'))
        .find(el => /^\d+\./.test(el.textContent.trim()));

    if (headingEl) {
      const m = headingEl.textContent.trim().match(/^(\d+)\./);
      if (m) {
        problemNumber = String(Number(m[1])).padStart(4, '0');
      }
    }
  }

  // Required: log error and return null if problemNumber is unavailable
  if (!problemNumber) {
    console.error('[LeetUp] scrapeSubmission: missing required field "problemNumber"');
    return null;
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
  // 6. Topic slug — from the first topic tag link on the page
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
      // Fallback: use text content, lower-cased and hyphenated
      topicSlug = topicEl.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    }
  }

  // ------------------------------------------------------------------
  // 7. Description — from the problem statement container (optional)
  // ------------------------------------------------------------------
  let description = '';

  const descEl =
    document.querySelector('[data-cy="question-content"]') ||
    document.querySelector('[class*="question-content__JfgR"]') ||
    document.querySelector('.content__u3I1') ||
    document.querySelector('[class*="problem-statement"]') ||
    document.querySelector('[class*="description__"]');

  if (descEl) {
    description = descEl.textContent.trim();
  }

  // ------------------------------------------------------------------
  // 8. Derive fileExtension and domain from language
  // ------------------------------------------------------------------
  const fileExtension = getFileExtension(language);
  const domain        = getDomain(language);

  // ------------------------------------------------------------------
  // 9. Validate path components — all must be present before proceeding
  //    (domain is always derived and non-empty; check others)
  // ------------------------------------------------------------------
  if (!domain) {
    console.error('[LeetUp] scrapeSubmission: missing required path component "domain"');
    return null;
  }
  if (!topicSlug) {
    // LeetCode hides topic tags behind a toggle by default — they are often
    // not in the DOM at submission time. Fall back to deriveTopicSlugFallback
    // so the push is not silently aborted just because tags are hidden.
    console.warn('[LeetUp] scrapeSubmission: topicSlug not found, using fallback');
    topicSlug = deriveTopicSlugFallback(problemSlug);
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
    return;
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
 * Requirements: 2.9
 */
function reconnectObserver() {
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }

  // Only attach on problem pages
  if (/^https:\/\/leetcode\.com\/problems\//.test(window.location.href)) {
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
 * `reconnectObserver()` and updates `currentUrl`.
 *
 * Requirements: 2.9
 */
function startUrlPolling() {
  function poll() {
    const latestUrl = window.location.href;
    if (latestUrl !== currentUrl) {
      currentUrl = latestUrl;
      reconnectObserver();
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
}

// Listen for browser history navigation events that *do* fire events
if (typeof window !== 'undefined') {
  window.addEventListener('popstate',    reconnectObserver);
  window.addEventListener('hashchange',  reconnectObserver);
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
 * Boolean flag that indicates the user has clicked the LeetCode Submit button
 * and a submission result is expected. The observer will only fire injectModal()
 * when this flag is true, preventing false positives from existing "Accepted"
 * status text rendered during page load (e.g. previous submission history).
 *
 * Set to true when a click on LeetCode's submit button is detected.
 * Reset to false after the modal fires or after a 15-second safety timeout.
 *
 * @type {boolean}
 */
let pendingSubmission = false;

/**
 * Holds the setTimeout handle for resetting pendingSubmission after 15 seconds.
 * Cleared when the modal fires so we don't reset the flag twice.
 *
 * @type {ReturnType<typeof setTimeout>|null}
 */
let pendingSubmissionTimeout = null;

/**
 * Resets the pendingSubmission flag and clears its safety timeout.
 */
function clearPendingSubmission() {
  pendingSubmission = false;
  if (pendingSubmissionTimeout !== null) {
    clearTimeout(pendingSubmissionTimeout);
    pendingSubmissionTimeout = null;
  }
}

/**
 * Attaches a capture-phase click listener to document that watches for clicks
 * on LeetCode's "Submit" button. When detected, sets pendingSubmission = true
 * and arms a 15-second safety timeout to reset it.
 *
 * LeetCode renders its submit button as a button element whose text contains
 * "Submit" (case-insensitive). We use capture phase so React's synthetic event
 * system cannot stop propagation before we see it.
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
        // LeetCode submit button clicked — arm the observer
        pendingSubmission = true;
        if (pendingSubmissionTimeout !== null) clearTimeout(pendingSubmissionTimeout);
        pendingSubmissionTimeout = setTimeout(clearPendingSubmission, 15000);
        console.info('[LeetUp] Submit button clicked — observer armed');
        break;
      }
      el = el.parentElement;
    }
  }, true /* capture phase */);
}

/**
 * Attaches a MutationObserver to detect "Accepted" verdicts on LeetCode.
 *
 * LeetCode is a React SPA — the submission result panel
 * ([data-e2e-locator="submission-result"]) does not exist in the DOM when
 * the page first loads. It is injected dynamically after the user clicks
 * Submit. Observing a narrow panel that may not yet exist means the observer
 * is never created and the modal never fires.
 *
 * Fix: always observe document.body as the stable root. The MutationObserver
 * callback filters for "Accepted" text anywhere in the subtree, which works
 * regardless of when or where LeetCode injects the result element.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.8
 *
 * @returns {MutationObserver} The created observer instance.
 */
function attachObserver() {
  // Always use document.body as the observation root.
  // The result panel is injected dynamically after submission and may not
  // exist when this function is called — observing body is the only reliable
  // approach for a React SPA.
  const resultPanel = document.body;

  if (!resultPanel) {
    console.warn('[LeetUp] attachObserver: document.body not available');
    return null;
  }

  /**
   * Recursively walks all text nodes within a DOM node and checks whether
   * any of them contain exactly "Accepted" after trimming.
   *
   * @param {Node} node - The DOM node to start from.
   * @returns {boolean} True if an "Accepted" text node was found.
   */
  function hasAcceptedText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim() === 'Accepted';
    }
    for (const child of node.childNodes) {
      if (hasAcceptedText(child)) return true;
    }
    return false;
  }

  const observer = new MutationObserver((mutations) => {
    // Skip if the modal is already open — guard against duplicate triggers.
    if (isModalOpen) return;

    // Only fire if the user actually clicked Submit. This prevents the observer
    // from triggering on "Accepted" text rendered from existing submission history
    // when the user navigates to a problem they have already solved.
    if (!pendingSubmission) return;

    let accepted = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        // A text node's data changed directly.
        if (mutation.target.textContent.trim() === 'Accepted') {
          accepted = true;
          break;
        }
      } else {
        // childList mutation — inspect added nodes and the whole subtree.
        for (const addedNode of mutation.addedNodes) {
          if (hasAcceptedText(addedNode)) {
            accepted = true;
            break;
          }
        }

        // Also check the mutation target itself in case the text already settled.
        if (!accepted && hasAcceptedText(mutation.target)) {
          accepted = true;
        }

        if (accepted) break;
      }
    }

    if (!accepted) return;

    // Disarm the pending flag — we got the result we were waiting for.
    clearPendingSubmission();

    // Attempt to scrape — abort silently (errors already logged by scrapeSubmission).
    const payload = scrapeSubmission();
    if (!payload) return;

    injectModal(payload);
  });

  observer.observe(resultPanel, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return observer;
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
    getFileExtension,
    getDomain,
    deriveTopicSlugFallback,
    buildRepoPath,
    scrapeSubmission,
    insertMarkdown,
    createToolbar,
    injectModal,
    attachObserver,
    attachSubmitClickListener,
    reconnectObserver,
    startUrlPolling,
    // Export getter/setter for isModalOpen so tests can inspect and reset it.
    get isModalOpen() { return isModalOpen; },
    set isModalOpen(v) { isModalOpen = v; },
    // Export getter/setter for pendingSubmission so tests can inspect and reset it.
    get pendingSubmission() { return pendingSubmission; },
    set pendingSubmission(v) { pendingSubmission = v; },
    // Export getter/setter for currentUrl so tests can inspect and reset it.
    get currentUrl() { return currentUrl; },
    set currentUrl(v) { currentUrl = v; },
    // Export getter/setter for activeObserver so tests can inspect and reset it.
    get activeObserver() { return activeObserver; },
    set activeObserver(v) { activeObserver = v; },
  };
}
