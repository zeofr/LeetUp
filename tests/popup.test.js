/**
 * @jest-environment jsdom
 */
// Feature: leetcode-github-sync
// Tests for popup.js — credential read, pre-population, and save with validation
// (Requirements 1.4, 1.5, 1.6, 1.8, 1.9)

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

  // Reset chrome mock before each test
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
      },
    },
    runtime: {},
  };

  // Reset fake timers (some tests use them)
  jest.useRealTimers();
});

// ─── populateFields ───────────────────────────────────────────────────────────

describe('populateFields', () => {
  test('populates all three fields with stored values', () => {
    populateFields({ pat: 'my-pat', username: 'octocat', repo: 'my-repo' });

    expect(document.getElementById('pat').value).toBe('my-pat');
    expect(document.getElementById('username').value).toBe('octocat');
    expect(document.getElementById('repo').value).toBe('my-repo');
  });

  test('leaves fields empty when storage returns empty object', () => {
    document.getElementById('pat').value = 'existing';
    document.getElementById('username').value = 'existing';
    document.getElementById('repo').value = 'existing';

    populateFields({});

    expect(document.getElementById('pat').value).toBe('');
    expect(document.getElementById('username').value).toBe('');
    expect(document.getElementById('repo').value).toBe('');
  });

  test('leaves individual fields empty when only some keys are stored', () => {
    populateFields({ pat: 'only-pat' });

    expect(document.getElementById('pat').value).toBe('only-pat');
    expect(document.getElementById('username').value).toBe('');
    expect(document.getElementById('repo').value).toBe('');
  });

  test('leaves all fields empty when called with undefined values', () => {
    populateFields({ pat: undefined, username: undefined, repo: undefined });

    expect(document.getElementById('pat').value).toBe('');
    expect(document.getElementById('username').value).toBe('');
    expect(document.getElementById('repo').value).toBe('');
  });
});

// ─── chrome.storage.local.get callback behaviour ─────────────────────────────

describe('chrome.storage read on DOMContentLoaded', () => {
  test('populates fields with stored credentials when read succeeds', () => {
    const stored = { pat: 'ghp_token', username: 'dev', repo: 'solutions' };

    chrome.storage.local.get.mockImplementation((_keys, callback) => {
      callback(stored);
    });

    chrome.storage.local.get(['pat', 'username', 'repo'], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        populateFields({});
        return;
      }
      populateFields(result);
    });

    expect(document.getElementById('pat').value).toBe('ghp_token');
    expect(document.getElementById('username').value).toBe('dev');
    expect(document.getElementById('repo').value).toBe('solutions');
  });

  test('renders all fields empty when read fails (lastError set) — Req 1.9', () => {
    document.getElementById('pat').value = 'old-pat';
    document.getElementById('username').value = 'old-user';
    document.getElementById('repo').value = 'old-repo';

    chrome.runtime.lastError = { message: 'Storage read failed' };

    chrome.storage.local.get.mockImplementation((_keys, callback) => {
      callback({});
    });

    chrome.storage.local.get(['pat', 'username', 'repo'], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        populateFields({});
        return;
      }
      populateFields(result);
    });

    expect(document.getElementById('pat').value).toBe('');
    expect(document.getElementById('username').value).toBe('');
    expect(document.getElementById('repo').value).toBe('');
  });

  test('leaves fields empty when storage returns empty object (keys not present)', () => {
    chrome.storage.local.get.mockImplementation((_keys, callback) => {
      callback({});
    });

    chrome.storage.local.get(['pat', 'username', 'repo'], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        populateFields({});
        return;
      }
      populateFields(result);
    });

    expect(document.getElementById('pat').value).toBe('');
    expect(document.getElementById('username').value).toBe('');
    expect(document.getElementById('repo').value).toBe('');
  });

  test('does not show an error message in #status when read fails — Req 1.9', () => {
    chrome.runtime.lastError = { message: 'Some error' };

    chrome.storage.local.get.mockImplementation((_keys, callback) => {
      callback({});
    });

    chrome.storage.local.get(['pat', 'username', 'repo'], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        populateFields({});
        return;
      }
      populateFields(result);
    });

    expect(document.getElementById('status').textContent).toBe('');
  });
});

