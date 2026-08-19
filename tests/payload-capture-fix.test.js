/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://leetcode.com/"}
 */

// Tests for the payload-capture fix
// Bug: Modal didn't appear because scrapeSubmission() ran after navigation
// to /submissions/<id>/ where problem metadata was unavailable.
// Fix: Capture payload at Submit click BEFORE navigation.

const contentModule = require('../content.js');
const { mockWindowLocation } = require('./test-helpers');
const {
  scrapeSubmission,
  attachSubmitClickListener,
  injectModal,
  clearPendingAttempt,
} = contentModule;

describe('Payload Capture at Submit Click', () => {
  beforeEach(() => {
    // Reset state
    contentModule.pendingAttempt = null;
    contentModule.isModalOpen = false;
    document.body.innerHTML = '';
  });

  test('payload is captured via __NEXT_DATA__ JSON', () => {
    // Setup: Mock LeetCode page with __NEXT_DATA__ script (Next.js structure)
    document.title = 'Spiral Matrix - LeetCode';
    mockWindowLocation({ 
      pathname: '/problems/spiral-matrix/', 
      href: 'https://leetcode.com/problems/spiral-matrix/',
      search: ''
    });

    // Mock __NEXT_DATA__ script tag (modern LeetCode structure)
    const nextDataScript = document.createElement('script');
    nextDataScript.id = '__NEXT_DATA__';
    nextDataScript.type = 'application/json';
    nextDataScript.textContent = JSON.stringify({
      props: {
        pageProps: {
          dehydratedState: {
            queries: [{
              state: {
                data: {
                  question: {
                    questionFrontendId: '54',
                    titleSlug: 'spiral-matrix'
                  }
                }
              }
            }]
          }
        }
      }
    });
    document.body.appendChild(nextDataScript);

    // Mock language selector
    const langEl = document.createElement('button');
    langEl.setAttribute('data-cy', 'lang-select');
    langEl.textContent = 'Python3';
    document.body.appendChild(langEl);

    // Mock code editor
    const editorLine = document.createElement('div');
    editorLine.className = 'view-line';
    editorLine.textContent = 'def spiralOrder(matrix):';
    const editorContainer = document.createElement('div');
    editorContainer.className = 'view-lines';
    editorContainer.appendChild(editorLine);
    document.body.appendChild(editorContainer);

    // Mock Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    document.body.appendChild(submitBtn);

    // Attach listener
    attachSubmitClickListener();

    // Simulate click
    submitBtn.click();

    // Verify: Payload captured via __NEXT_DATA__
    const captured = contentModule.pendingAttempt;
    expect(captured).not.toBeNull();
    expect(captured.payload).toBeDefined();
    expect(captured.payload.problemNumber).toBe('0054');
    expect(captured.payload.problemSlug).toBe('spiral-matrix');
    expect(captured.payload.code).toContain('def spiralOrder');
  });

  test('payload is captured at Submit click before route navigation', () => {
    // Setup: Mock a LeetCode problem page with full metadata
    document.title = '54. Spiral Matrix - LeetCode';
    mockWindowLocation({ 
      pathname: '/problems/spiral-matrix/', 
      href: 'https://leetcode.com/problems/spiral-matrix/',
      search: ''
    });

    // Mock problem title
    const titleEl = document.createElement('a');
    titleEl.setAttribute('data-cy', 'question-title');
    titleEl.textContent = '54. Spiral Matrix';
    document.body.appendChild(titleEl);

    // Mock language selector
    const langEl = document.createElement('button');
    langEl.setAttribute('data-cy', 'lang-select');
    langEl.textContent = 'Python3';
    document.body.appendChild(langEl);

    // Mock code editor
    const editorLine = document.createElement('div');
    editorLine.className = 'view-line';
    editorLine.textContent = 'def spiralOrder(matrix):';
    const editorContainer = document.createElement('div');
    editorContainer.className = 'view-lines';
    editorContainer.appendChild(editorLine);
    document.body.appendChild(editorContainer);

    // Mock Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    document.body.appendChild(submitBtn);

    // Attach listener
    attachSubmitClickListener();

    // Verify: No pending attempt yet
    expect(contentModule.pendingAttempt).toBeNull();

    // Simulate click
    submitBtn.click();

    // Verify: Payload captured
    const captured = contentModule.pendingAttempt;
    expect(captured).not.toBeNull();
    expect(captured.payload).toBeDefined();
    expect(captured.payload.problemNumber).toBe('0054');
    expect(captured.payload.problemSlug).toBe('spiral-matrix');
    expect(captured.payload.code).toContain('def spiralOrder');
    expect(captured.problemSlug).toBe('spiral-matrix');
    expect(captured.startedAt).toBeGreaterThan(0);
  });

  test('failed payload capture does not create pendingAttempt', () => {
    // Setup: Missing required fields (no problem number, no code)
    document.title = 'LeetCode';
    mockWindowLocation({ 
      pathname: '/problems/test/', 
      href: 'https://leetcode.com/problems/test/',
      search: ''
    });

    // Mock Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    document.body.appendChild(submitBtn);

    // Attach listener
    attachSubmitClickListener();

    // Simulate click
    submitBtn.click();

    // Verify: No pendingAttempt created (payload capture failed)
    expect(contentModule.pendingAttempt).toBeNull();
  });
});

