/**
 * @jest-environment jsdom
 */
// Feature: leetcode-github-sync, Property 19 / security model: PAT storage location
// Validates: Requirements 9.1
//
// Property: The PAT (and the co-located `username` / `repo` credentials) are
// stored exclusively in `chrome.storage.local`.  `chrome.storage.sync` SHALL
// never be called with any of those keys.

const fc = require('fast-check');
const { saveCredentials } = require('../popup.js');
const { pushSubmission } = require('../background.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset the popup DOM before each property iteration. */
function setupPopupDOM() {
  document.body.innerHTML = `
    <input type="password" id="pat"      value="" />
    <input type="text"     id="username" value="" />
    <input type="text"     id="repo"     value="" />
    <button id="save-btn">Save</button>
    <div id="status"></div>
  `;
}

/**
 * Build a fresh chrome mock with spies on both storage.local.set and
 * storage.sync.set so we can assert which one was (or wasn't) called.
 */
function buildChromeMock() {
  return {
    storage: {
      local: {
        set: jest.fn((_data, cb) => { if (cb) cb(); }),
        get: jest.fn(),
      },
      sync: {
        set: jest.fn(),
        get: jest.fn(),
      },
    },
    runtime: {
      lastError: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Property test: popup.js — saveCredentials never writes to chrome.storage.sync
// ---------------------------------------------------------------------------

describe('popup.js — saveCredentials: PAT storage location (Property 19 / security model)', () => {
  // Feature: leetcode-github-sync, Property 19 / security model: PAT storage location

  test('chrome.storage.sync.set is never called when valid credentials are saved', () => {
    fc.assert(
      fc.property(
        fc.record({
          pat:      fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          username: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          repo:     fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        }),
        ({ pat, username, repo }) => {
          // Reset DOM and chrome mock for each run
          setupPopupDOM();
          const chromeMock = buildChromeMock();
          global.chrome = chromeMock;

          // Set field values to the generated credentials
          document.getElementById('pat').value      = pat;
          document.getElementById('username').value = username;
          document.getElementById('repo').value     = repo;

          saveCredentials();

          // storage.sync.set must NEVER have been called
          return chromeMock.storage.sync.set.mock.calls.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('chrome.storage.sync.set is never called even when some fields contain whitespace', () => {
    fc.assert(
      fc.property(
        fc.record({
          pat:      fc.string(),
          username: fc.string(),
          repo:     fc.string(),
        }),
        ({ pat, username, repo }) => {
          // Reset DOM and chrome mock for each run (including whitespace-only / empty cases)
          setupPopupDOM();
          const chromeMock = buildChromeMock();
          global.chrome = chromeMock;

          document.getElementById('pat').value      = pat;
          document.getElementById('username').value = username;
          document.getElementById('repo').value     = repo;

          saveCredentials();

          // Regardless of validation outcome, sync.set must never be touched
          return chromeMock.storage.sync.set.mock.calls.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('chrome.storage.local.set is called (not sync) when all credentials are valid', () => {
    fc.assert(
      fc.property(
        fc.record({
          pat:      fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          username: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          repo:     fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        }),
        ({ pat, username, repo }) => {
          setupPopupDOM();
          const chromeMock = buildChromeMock();
          global.chrome = chromeMock;

          document.getElementById('pat').value      = pat;
          document.getElementById('username').value = username;
          document.getElementById('repo').value     = repo;

          saveCredentials();

          // local.set must have been called exactly once; sync.set must be zero
          const localCalls = chromeMock.storage.local.set.mock.calls.length;
          const syncCalls  = chromeMock.storage.sync.set.mock.calls.length;

          return localCalls === 1 && syncCalls === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('the single chrome.storage.local.set call contains exactly the pat/username/repo keys', () => {
    fc.assert(
      fc.property(
        fc.record({
          pat:      fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          username: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          repo:     fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
        }),
        ({ pat, username, repo }) => {
          setupPopupDOM();
          const chromeMock = buildChromeMock();
          global.chrome = chromeMock;

          document.getElementById('pat').value      = pat.trim(); // use trimmed value as field value
          document.getElementById('username').value = username.trim();
          document.getElementById('repo').value     = repo.trim();

          saveCredentials();

          const calls = chromeMock.storage.local.set.mock.calls;
          if (calls.length !== 1) return false;

          const written = calls[0][0]; // first argument of the first call
          const keys = Object.keys(written).sort();

          // Must contain exactly { pat, username, repo } — no additional keys
          return (
            keys.length === 3 &&
            keys[0] === 'pat' &&
            keys[1] === 'repo' &&
            keys[2] === 'username'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property test: background.js — pushSubmission never reads from chrome.storage.sync
// ---------------------------------------------------------------------------

describe('background.js — pushSubmission: PAT storage location (Property 19 / security model)', () => {
  // Feature: leetcode-github-sync, Property 19 / security model: PAT storage location

  const VALID_PAYLOAD = {
    domain:        'dsa',
    topicSlug:     'array',
    problemNumber: '0001',
    problemSlug:   'two-sum',
    problemTitle:  'Two Sum',
    fileExtension: '.js',
    code:          'const x = 1;',
    notes:         '',
    description:   'Given an array of integers...',
  };

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Stub fetch to prevent real network calls
    global.fetch = () =>
      Promise.resolve({
        status: 201,
        json:   () => Promise.resolve({}),
      });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('pushSubmission reads credentials from chrome.storage.local.get, not chrome.storage.sync.get', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (pat) => {
          const syncGetSpy  = jest.fn();
          const localGetSpy = jest.fn((_keys, cb) => cb({ pat, username: 'user', repo: 'repo' }));

          global.chrome = {
            storage: {
              local:  { get: localGetSpy,  set: jest.fn() },
              sync:   { get: syncGetSpy,   set: jest.fn() },
            },
            runtime: { lastError: null },
          };

          // pushSubmission with no injected credentials — forces the chrome.storage path
          await pushSubmission(VALID_PAYLOAD);

          // storage.sync.get must never have been invoked
          return syncGetSpy.mock.calls.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('pushSubmission never writes to chrome.storage.sync', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (pat) => {
          const syncSetSpy  = jest.fn();
          const localGetSpy = jest.fn((_keys, cb) => cb({ pat, username: 'user', repo: 'repo' }));

          global.chrome = {
            storage: {
              local:  { get: localGetSpy, set: jest.fn() },
              sync:   { get: jest.fn(),   set: syncSetSpy },
            },
            runtime: { lastError: null },
          };

          await pushSubmission(VALID_PAYLOAD);

          // storage.sync.set must never have been called
          return syncSetSpy.mock.calls.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('when credentials are injected directly, chrome.storage.sync is still never touched', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          pat:      fc.string({ minLength: 1 }),
          username: fc.string({ minLength: 1 }),
          repo:     fc.string({ minLength: 1 }),
        }),
        async ({ pat, username, repo }) => {
          const syncGetSpy = jest.fn();
          const syncSetSpy = jest.fn();

          global.chrome = {
            storage: {
              local:  { get: jest.fn(), set: jest.fn() },
              sync:   { get: syncGetSpy, set: syncSetSpy },
            },
            runtime: { lastError: null },
          };

          // Pass credentials directly — bypasses chrome.storage entirely
          await pushSubmission(VALID_PAYLOAD, { pat, username, repo });

          // Even with injected credentials the sync API must never be touched
          return (
            syncGetSpy.mock.calls.length === 0 &&
            syncSetSpy.mock.calls.length === 0
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
