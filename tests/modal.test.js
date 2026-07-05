/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/problems/two-sum/description/"}
 */
// tests/modal.test.js — Unit tests for injectModal() in content.js
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8

const contentModule = require('../content');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid payload (same shape as scrapeSubmission() output). */
const SAMPLE_PAYLOAD = {
  problemNumber:  '0001',
  problemSlug:    'two-sum',
  problemTitle:   'Two Sum',
  topicSlug:      'array',
  language:       'Python3',
  fileExtension:  '.py',
  domain:         'dsa',
  code:           'def twoSum(): pass',
  description:    'Given an array of integers...',
};

/** Reset the DOM and the isModalOpen flag before each test. */
function resetDOM() {
  document.body.innerHTML = '';
  contentModule.isModalOpen = false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('injectModal', () => {
  beforeEach(() => {
    resetDOM();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up any keydown listeners by removing and re-adding the modal
    // (removing the modal in the test body calls removeEventListener)
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    contentModule.isModalOpen = false;
  });

  // ---- Requirement 5.1 — Modal is injected into document.body ----

  test('appends #lgs-modal to document.body', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    expect(document.getElementById('lgs-modal')).not.toBeNull();
    expect(document.body.contains(document.getElementById('lgs-modal'))).toBe(true);
  });

  test('sets isModalOpen to true on injection', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    expect(contentModule.isModalOpen).toBe(true);
  });

  // ---- Requirement 5.2 — Notes textarea ----

  test('creates #lgs-notes textarea inside the modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const textarea = document.getElementById('lgs-notes');
    expect(textarea).not.toBeNull();
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
  });

  test('#lgs-notes textarea has maxlength of 10000', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const textarea = document.getElementById('lgs-notes');
    expect(textarea.maxLength).toBe(10000);
  });

  test('#lgs-notes textarea is empty by default', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const textarea = document.getElementById('lgs-notes');
    expect(textarea.value).toBe('');
  });

  // ---- Requirement 5.3 — Submit button ----

  test('creates #lgs-submit-btn button inside the modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const btn = document.getElementById('lgs-submit-btn');
    expect(btn).not.toBeNull();
    expect(btn.tagName.toLowerCase()).toBe('button');
  });

  test('#lgs-submit-btn has the correct label text', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const btn = document.getElementById('lgs-submit-btn');
    expect(btn.textContent).toBe('Submit & Push to GitHub');
  });

  // ---- Requirement 5.4 — Spinner hidden by default ----

  test('creates #lgs-spinner element inside the modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const spinner = document.getElementById('lgs-spinner');
    expect(spinner).not.toBeNull();
  });

  test('#lgs-spinner is hidden by default (display: none)', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const spinner = document.getElementById('lgs-spinner');
    expect(spinner.style.display).toBe('none');
  });

  // ---- Additional required elements ----

  test('creates #lgs-close-btn button inside the modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const closeBtn = document.getElementById('lgs-close-btn');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.tagName.toLowerCase()).toBe('button');
  });

  test('#lgs-close-btn shows the × character', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const closeBtn = document.getElementById('lgs-close-btn');
    expect(closeBtn.textContent).toBe('×');
  });

  test('creates #lgs-status element inside the modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const status = document.getElementById('lgs-status');
    expect(status).not.toBeNull();
  });

  // ---- All child elements are inside #lgs-modal ----

  test('all required child elements are inside #lgs-modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const modal = document.getElementById('lgs-modal');
    expect(modal.contains(document.getElementById('lgs-notes'))).toBe(true);
    expect(modal.contains(document.getElementById('lgs-submit-btn'))).toBe(true);
    expect(modal.contains(document.getElementById('lgs-spinner'))).toBe(true);
    expect(modal.contains(document.getElementById('lgs-close-btn'))).toBe(true);
    expect(modal.contains(document.getElementById('lgs-status'))).toBe(true);
  });

  // ---- Idempotency guard ----

  test('does NOT inject a second modal if one already exists', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    contentModule.injectModal(SAMPLE_PAYLOAD); // second call — should be a no-op
    const modals = document.querySelectorAll('#lgs-modal');
    expect(modals.length).toBe(1);
  });

  test('returns early without side-effects when modal already exists', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const firstModal = document.getElementById('lgs-modal');
    contentModule.injectModal(SAMPLE_PAYLOAD); // no-op
    // The exact same element should still be there
    expect(document.getElementById('lgs-modal')).toBe(firstModal);
  });

  // ---- Close button dismisses the modal ----

  test('close button click removes the modal from the DOM', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const closeBtn = document.getElementById('lgs-close-btn');
    closeBtn.click();
    expect(document.getElementById('lgs-modal')).toBeNull();
  });

  test('close button click sets isModalOpen to false', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    const closeBtn = document.getElementById('lgs-close-btn');
    closeBtn.click();
    expect(contentModule.isModalOpen).toBe(false);
  });

  // ---- Escape key dismisses the modal ----

  test('Escape keydown removes the modal from the DOM', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    expect(document.getElementById('lgs-modal')).not.toBeNull();

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escapeEvent);

    expect(document.getElementById('lgs-modal')).toBeNull();
  });

  test('Escape keydown sets isModalOpen to false', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escapeEvent);

    expect(contentModule.isModalOpen).toBe(false);
  });

  test('non-Escape keydown does NOT remove the modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    document.dispatchEvent(enterEvent);

    expect(document.getElementById('lgs-modal')).not.toBeNull();
  });

  // ---- After dismissal, a new modal can be injected ----

  test('a new modal can be injected after the previous one was closed', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-close-btn').click();

    // isModalOpen is now false, #lgs-modal is gone — inject again
    contentModule.injectModal(SAMPLE_PAYLOAD);
    expect(document.getElementById('lgs-modal')).not.toBeNull();
    expect(contentModule.isModalOpen).toBe(true);
  });

  // ---- Escape does not fire after modal is already removed ----

  test('Escape key after close button does not throw or re-remove a removed modal', () => {
    contentModule.injectModal(SAMPLE_PAYLOAD);
    document.getElementById('lgs-close-btn').click(); // removes modal + listener

    // A second Escape dispatch should be harmless
    expect(() => {
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(escapeEvent);
    }).not.toThrow();

    expect(document.getElementById('lgs-modal')).toBeNull();
  });

  // ---- Submit flow — Requirements 5.5, 5.6, 5.7, 5.8 ----

  describe('submit flow', () => {
    let sendMessageMock;

    beforeEach(() => {
      resetDOM();
      // Mock chrome.runtime.sendMessage — captured callback is called manually
      sendMessageMock = jest.fn();
      global.chrome = {
        runtime: {
          sendMessage: sendMessageMock,
        },
      };
    });

    afterEach(() => {
      delete global.chrome;
      jest.useRealTimers();
    });

    // Requirement 5.5 — spinner shown and button disabled on click
    test('clicking submit shows spinner and disables button', () => {
      contentModule.injectModal(SAMPLE_PAYLOAD);

      // sendMessage does NOT call the callback — we want to observe the in-progress state
      sendMessageMock.mockImplementation(() => {});

      const submitBtn = document.getElementById('lgs-submit-btn');
      const spinner   = document.getElementById('lgs-spinner');

      submitBtn.click();

      expect(spinner.style.display).not.toBe('none');
      expect(submitBtn.disabled).toBe(true);
    });

    // Requirement 5.6 — sendMessage called with correct type and payload including notes
    test('clicking submit calls sendMessage with PUSH_SUBMISSION type and notes in payload', () => {
      contentModule.injectModal(SAMPLE_PAYLOAD);
      sendMessageMock.mockImplementation(() => {});

      // Enter notes text
      const notesTextarea = document.getElementById('lgs-notes');
      notesTextarea.value = 'My approach: two-pointer technique';

      document.getElementById('lgs-submit-btn').click();

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const [message] = sendMessageMock.mock.calls[0];
      expect(message.type).toBe('PUSH_SUBMISSION');
      expect(message.payload).toMatchObject({
        ...SAMPLE_PAYLOAD,
        notes: 'My approach: two-pointer technique',
      });
    });

    // Requirement 5.7 — success response hides spinner, shows success text, removes modal after 2000ms
    test('success response hides spinner, shows success text, and removes modal after 2000ms', () => {
      jest.useFakeTimers();
      contentModule.injectModal(SAMPLE_PAYLOAD);

      // Capture the sendMessage callback so we can invoke it synchronously
      sendMessageMock.mockImplementation((_msg, callback) => {
        callback({ ok: true });
      });

      document.getElementById('lgs-submit-btn').click();

      const spinner = document.getElementById('lgs-spinner');
      const status  = document.getElementById('lgs-status');

      // Spinner should be hidden and status should show success immediately after callback
      expect(spinner.style.display).toBe('none');
      expect(status.textContent).toBe('Pushed successfully!');

      // Modal should still be present before the 2000ms timeout fires
      expect(document.getElementById('lgs-modal')).not.toBeNull();

      // Advance timers by 2000ms — modal should be removed
      jest.advanceTimersByTime(2000);
      expect(document.getElementById('lgs-modal')).toBeNull();
    });

    // Requirement 5.8 — error response hides spinner, shows error text, re-enables button
    test('error response hides spinner, shows error text in status, and re-enables button', () => {
      contentModule.injectModal(SAMPLE_PAYLOAD);

      sendMessageMock.mockImplementation((_msg, callback) => {
        callback({ ok: false, error: 'GitHub API returned 401' });
      });

      const submitBtn = document.getElementById('lgs-submit-btn');
      const spinner   = document.getElementById('lgs-spinner');
      const status    = document.getElementById('lgs-status');

      submitBtn.click();

      expect(spinner.style.display).toBe('none');
      expect(status.textContent).toBe('GitHub API returned 401');
      expect(submitBtn.disabled).toBe(false);
    });

    // Requirement 5.10 — dismiss while spinner is visible: close removes modal even with spinner showing
    test('dismiss while spinner visible: close button click removes modal even when spinner is showing', () => {
      contentModule.injectModal(SAMPLE_PAYLOAD);

      // sendMessage is in-flight — callback is never called automatically
      sendMessageMock.mockImplementation(() => {});

      const submitBtn = document.getElementById('lgs-submit-btn');
      const spinner   = document.getElementById('lgs-spinner');

      // Trigger submit to start the in-progress state
      submitBtn.click();

      // Verify we are in the in-progress state (spinner visible, button disabled)
      expect(spinner.style.display).not.toBe('none');
      expect(submitBtn.disabled).toBe(true);

      // Now dismiss via close button while the spinner is still showing
      const closeBtn = document.getElementById('lgs-close-btn');
      closeBtn.click();

      // Modal must be removed and isModalOpen must be false
      expect(document.getElementById('lgs-modal')).toBeNull();
      expect(contentModule.isModalOpen).toBe(false);
    });

    // Requirement 5.10 — dismiss while spinner visible: sendMessage callback is a no-op if modal gone
    test('dismiss while spinner visible: sendMessage callback is no-op if modal already removed', () => {
      contentModule.injectModal(SAMPLE_PAYLOAD);

      // Hold the captured callback so we can invoke it AFTER the modal is dismissed
      let capturedCallback;
      sendMessageMock.mockImplementation((_msg, callback) => {
        capturedCallback = callback;
      });

      // Start the in-progress state
      document.getElementById('lgs-submit-btn').click();

      // Dismiss the modal while the push is in flight
      document.getElementById('lgs-close-btn').click();
      expect(document.getElementById('lgs-modal')).toBeNull();

      // Now simulate the background worker responding AFTER the modal is gone
      // The callback must not throw and must not re-inject or manipulate any element
      expect(() => {
        capturedCallback({ ok: true });
      }).not.toThrow();

      // Modal must remain absent — the callback must not put it back
      expect(document.getElementById('lgs-modal')).toBeNull();
      expect(contentModule.isModalOpen).toBe(false);
    });
  });
});

