// background.js — Service Worker (Manifest V3)
// Handles PUSH_SUBMISSION messages from the content script,
// reads credentials from chrome.storage.local, and pushes
// solution files and README.md to GitHub via the Contents API.

/**
 * Encodes a string to Base64 in a UTF-8-safe manner.
 * Standard btoa() fails on multi-byte Unicode characters;
 * this pattern handles arbitrary Unicode content safely.
 *
 * @param {string} str - The string to encode.
 * @returns {string} Base64-encoded string.
 */
function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

const PROBLEM_STATEMENT_PLACEHOLDER = '<!-- Problem description unavailable. -->';

/**
 * Returns the problem description if non-empty after trimming, or the
 * placeholder string if the description is missing or blank.
 *
 * @param {string} description - The problem description text.
 * @returns {string} Non-empty description or PROBLEM_STATEMENT_PLACEHOLDER.
 */
function generateProblemStatement(description) {
  return (description && description.trim()) ? description : PROBLEM_STATEMENT_PLACEHOLDER;
}

/**
 * Generates the README.md content for a problem folder.
 *
 * Structure rules:
 *   - First line: `# {problemNumber}. {problemTitle}`
 *   - If notes is non-empty:
 *       `## 💡 My Approach`
 *       {notes verbatim}
 *       `---`
 *       {description or placeholder}
 *   - If notes is empty:
 *       {description or placeholder}  (immediately after title)
 *
 * @param {{ problemNumber: string, problemTitle: string, notes: string, description: string }} payload
 * @returns {string} The full README.md string.
 */
function generateReadme({ problemNumber, problemTitle, notes, description }) {
  const PLACEHOLDER = '_Official problem description unavailable._';
  const title = `# ${problemNumber}. ${problemTitle}`;
  const body = description && description.trim() ? description : PLACEHOLDER;

  if (notes && notes.trim()) {
    return [title, '', '## 💡 My Approach', notes, '', '---', '', body].join('\n');
  }

  return [title, '', body].join('\n');
}

/**
 * Strips all occurrences of `pat` from `errorStr` and replaces them
 * with "[REDACTED]". Prevents the PAT from appearing in user-facing
 * error messages.
 *
 * @param {string} errorStr - The error message to sanitize.
 * @param {string} pat - The PAT string to remove.
 * @returns {string} Sanitized error string.
 */
function sanitizeError(errorStr, pat) {
  if (!pat) return errorStr;
  // Split on the literal PAT and rejoin with the redaction marker.
  // Using split/join avoids regex special-character escaping issues and correctly
  // handles all literal occurrences of pat in errorStr.
  return errorStr.split(pat).join('[REDACTED]');
}

/**
 * Checks whether a file exists in the GitHub repository and retrieves
 * its SHA if it does. Uses the GitHub Contents API.
 *
 * @param {string} url - Full GitHub Contents API URL for the file.
 * @param {string} pat - GitHub Fine-Grained Personal Access Token.
 * @returns {Promise<{sha: string}|{sha: null}|{error: string}>}
 *   - `{ sha: string }` when the file exists (HTTP 200).
 *   - `{ sha: null }` when the file does not exist (HTTP 404).
 *   - `{ error: string }` on any other HTTP status (PAT stripped from message).
 */
async function getFileSha(url, pat) {
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (networkErr) {
    const raw = `Network error: ${networkErr.message}`;
    return { error: sanitizeError(raw, pat) };
  }

  if (response.status === 200) {
    const data = await response.json();
    return { sha: data.sha };
  }

  if (response.status === 404) {
    return { sha: null };
  }

  // Any other status — extract API error message and sanitize PAT.
  let apiMessage = '';
  try {
    const errData = await response.json();
    apiMessage = errData.message || '';
  } catch (_) {
    // ignore JSON parse failure; apiMessage stays empty
  }

  const raw = apiMessage
    ? `HTTP ${response.status}: ${apiMessage}`
    : `HTTP ${response.status}`;

  return { error: sanitizeError(raw, pat) };
}

/**
 * Creates or updates a file in a GitHub repository via the Contents API.
 *
 * @param {string} url - Full GitHub Contents API URL for the target file.
 * @param {string} pat - GitHub Fine-Grained Personal Access Token.
 * @param {object} body - The request body (message, content, sha?, etc.).
 * @returns {Promise<{ok: true}|{ok: false, error: string}>}
 *   - `{ ok: true }` on HTTP 200 or 201.
 *   - `{ ok: false, error: string }` on any other status or network error (PAT stripped).
 */
async function putFile(url, pat, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: sanitizeError(err.message, pat) };
  }

  if (response.status === 200 || response.status === 201) {
    return { ok: true };
  }

  // Any other status — extract API error message and sanitize PAT.
  let apiMessage = '';
  try {
    const errData = await response.json();
    apiMessage = errData.message || '';
  } catch (_) {
    // ignore JSON parse failure; apiMessage stays empty
  }

  const raw = apiMessage
    ? `HTTP ${response.status}: ${apiMessage}`
    : `HTTP ${response.status}`;

  return { ok: false, error: sanitizeError(raw, pat) };
}

