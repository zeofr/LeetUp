// popup.js — Popup Logic
// Reads and writes GitHub credentials (PAT, username, repo) to/from
// chrome.storage.local and handles the configuration UI interactions.

/**
 * Populates the three credential input fields with values from storage.
 * Missing keys result in empty strings (no error shown).
 *
 * @param {Object} stored - Object returned from chrome.storage.local.get
 */
function populateFields(stored) {
  document.getElementById('pat').value      = stored.pat      || '';
  document.getElementById('username').value = stored.username || '';
  document.getElementById('repo').value     = stored.repo     || '';
}

/**
 * Handles the Save button click:
 *  1. Trims all three field values.
 *  2. If any trimmed value is empty: shows a validation error in #status and
 *     does NOT call chrome.storage.local.set.
 *  3. If all values are non-empty: writes {pat, username, repo} to
 *     chrome.storage.local.
 *  4. On success: temporarily changes the Save button label to "Saved!" for
 *     1500 ms, then reverts to "Save". (Req 1.5)
 *  5. On storage write failure: shows the error message in #status and
 *     preserves the current field values so the user can retry. (Req 1.8)
 */
function saveCredentials() {
  const patField      = document.getElementById('pat');
  const usernameField = document.getElementById('username');
  const repoField     = document.getElementById('repo');
  const saveBtn       = document.getElementById('save-btn');
  const statusEl      = document.getElementById('status');

  const pat      = patField.value.trim();
  const username = usernameField.value.trim();
  const repo     = repoField.value.trim();

  // Req 1.4 — reject empty / whitespace-only values
  if (!pat || !username || !repo) {
    statusEl.textContent = 'All fields are required and must not be blank.';
    return;
  }

  // Clear any previous status message before attempting to save
  statusEl.textContent = '';

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ pat, username, repo }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        // Req 1.8 — write failure: show error, preserve field values
        statusEl.textContent = chrome.runtime.lastError.message || 'Failed to save credentials.';
        return;
      }

      // Req 1.5 — success: show "Saved!" for 1500 ms then revert
      const originalLabel = saveBtn.textContent;
      saveBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveBtn.textContent = originalLabel;
      }, 1500);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['pat', 'username', 'repo'], (stored) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        // Read failed — leave fields empty (Req 1.9)
        populateFields({});
        return;
      }
      populateFields(stored);
    });
  }

  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCredentials);
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { populateFields, saveCredentials };
}
