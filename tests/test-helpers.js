/**
 * Test helpers for LeetUp test suite
 * Provides utilities for JSDOM-compatible window.location mocking
 */

/**
 * Sets window.location properties without triggering JSDOM navigation.
 * JSDOM throws "Not implemented: navigation" when window.location is assigned.
 * This helper uses Object.defineProperty to mock location without navigation.
 * 
 * @param {Object} locationProps - Properties to set on window.location
 * @param {string} locationProps.href - Full URL
 * @param {string} locationProps.pathname - URL pathname
 * @param {string} locationProps.search - Query string
 */
function mockWindowLocation(locationProps) {
  // Use history.pushState to change the URL without triggering JSDOM navigation.
  // window.location = {...} and Object.defineProperty both trigger JSDOM's
  // "Not implemented: navigation" error. pushState changes the URL in-place.
  if (typeof window !== 'undefined' && window.history && window.history.pushState) {
    const href = locationProps.href || '';
    // Extract the path+search+hash portion for pushState
    let path = locationProps.pathname || '/';
    if (locationProps.search) {
      path += locationProps.search;
    }
    window.history.pushState({}, '', path);
  }
}

/**
 * Extracts problem slug from URL (test-safe version).
 * Mirrors the production extractProblemSlug but works with mocked locations.
 * 
 * @param {string} url - The URL to parse
 * @returns {string|null} The problem slug or null
 */
function extractProblemSlugTest(url) {
  const match = url.match(/\/problems\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Creates a valid pendingAttempt fixture object for test setup.
 * The pendingAttempt object has shape { payload, startedAt, problemSlug }.
 * 
 * @param {Object} overrides - Optional overrides for the fixture
 * @param {Object} overrides.payload - Partial payload overrides merged with defaults
 * @param {string} overrides.problemSlug - Override the top-level problemSlug
 * @param {number} overrides.startedAt - Override the startedAt timestamp
 * @returns {{ payload: Object, startedAt: number, problemSlug: string }}
 */
function createValidPendingAttempt(overrides = {}) {
  const defaultPayload = {
    problemNumber: '0001',
    problemSlug: 'two-sum',
    problemTitle: 'Two Sum',
    topicSlug: 'array',
    language: 'Python3',
    fileExtension: '.py',
    domain: 'dsa',
    code: 'def twoSum(nums, target):\n    pass',
    description: 'Given an array of integers nums and an integer target...',
  };

  const payload = { ...defaultPayload, ...(overrides.payload || {}) };
  const problemSlug = overrides.problemSlug !== undefined ? overrides.problemSlug : payload.problemSlug;

  return {
    payload,
    startedAt: overrides.startedAt !== undefined ? overrides.startedAt : Date.now(),
    problemSlug,
  };
}

module.exports = {
  mockWindowLocation,
  extractProblemSlugTest,
  createValidPendingAttempt,
};