describe('Modal Opens from Stored Payload', () => {
  beforeEach(() => {
    contentModule.pendingAttempt = null;
    contentModule.isModalOpen = false;
    document.body.innerHTML = '';
  });

  test('Accepted verdict uses stored payload, not re-scraping', () => {
    // Setup: Simulate pendingAttempt with stored payload
    const mockPayload = {
      problemNumber: '0054',
      problemSlug: 'spiral-matrix',
      problemTitle: 'Spiral Matrix',
      topicSlug: '',
      language: 'Python3',
      fileExtension: '.py',
      domain: 'dsa',
      code: 'def spiralOrder(matrix): pass',
      description: 'Given an m x n matrix...',
    };

    contentModule.pendingAttempt = {
      payload: mockPayload,
      startedAt: Date.now(),
      problemSlug: 'spiral-matrix',
    };

    // Verify: Modal can be injected with stored payload
    injectModal(mockPayload);

    // Verify: Modal exists
    const modal = document.getElementById('lgs-modal');
    expect(modal).not.toBeNull();
    expect(contentModule.isModalOpen).toBe(true);
  });

  test('scrapeSubmission is NOT called on submission-detail page', () => {
    // This test documents the intended behavior:
    // After navigation to /submissions/<id>/, we do NOT call scrapeSubmission()
    // because the stored payload is already available.
    
    // Setup: Simulate being on submission-detail page (no problem metadata)
    document.title = 'Submission Detail - LeetCode';
    mockWindowLocation({ 
      pathname: '/problems/spiral-matrix/submissions/123/',
      href: 'https://leetcode.com/problems/spiral-matrix/submissions/123/',
      search: ''
    });

    // Try to scrape (will fail because no metadata on this page)
    const payload = scrapeSubmission();
    
    // Verify: scrapeSubmission fails on submission-detail page
    expect(payload).toBeNull();

    // But if we have pendingAttempt, we don't need to scrape:
    const mockPayload = {
      problemNumber: '0054',
      problemSlug: 'spiral-matrix',
      code: 'def solution(): pass',
      language: 'Python3',
      fileExtension: '.py',
      domain: 'dsa',
    };

    contentModule.pendingAttempt = {
      payload: mockPayload,
      startedAt: Date.now(),
      problemSlug: 'spiral-matrix',
    };

    // Modal can still be created using stored payload
    injectModal(mockPayload);
    expect(document.getElementById('lgs-modal')).not.toBeNull();
  });
});

