/**
 * @jest-environment jsdom
 */
// Feature: leetcode-github-sync, Property 3: Popup pre-population reflects stored credentials

const fc = require('fast-check');
const { populateFields, saveCredentials } = require('../popup.js');

// ─── DOM Setup ────────────────────────────────────────────────────────────────

function setupDOM() {
  document.body.innerHTML = `
    <input type="password" id="pat"      value="" />
    <input type="text"     id="username" value="" />
    <input type="text"     id="repo"     value="" />
    <button id="save-btn">Save</button>
    <div id="status"></div>
  `;
}

beforeEach(() => {
  setupDOM();
  // Reset chrome.storage mock before each test
  global.chrome = {
    storage: {
      local: {
        set: jest.fn(),
        get: jest.fn(),
      },
    },
    runtime: {},
  };
});

// ---------------------------------------------------------------------------
// Property 3: Popup pre-population reflects stored credentials
// Validates: Requirements 1.6
// ---------------------------------------------------------------------------

describe('populateFields — Property 3: Popup pre-population reflects stored credentials', () => {
  // Feature: leetcode-github-sync, Property 3: Popup pre-population reflects stored credentials

  test('all three input fields display exactly the stored values with no truncation or modification', () => {
    fc.assert(
      fc.property(
        fc.record({
          pat:      fc.string(),
          username: fc.string(),
          repo:     fc.string(),
        }),
        (stored) => {
          // Re-setup DOM for each run so values don't bleed between iterations
          setupDOM();

          populateFields(stored);

          const patField      = document.getElementById('pat');
          const usernameField = document.getElementById('username');
          const repoField     = document.getElementById('repo');

          return (
            patField.value      === (stored.pat      || '') &&
            usernameField.value === (stored.username || '') &&
            repoField.value     === (stored.repo     || '')
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Credential validation rejects any whitespace-only input
// Validates: Requirements 1.4
// ---------------------------------------------------------------------------

describe('saveCredentials — Property 2: Credential validation rejects any whitespace-only input', () => {
  // Feature: leetcode-github-sync, Property 2: Credential validation rejects any whitespace-only input

  test('chrome.storage.local.set is never called when at least one field is empty or whitespace-only', () => {
    fc.assert(
      fc.property(
        // Generate a tuple where at least one slot is empty/whitespace-only
        fc.tuple(fc.string(), fc.string(), fc.string()).chain(([a, b, c]) => {
          // Pick which slot(s) to make whitespace-only/empty
          const whitespaceArb = fc.stringMatching(/^\s*$/);
          return fc.tuple(
            fc.oneof(whitespaceArb, fc.constant(a)),
            fc.oneof(whitespaceArb, fc.constant(b)),
            fc.oneof(whitespaceArb, fc.constant(c)),
          ).filter(([x, y, z]) => x.trim() === '' || y.trim() === '' || z.trim() === '');
        }),
        ([pat, username, repo]) => {
          // Re-setup DOM and mocks for each run
          setupDOM();
          global.chrome.storage.local.set = jest.fn();

          document.getElementById('pat').value      = pat;
          document.getElementById('username').value = username;
          document.getElementById('repo').value     = repo;

          saveCredentials();

          return global.chrome.storage.local.set.mock.calls.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});