/**
 * Pushes the solution file and a generated README.md to the configured GitHub repository.
 *
 * Reads credentials ({pat, username, repo}) from chrome.storage.local unless
 * _credentials is provided (used for unit testing, bypasses the storage read).
 *
 * @param {object} payload - The push payload (see PushPayload interface in design.md).
 * @param {object|null} [_credentials=null] - Optional credentials override for testing.
 *   When provided, chrome.storage.local is NOT accessed.
 * @returns {Promise<{ok: true}|{ok: false, error: string}>}
 */
async function pushSubmission(payload, _credentials = null) {
  // --- 1. Read credentials ---
  let pat, username, repo;

  if (_credentials !== null) {
    // Test path: use supplied credentials directly
    ({ pat, username, repo } = _credentials);
  } else if (typeof chrome !== 'undefined' && chrome.storage) {
    // Browser path: read from chrome.storage.local
    try {
      const stored = await new Promise((resolve, reject) => {
        chrome.storage.local.get(['pat', 'username', 'repo'], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });
      pat = stored.pat;
      username = stored.username;
      repo = stored.repo;
    } catch (err) {
      const raw = `Failed to read credentials: ${err.message || err}`;
      return { ok: false, error: sanitizeError(raw, '') };
    }
  } else {
    // No chrome environment and no credentials injected — cannot proceed
    return { ok: false, error: 'Please configure credentials in the Extension popup.' };
  }

  // --- 2. Validate credentials ---
  if (!pat || !username || !repo) {
    return { ok: false, error: 'Please configure credentials in the Extension popup.' };
  }

  // --- 3. Construct paths ---
  const solutionPath = `${payload.domain}/${payload.topicSlug}/${payload.problemNumber}-${payload.problemSlug}/solution${payload.fileExtension}`;
  const readmePath   = `${payload.domain}/${payload.topicSlug}/${payload.problemNumber}-${payload.problemSlug}/README.md`;
  const baseUrl      = `https://api.github.com/repos/${username}/${repo}/contents/`;

  // --- 4. GET SHA for solution file ---
  const shaResult = await getFileSha(baseUrl + solutionPath, pat);
  if (shaResult.error) {
    return { ok: false, error: sanitizeError(shaResult.error, pat) };
  }
  const sha = shaResult.sha; // null (new file) or string (existing file)

  // --- 5. Build solution PUT body ---
  const solutionBody = {
    message: `Add solution for ${payload.problemNumber}. ${payload.problemTitle}`,
    content: toBase64(payload.code),
    ...(sha ? { sha } : {}),
  };

  // --- 6. PUT solution file ---
  const solutionResult = await putFile(baseUrl + solutionPath, pat, solutionBody);
  if (!solutionResult.ok) {
    return { ok: false, error: sanitizeError(solutionResult.error, pat) };
  }

  // --- 7. Generate README ---
  const readme = generateReadme(payload);

  // --- 8. GET SHA for README ---
  const readmeShaResult = await getFileSha(baseUrl + readmePath, pat);
  if (readmeShaResult.error) {
    return { ok: false, error: sanitizeError(readmeShaResult.error, pat) };
  }
  const readmeSha = readmeShaResult.sha;

  // --- 9. Build README PUT body ---
  const readmeBody = {
    message: `Add solution for ${payload.problemNumber}. ${payload.problemTitle}`,
    content: toBase64(readme),
    ...(readmeSha ? { sha: readmeSha } : {}),
  };

  // --- 10. PUT README ---
  const readmeResult = await putFile(baseUrl + readmePath, pat, readmeBody);
  if (!readmeResult.ok) {
    return { ok: false, error: sanitizeError(readmeResult.error, pat) };
  }

  // --- 11. Build problem_statement.md path ---
  const problemStatementPath = `${payload.domain}/${payload.topicSlug}/${payload.problemNumber}-${payload.problemSlug}/problem_statement.md`;

  // --- 12. GET SHA for problem_statement.md ---
  const psShaResult = await getFileSha(baseUrl + problemStatementPath, pat);
  if (psShaResult.error) {
    return { ok: false, error: sanitizeError(psShaResult.error, pat) };
  }
  const psSha = psShaResult.sha;

  // --- 13. Build problem_statement PUT body ---
  const psBody = {
    message: `Add solution for ${payload.problemNumber}. ${payload.problemTitle}`,
    content: toBase64(generateProblemStatement(payload.description)),
    ...(psSha ? { sha: psSha } : {}),
  };

  // --- 14. PUT problem_statement.md ---
  const psResult = await putFile(baseUrl + problemStatementPath, pat, psBody);
  if (!psResult.ok) {
    return { ok: false, error: sanitizeError(psResult.error, pat) };
  }

  // --- 15. All three files pushed successfully ---
  return { ok: true };
}

// Register message listener — only in browser (service worker) context
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PUSH_SUBMISSION') {
      pushSubmission(message.payload)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ ok: false, error: String(err) }));
      return true; // keep channel open for async response
    }
  });
}

// Export for Node/Jest compatibility (not available in browser service worker context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toBase64, generateReadme, generateProblemStatement, PROBLEM_STATEMENT_PLACEHOLDER, sanitizeError, getFileSha, putFile, pushSubmission };
}