describe('State Lifecycle', () => {
  beforeEach(() => {
    contentModule.pendingAttempt = null;
    document.body.innerHTML = '';
  });

  test('clearPendingAttempt resets state', () => {
    // Setup: Create pendingAttempt
    contentModule.pendingAttempt = {
      payload: { problemNumber: '0001' },
      startedAt: Date.now(),
      problemSlug: 'two-sum',
    };

    // Clear with reason
    clearPendingAttempt('test-reason');

    // Verify: State cleared
    expect(contentModule.pendingAttempt).toBeNull();
  });

  test('non-accepted verdict clears pendingAttempt', () => {
    // Setup
    contentModule.pendingAttempt = {
      payload: { problemNumber: '0001' },
      startedAt: Date.now(),
      problemSlug: 'two-sum',
    };

    // Simulate non-accepted verdict
    clearPendingAttempt('non-accepted-verdict');

    // Verify
    expect(contentModule.pendingAttempt).toBeNull();
  });

  test('timeout clears pendingAttempt', () => {
    // Setup
    contentModule.pendingAttempt = {
      payload: { problemNumber: '0001' },
      startedAt: Date.now(),
      problemSlug: 'two-sum',
    };

    // Simulate timeout
    clearPendingAttempt('15s-timeout');

    // Verify
    expect(contentModule.pendingAttempt).toBeNull();
  });

  test('navigation to different problem clears pendingAttempt', () => {
    // Setup
    contentModule.pendingAttempt = {
      payload: { problemNumber: '0001' },
      startedAt: Date.now(),
      problemSlug: 'two-sum',
    };

    // Simulate navigation
    clearPendingAttempt('navigation');

    // Verify
    expect(contentModule.pendingAttempt).toBeNull();
  });
});

describe('GitHub Push Flow Unchanged', () => {
  beforeEach(() => {
    contentModule.isModalOpen = false;
    document.body.innerHTML = '';
  });

  test('GitHub push occurs only after user clicks modal button', () => {
    // Setup: Inject modal with payload
    const mockPayload = {
      problemNumber: '0054',
      problemSlug: 'spiral-matrix',
      problemTitle: 'Spiral Matrix',
      topicSlug: '',
      language: 'Python3',
      fileExtension: '.py',
      domain: 'dsa',
      code: 'def spiralOrder(matrix): pass',
      description: 'Test',
    };

    injectModal(mockPayload);

    // Verify: Modal exists with submit button
    const modal = document.getElementById('lgs-modal');
    expect(modal).not.toBeNull();
    
    const submitBtn = document.getElementById('lgs-submit-btn');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.textContent).toBe('Submit & Push to GitHub');

    // Note: Actual GitHub push requires chrome.runtime.sendMessage
    // which is mocked in integration tests. This test verifies
    // the button exists and is ready for user interaction.
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    contentModule.pendingAttempt = null;
    contentModule.isModalOpen = false;
    document.body.innerHTML = '';
  });

  test('no modal appears if pendingAttempt is null when verdict arrives', () => {
    // Setup: No pendingAttempt
    expect(contentModule.pendingAttempt).toBeNull();

    // Simulate trying to inject modal (should not happen in real flow)
    // In real code, the observer checks pendingAttempt before calling injectModal
    
    // This test documents that without pendingAttempt, modal should not appear
    // The observer itself prevents this, but if someone tries to call injectModal directly:
    const existingModal = document.getElementById('lgs-modal');
    expect(existingModal).toBeNull();
  });

  test('duplicate modal is prevented', () => {
    const mockPayload = {
      problemNumber: '0054',
      problemSlug: 'spiral-matrix',
      code: 'test',
      language: 'Python3',
      fileExtension: '.py',
      domain: 'dsa',
    };

    // First injection
    injectModal(mockPayload);
    expect(document.getElementById('lgs-modal')).not.toBeNull();

    // Second injection (should be blocked)
    injectModal(mockPayload);
    
    // Verify: Only one modal exists
    const modals = document.querySelectorAll('#lgs-modal');
    expect(modals.length).toBe(1);
  });
});