// ─── saveCredentials — validation (Req 1.4) ──────────────────────────────────

describe('saveCredentials — validation', () => {
  test('empty PAT: storage not written and error shown in #status', () => {
    document.getElementById('pat').value      = '';
    document.getElementById('username').value = 'octocat';
    document.getElementById('repo').value     = 'my-repo';

    saveCredentials();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).not.toBe('');
  });

  test('whitespace-only username: storage not written and error shown in #status', () => {
    document.getElementById('pat').value      = 'ghp_valid_token';
    document.getElementById('username').value = '   ';
    document.getElementById('repo').value     = 'my-repo';

    saveCredentials();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).not.toBe('');
  });

  test('empty repo: storage not written and error shown in #status', () => {
    document.getElementById('pat').value      = 'ghp_valid_token';
    document.getElementById('username').value = 'octocat';
    document.getElementById('repo').value     = '';

    saveCredentials();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(document.getElementById('status').textContent).not.toBe('');
  });

  test('all valid: storage.set called once with trimmed values', () => {
    document.getElementById('pat').value      = '  ghp_token  ';
    document.getElementById('username').value = '  octocat  ';
    document.getElementById('repo').value     = '  my-repo  ';

    chrome.storage.local.set.mockImplementation((_data, callback) => {
      if (callback) callback();
    });

    saveCredentials();

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { pat: 'ghp_token', username: 'octocat', repo: 'my-repo' },
      expect.any(Function)
    );
  });
});

// ─── saveCredentials — success feedback (Req 1.5) ────────────────────────────

describe('saveCredentials — success feedback', () => {
  test('storage write success: button shows "Saved!" immediately after save', () => {
    jest.useFakeTimers();

    document.getElementById('pat').value      = 'ghp_token';
    document.getElementById('username').value = 'octocat';
    document.getElementById('repo').value     = 'my-repo';

    chrome.storage.local.set.mockImplementation((_data, callback) => {
      if (callback) callback();
    });

    saveCredentials();

    expect(document.getElementById('save-btn').textContent).toBe('Saved!');
  });

  test('storage write success: button reverts to "Save" after 1500 ms', () => {
    jest.useFakeTimers();

    document.getElementById('pat').value      = 'ghp_token';
    document.getElementById('username').value = 'octocat';
    document.getElementById('repo').value     = 'my-repo';

    chrome.storage.local.set.mockImplementation((_data, callback) => {
      if (callback) callback();
    });

    saveCredentials();

    // Still "Saved!" just before the timeout
    jest.advanceTimersByTime(1499);
    expect(document.getElementById('save-btn').textContent).toBe('Saved!');

    // Reverted after 1500 ms
    jest.advanceTimersByTime(1);
    expect(document.getElementById('save-btn').textContent).toBe('Save');
  });
});

// ─── saveCredentials — write failure (Req 1.8) ───────────────────────────────

describe('saveCredentials — write failure', () => {
  test('storage write failure: error shown in #status and field values preserved', () => {
    document.getElementById('pat').value      = 'ghp_token';
    document.getElementById('username').value = 'octocat';
    document.getElementById('repo').value     = 'my-repo';

    chrome.runtime.lastError = { message: 'Disk full' };

    chrome.storage.local.set.mockImplementation((_data, callback) => {
      if (callback) callback();
    });

    saveCredentials();

    // Error displayed
    expect(document.getElementById('status').textContent).not.toBe('');

    // Field values preserved (not cleared)
    expect(document.getElementById('pat').value).toBe('ghp_token');
    expect(document.getElementById('username').value).toBe('octocat');
    expect(document.getElementById('repo').value).toBe('my-repo');
  });

  test('storage write failure: error message contains the lastError description', () => {
    document.getElementById('pat').value      = 'ghp_token';
    document.getElementById('username').value = 'octocat';
    document.getElementById('repo').value     = 'my-repo';

    chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };

    chrome.storage.local.set.mockImplementation((_data, callback) => {
      if (callback) callback();
    });

    saveCredentials();

    expect(document.getElementById('status').textContent).toBe('QUOTA_BYTES quota exceeded');
  });
});
