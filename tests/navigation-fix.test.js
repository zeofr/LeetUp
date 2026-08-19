/**
 * @jest-environment jsdom
 */

// Tests for the same-problem navigation fix
// Bug: Extension cleared pendingAttempt when navigating from
// /problems/slug/ to /problems/slug/submissions/id/ during submission

const contentModule = require('../content.js');
const {
  extractProblemSlug,
  reconnectObserver,
} = contentModule;
const { mockWindowLocation, createValidPendingAttempt } = require('./test-helpers');

describe('extractProblemSlug', () => {
  test('extracts slug from problem page', () => {
    expect(extractProblemSlug('https://leetcode.com/problems/two-sum/')).toBe('two-sum');
  });

  test('extracts slug from problem description page', () => {
    expect(extractProblemSlug('https://leetcode.com/problems/two-sum/description/')).toBe('two-sum');
  });

  test('extracts slug from submission detail page', () => {
    expect(extractProblemSlug('https://leetcode.com/problems/spiral-matrix/submissions/2109614371/')).toBe('spiral-matrix');
  });

  test('returns null for non-problem URLs', () => {
    expect(extractProblemSlug('https://leetcode.com/')).toBeNull();
    expect(extractProblemSlug('https://leetcode.com/problemset/')).toBeNull();
    expect(extractProblemSlug('https://leetcode.com/discuss/')).toBeNull();
  });
});

describe('reconnectObserver - same-problem navigation fix', () => {
  beforeEach(() => {
    contentModule.pendingAttempt = null;
    contentModule.activeObserver = null;
    contentModule.isModalOpen = false;
  });

  afterEach(() => {
    contentModule.pendingAttempt = null;
  });

  test('preserves pendingAttempt when navigating within same problem', () => {
    // Setup: Arm pending attempt
    contentModule.pendingAttempt = createValidPendingAttempt({ problemSlug: 'two-sum' });

    // Mock location.href for current URL
    mockWindowLocation({ href: 'https://leetcode.com/problems/two-sum/submissions/123456/', pathname: '/problems/two-sum/submissions/123456/' });

    // Simulate navigation from problem page to submission detail
    const previousUrl = 'https://leetcode.com/problems/two-sum/';
    reconnectObserver(previousUrl);

    // Verify: pendingAttempt should still be set (same problem)
    expect(contentModule.pendingAttempt).not.toBe(null);
  });

  test('clears pendingAttempt when navigating to different problem', () => {
    // Setup: Arm pending attempt
    contentModule.pendingAttempt = createValidPendingAttempt({ problemSlug: 'two-sum' });

    // Mock location.href for current URL
    mockWindowLocation({ href: 'https://leetcode.com/problems/three-sum/', pathname: '/problems/three-sum/' });

    // Simulate navigation from one problem to another
    const previousUrl = 'https://leetcode.com/problems/two-sum/';
    reconnectObserver(previousUrl);

    // Verify: pendingAttempt should be cleared (different problem)
    expect(contentModule.pendingAttempt).toBe(null);
  });

  test('clears pendingAttempt when navigating away from problem pages', () => {
    // Setup: Arm pending attempt
    contentModule.pendingAttempt = createValidPendingAttempt();

    // Mock location.href for current URL (non-problem page)
    mockWindowLocation({ href: 'https://leetcode.com/problemset/', pathname: '/problemset/' });

    // Simulate navigation from problem to problem set
    const previousUrl = 'https://leetcode.com/problems/two-sum/';
    reconnectObserver(previousUrl);

    // Verify: pendingAttempt should be cleared (left problem pages)
    expect(contentModule.pendingAttempt).toBe(null);
  });

  test('handles navigation when pendingAttempt is already null', () => {
    // Setup: No pending attempt
    contentModule.pendingAttempt = null;

    // Mock location.href for current URL
    mockWindowLocation({ href: 'https://leetcode.com/problems/two-sum/submissions/123456/', pathname: '/problems/two-sum/submissions/123456/' });

    // Simulate navigation (should not throw)
    const previousUrl = 'https://leetcode.com/problems/two-sum/';
    expect(() => reconnectObserver(previousUrl)).not.toThrow();

    // Verify: pendingAttempt remains null
    expect(contentModule.pendingAttempt).toBe(null);
  });

  test('handles empty previousUrl gracefully', () => {
    // Setup: Arm pending attempt
    contentModule.pendingAttempt = createValidPendingAttempt();

    // Mock location.href for current URL
    mockWindowLocation({ href: 'https://leetcode.com/problems/two-sum/', pathname: '/problems/two-sum/' });

    // Simulate navigation with no previous URL (popstate/hashchange event)
    reconnectObserver('');

    // Verify: Should clear state when previousUrl is unavailable (safe default)
    expect(contentModule.pendingAttempt).toBe(null);
  });
});

describe('Real-world scenario: Submit → Navigate to submission detail', () => {
  beforeEach(() => {
    contentModule.pendingAttempt = null;
    contentModule.isModalOpen = false;
  });

  test('modal can open after same-problem navigation preserves state', () => {
    // Step 1: User on problem page
    mockWindowLocation({ href: 'https://leetcode.com/problems/spiral-matrix/', pathname: '/problems/spiral-matrix/' });

    // Step 2: User clicks Submit
    contentModule.pendingAttempt = createValidPendingAttempt({ problemSlug: 'spiral-matrix' });

    // Step 3: LeetCode navigates to submission detail
    const previousUrl = window.location.href;
    mockWindowLocation({ href: 'https://leetcode.com/problems/spiral-matrix/submissions/2109614371/', pathname: '/problems/spiral-matrix/submissions/2109614371/' });
    reconnectObserver(previousUrl);

    // Step 4: Verify pendingAttempt is preserved
    expect(contentModule.pendingAttempt).not.toBe(null);

    // Step 5: Result arrives → modal should be able to open
    // (In real code, this would trigger injectModal if "Accepted" is detected)
  });
});
