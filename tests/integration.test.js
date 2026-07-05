/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/integration.test.js — Integration tests for the full PUSH_SUBMISSION message round-trip
// Requirements: 5.6, 5.7, 5.8, 7.1

const contentModule = require('../content');
const { pushSubmission } = require('../background');

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** A complete, valid scraped-submission payload (matches PushPayload shape). */
const SAMPLE_PAYLOAD = {
  problemNumber: '0001',
  problemSlug:   'two-sum',
  problemTitle:  'Two Sum',
  topicSlug:     'array',
  language:      'Python3',
  fileExtension: '.py',
  domain:        'dsa',
  code:          'def twoSum(nums, target): pass',
  description:   'Given an array of integers...',
};

/** Helper: reset jsdom body and the isModalOpen flag before each test. */
function resetDOM() {
  document.body.innerHTML = '';
  contentModule.isModalOpen = false;
}

// ---------------------------------------------------------------------------
// Test Suite 1 — Content → background message shape (Requirement 5.6)
//
// When injectModal(payload) submit button is clicked in jsdom,
// chrome.runtime.sendMessage is called with:
//   { type: 'PUSH_SUBMISSION', payload: { ...payload, notes } }
// ---------------------------------------------------------------------------

describe('Integration: content → background message shape', () => {
  let sendMessageMock;

  beforeEach(() => {
    resetDOM();
    sendMessageMock = jest.fn();
    global.chrome = { runtime: { sendMessage: sendMessageMock } };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.chrome;
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  });

  test('submit click sends { type: "PUSH_SUBMISSION", payload: { ...payload, notes: "" } } when notes is empty', () => {
    sendMessageMock.mockImplementation(() => {}); // don't invoke callback
    contentModule.injectModal(SAMPLE_PAYLOAD);

    document.getElementById('lgs-submit-btn').click();

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const [message] = sendMessageMock.mock.calls[0];
    expect(message.type).toBe('PUSH_SUBMISSION');
    expect(message.payload).toEqual({ ...SAMPLE_PAYLOAD, notes: '' });
  });

  test('submit click sends notes text entered by the user in the textarea', () => {
    sendMessageMock.mockImplementation(() => {});
    contentModule.injectModal(SAMPLE_PAYLOAD);

    document.getElementById('lgs-notes').value = 'Hash map, O(n) time.';
    document.getElementById('lgs-submit-btn').click();

    const [message] = sendMessageMock.mock.calls[0];
    expect(message.type).toBe('PUSH_SUBMISSION');
    expect(message.payload).toEqual({ ...SAMPLE_PAYLOAD, notes: 'Hash map, O(n) time.' });
  });

  test('payload sent to sendMessage includes all 10 required fields (including notes)', () => {
    sendMessageMock.mockImplementation(() => {});
    contentModule.injectModal(SAMPLE_PAYLOAD);

    document.getElementById('lgs-notes').value = 'My approach';
    document.getElementById('lgs-submit-btn').click();

    const [message] = sendMessageMock.mock.calls[0];
    const p = message.payload;
    const requiredFields = [
      'problemNumber', 'problemSlug', 'problemTitle', 'domain',
      'topicSlug', 'language', 'fileExtension', 'code', 'notes', 'description',
    ];
    for (const field of requiredFields) {
      expect(p).toHaveProperty(field);
      expect(p[field]).not.toBeUndefined();
      expect(p[field]).not.toBeNull();
    }
  });

  test('sendMessage is called exactly once per submit click', () => {
    sendMessageMock.mockImplementation(() => {});
    contentModule.injectModal(SAMPLE_PAYLOAD);

    document.getElementById('lgs-submit-btn').click();

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 2 — Background handler success (Requirement 7.1, 5.7)
//
// The message handler logic (simulated via pushSubmission with mocked
// credentials/fetch) returns { ok: true } and the modal receives and
// displays the success state.
// ---------------------------------------------------------------------------

describe('Integration: background handler success path', () => {
  let sendMessageMock;

  beforeEach(() => {
    resetDOM();
    sendMessageMock = jest.fn();
    global.chrome = { runtime: { sendMessage: sendMessageMock } };
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  });

  test('pushSubmission returns { ok: true } when both solution and README PUTs succeed', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })          // GET solution
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })          // PUT solution
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })          // GET README
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });         // PUT README

    const result = await pushSubmission(
      { ...SAMPLE_PAYLOAD, notes: '' },
      { pat: 'ghp_test', username: 'testuser', repo: 'solutions' },
    );

    expect(result).toEqual({ ok: true });
  });

  test('modal transitions to success state when sendMessage callback receives { ok: true }', () => {
    jest.useFakeTimers();
    // Wire sendMessage to immediately invoke callback with success
    sendMessageMock.mockImplementation((_msg, callback) => {
      callback({ ok: true });
    });

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    const spinner   = document.getElementById('lgs-spinner');
    const statusEl  = document.getElementById('lgs-status');
    const submitBtn = document.getElementById('lgs-submit-btn');

    // Spinner should be hidden after success callback
    expect(spinner.style.display).toBe('none');
    // Success message must be displayed
    expect(statusEl.textContent).toBe('Pushed successfully!');
    // Modal still present before 2000ms elapses
    expect(document.getElementById('lgs-modal')).not.toBeNull();

    // Advance 2000ms — modal should auto-remove
    jest.advanceTimersByTime(2000);
    expect(document.getElementById('lgs-modal')).toBeNull();
    expect(contentModule.isModalOpen).toBe(false);
  });

  test('success: spinner is hidden immediately after callback (not still spinning)', () => {
    sendMessageMock.mockImplementation((_msg, callback) => {
      callback({ ok: true });
    });
    jest.useFakeTimers();

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-spinner').style.display).toBe('none');
  });

  test('success: submit button remains disabled during 2000ms grace period', () => {
    jest.useFakeTimers();
    sendMessageMock.mockImplementation((_msg, callback) => {
      callback({ ok: true });
    });

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    // During the 2000ms the button should stay disabled (no reason to re-enable it)
    expect(document.getElementById('lgs-submit-btn').disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 3 — Background handler error (Requirement 5.8)
//
// The message handler returns { ok: false, error: 'GitHub API error' } and
// the modal displays the error and re-enables the submit button.
// ---------------------------------------------------------------------------

describe('Integration: background handler error path', () => {
  let sendMessageMock;

  beforeEach(() => {
    resetDOM();
    sendMessageMock = jest.fn();
    global.chrome = { runtime: { sendMessage: sendMessageMock } };
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.chrome;
    delete global.fetch;
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  });

  test('pushSubmission returns { ok: false, error } when solution PUT returns non-2xx', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })          // GET solution
      .mockResolvedValueOnce({
        status: 422,
        json: async () => ({ message: 'GitHub API error' }),
      });                                                                        // PUT solution fails

    const result = await pushSubmission(
      { ...SAMPLE_PAYLOAD, notes: '' },
      { pat: 'ghp_test', username: 'testuser', repo: 'solutions' },
    );

    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('422');
  });

  test('modal displays error text and re-enables submit button when callback receives { ok: false, error }', () => {
    sendMessageMock.mockImplementation((_msg, callback) => {
      callback({ ok: false, error: 'GitHub API error' });
    });

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    const spinner   = document.getElementById('lgs-spinner');
    const statusEl  = document.getElementById('lgs-status');
    const submitBtn = document.getElementById('lgs-submit-btn');

    // Spinner must be hidden
    expect(spinner.style.display).toBe('none');
    // Error text must appear in the status area
    expect(statusEl.textContent).toBe('GitHub API error');
    // Submit button must be re-enabled so the user can retry
    expect(submitBtn.disabled).toBe(false);
  });

  test('modal stays in the DOM after an error response (user can retry)', () => {
    sendMessageMock.mockImplementation((_msg, callback) => {
      callback({ ok: false, error: 'Network failure' });
    });

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-modal')).not.toBeNull();
    expect(contentModule.isModalOpen).toBe(true);
  });

  test('modal displays generic fallback message when error property is missing', () => {
    sendMessageMock.mockImplementation((_msg, callback) => {
      callback({ ok: false }); // no error field
    });

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    const statusEl = document.getElementById('lgs-status');
    expect(statusEl.textContent).toBe('An unknown error occurred.');
    expect(document.getElementById('lgs-submit-btn').disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test Suite 4 — Both ok:true and ok:false branches (Requirements 5.7, 5.8)
//
// The modal correctly handles both response shapes:
//   ok:true  → shows success text and removes modal after 2000ms
//   ok:false → shows error text and re-enables button
// ---------------------------------------------------------------------------

describe('Integration: modal handles both ok:true and ok:false response shapes', () => {
  let sendMessageMock;

  beforeEach(() => {
    resetDOM();
    sendMessageMock = jest.fn();
    global.chrome = { runtime: { sendMessage: sendMessageMock } };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.chrome;
    jest.restoreAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  });

  // --- ok:true branch ---

  test('ok:true branch: status text is "Pushed successfully!"', () => {
    jest.useFakeTimers();
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: true }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-status').textContent).toBe('Pushed successfully!');
  });

  test('ok:true branch: modal is still present immediately after response (before 2000ms)', () => {
    jest.useFakeTimers();
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: true }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-modal')).not.toBeNull();
  });

  test('ok:true branch: modal is removed exactly after 2000ms', () => {
    jest.useFakeTimers();
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: true }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    jest.advanceTimersByTime(1999);
    expect(document.getElementById('lgs-modal')).not.toBeNull();

    jest.advanceTimersByTime(1);
    expect(document.getElementById('lgs-modal')).toBeNull();
  });

  test('ok:true branch: isModalOpen is false after 2000ms removal', () => {
    jest.useFakeTimers();
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: true }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    jest.advanceTimersByTime(2000);
    expect(contentModule.isModalOpen).toBe(false);
  });

  test('ok:true branch: spinner is hidden immediately after callback', () => {
    jest.useFakeTimers();
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: true }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-spinner').style.display).toBe('none');
  });

  // --- ok:false branch ---

  test('ok:false branch: status text shows the error string from response', () => {
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: false, error: 'HTTP 403: Forbidden' }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-status').textContent).toBe('HTTP 403: Forbidden');
  });

  test('ok:false branch: spinner is hidden after error callback', () => {
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: false, error: 'HTTP 500' }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-spinner').style.display).toBe('none');
  });

  test('ok:false branch: submit button is re-enabled after error callback', () => {
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: false, error: 'HTTP 500' }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-submit-btn').disabled).toBe(false);
  });

  test('ok:false branch: modal remains in the DOM (not removed on error)', () => {
    sendMessageMock.mockImplementation((_msg, cb) => cb({ ok: false, error: 'Error' }));

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-modal')).not.toBeNull();
  });

  // --- Round-trip: content sends message, simulated background responds ---

  test('full round-trip: content sends correct shape → simulated ok:true response → modal shows success then removes', () => {
    jest.useFakeTimers();

    // Simulate background: capture message, validate shape, respond with ok:true
    sendMessageMock.mockImplementation((msg, callback) => {
      // Validate the message shape mirrors what background.js expects
      expect(msg.type).toBe('PUSH_SUBMISSION');
      expect(msg.payload).toMatchObject({ ...SAMPLE_PAYLOAD, notes: 'Round-trip notes' });
      callback({ ok: true });
    });

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-notes').value = 'Round-trip notes';
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-status').textContent).toBe('Pushed successfully!');

    jest.advanceTimersByTime(2000);
    expect(document.getElementById('lgs-modal')).toBeNull();
  });

  test('full round-trip: content sends correct shape → simulated ok:false response → modal shows error', () => {
    sendMessageMock.mockImplementation((msg, callback) => {
      expect(msg.type).toBe('PUSH_SUBMISSION');
      callback({ ok: false, error: 'GitHub API error' });
    });

    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-notes').value = 'Notes for error test';
    document.getElementById('lgs-submit-btn').click();

    expect(document.getElementById('lgs-status').textContent).toBe('GitHub API error');
    expect(document.getElementById('lgs-submit-btn').disabled).toBe(false);
    expect(document.getElementById('lgs-modal')).not.toBeNull();
  });
});
