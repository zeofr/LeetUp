// tests/background.pbt.test.js — Property-Based Tests for background.js utilities
// Feature: leetcode-github-sync, Property 14: File content is correctly Base64-encoded (round-trip)

const fc = require('fast-check');
const { toBase64, generateReadme, getFileSha, putFile, pushSubmission } = require('../background');

// ---------------------------------------------------------------------------
// Property 14: File content is correctly Base64-encoded (round-trip)
// Validates: Requirements 7.6
// ---------------------------------------------------------------------------

describe('toBase64 — Property 14: File content is correctly Base64-encoded (round-trip)', () => {
  // Feature: leetcode-github-sync, Property 14: File content is correctly Base64-encoded (round-trip)

  test('round-trip: decoding the Base64 output always recovers the original input', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          const encoded = toBase64(input);
          const decoded = decodeURIComponent(escape(atob(encoded)));
          return decoded === input;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: README structure is correct for all notes/description combinations
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
// ---------------------------------------------------------------------------

describe('generateReadme — Property 11: README structure is correct for all notes/description combinations', () => {
  // Feature: leetcode-github-sync, Property 11: README structure is correct for all notes/description combinations

  const PLACEHOLDER = '_Official problem description unavailable._';

  test('first line always equals `# {problemNumber}. {problemTitle}`', () => {
    fc.assert(
      fc.property(
        fc.record({
          problemNumber: fc.string(),
          problemTitle: fc.string(),
          notes: fc.string(),
          description: fc.string(),
        }),
        ({ problemNumber, problemTitle, notes, description }) => {
          const result = generateReadme({ problemNumber, problemTitle, notes, description });
          const firstLine = result.split('\n')[0];
          return firstLine === `# ${problemNumber}. ${problemTitle}`;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('`## 💡 My Approach` section present iff notes is non-empty after trim', () => {
    fc.assert(
      fc.property(
        fc.record({
          problemNumber: fc.string(),
          problemTitle: fc.string(),
          notes: fc.string(),
          description: fc.string(),
        }),
        ({ problemNumber, problemTitle, notes, description }) => {
          const result = generateReadme({ problemNumber, problemTitle, notes, description });
          const hasApproach = result.includes('## 💡 My Approach');
          const notesNonEmpty = notes.trim().length > 0;
          return hasApproach === notesNonEmpty;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('`---` separator present iff notes is non-empty after trim', () => {
    fc.assert(
      fc.property(
        fc.record({
          problemNumber: fc.string(),
          problemTitle: fc.string(),
          notes: fc.string(),
          description: fc.string(),
        }),
        ({ problemNumber, problemTitle, notes, description }) => {
          const result = generateReadme({ problemNumber, problemTitle, notes, description });
          // Check separator appears as a standalone line (not part of other content)
          const lines = result.split('\n');
          const hasSeparator = lines.some(line => line === '---');
          const notesNonEmpty = notes.trim().length > 0;
          return hasSeparator === notesNonEmpty;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('description or placeholder appears in all cases', () => {
    fc.assert(
      fc.property(
        fc.record({
          problemNumber: fc.string(),
          problemTitle: fc.string(),
          notes: fc.string(),
          description: fc.string(),
        }),
        ({ problemNumber, problemTitle, notes, description }) => {
          const result = generateReadme({ problemNumber, problemTitle, notes, description });
          const expectedBody = description && description.trim() ? description : PLACEHOLDER;
          return result.includes(expectedBody);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Commit message always matches the specified format
// Validates: Requirements 7.3
// ---------------------------------------------------------------------------

describe('putFile — Property 12: Commit message always matches the specified format', () => {
  // Feature: leetcode-github-sync, Property 12: Commit message always matches the specified format

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('PUT request body message field equals `Add solution for {problemNumber}. {problemTitle}`', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ problemNumber: fc.string(), problemTitle: fc.string() }),
        async ({ problemNumber, problemTitle }) => {
          let capturedBody = null;

          global.fetch = (_url, options) => {
            capturedBody = options.body;
            return Promise.resolve({
              status: 201,
              json: () => Promise.resolve({}),
            });
          };

          const expectedMessage = `Add solution for ${problemNumber}. ${problemTitle}`;
          const body = { message: expectedMessage };

          await putFile('https://api.github.com/repos/user/repo/contents/solution.js', 'test-pat', body);
          const parsed = JSON.parse(capturedBody);
          return parsed.message === expectedMessage;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: SHA is included in PUT when file exists
// Validates: Requirements 7.4
// ---------------------------------------------------------------------------

describe('getFileSha + putFile — Property 13: SHA is included in PUT when file exists', () => {
  // Feature: leetcode-github-sync, Property 13: SHA is included in PUT when file exists

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('PUT request body contains the exact SHA returned by the preceding GET (HTTP 200)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 40, maxLength: 40 }),
        async (mockSha) => {
          let capturedPutBody = null;
          let callCount = 0;

          global.fetch = (_url, _options) => {
            callCount += 1;
            if (callCount === 1) {
              // First call: GET — return HTTP 200 with the mock SHA
              return Promise.resolve({
                status: 200,
                json: () => Promise.resolve({ sha: mockSha }),
              });
            }
            // Second call: PUT — capture request body and return success
            capturedPutBody = _options.body;
            return Promise.resolve({
              status: 201,
              json: () => Promise.resolve({}),
            });
          };

          const shaResult = await getFileSha(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            'test-pat'
          );

          const putBody = {
            message: 'Add solution for 0001. Two Sum',
            content: 'dGVzdA==',
            sha: shaResult.sha,
          };

          await putFile(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            'test-pat',
            putBody
          );

          return JSON.parse(capturedPutBody).sha === mockSha;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Solution push always precedes README push; failure aborts the sequence
// Feature: leetcode-github-sync, Property 15: Solution push always precedes README push; failure aborts the sequence
// Validates: Requirements 7.7
// ---------------------------------------------------------------------------

describe('pushSubmission — Property 15: Solution push always precedes README push; failure aborts the sequence', () => {
  // Feature: leetcode-github-sync, Property 15: Solution push always precedes README push; failure aborts the sequence

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const validPayload = {
    domain: 'dsa',
    topicSlug: 'array',
    problemNumber: '0001',
    problemSlug: 'two-sum',
    problemTitle: 'Two Sum',
    fileExtension: '.js',
    code: 'const x = 1;',
    notes: '',
    description: 'Given an array...',
  };
  const credentials = { pat: 'test-pat', username: 'user', repo: 'repo' };

  test('README PUT is never called when solution PUT fails (non-200/201 status)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(400, 403, 404, 422, 500),
        async (solutionPutStatus) => {
          const callLog = [];

          // fetch is called in this order per pushSubmission:
          //   call 1: GET solution SHA
          //   call 2: PUT solution file         ← we control this status
          //   call 3: GET README SHA  (should NOT happen on failure)
          //   call 4: PUT README      (should NOT happen on failure)
          global.fetch = (url, options) => {
            const method = (options && options.method) || 'GET';
            const isReadme = url.includes('README.md');
            callLog.push({ method, isReadme });

            if (method === 'GET') {
              // GET — return 404 (no SHA), so PUT is always attempted
              return Promise.resolve({
                status: 404,
                json: () => Promise.resolve({}),
              });
            }

            // PUT
            if (!isReadme) {
              // Solution PUT — return the failing status
              return Promise.resolve({
                status: solutionPutStatus,
                json: () => Promise.resolve({ message: `Error ${solutionPutStatus}` }),
              });
            }

            // README PUT — should never be reached
            return Promise.resolve({
              status: 201,
              json: () => Promise.resolve({}),
            });
          };

          const result = await pushSubmission(validPayload, credentials);

          const readmePutCalled = callLog.some(c => c.isReadme && c.method === 'PUT');

          // README PUT must NOT be called when solution PUT fails
          return result.ok === false && !readmePutCalled;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('solution PUT is always issued before README PUT when solution succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(200, 201),
        async (solutionPutStatus) => {
          const callLog = [];

          global.fetch = (url, options) => {
            const method = (options && options.method) || 'GET';
            const isReadme = url.includes('README.md');
            callLog.push({ method, isReadme });

            if (method === 'GET') {
              // No existing files
              return Promise.resolve({
                status: 404,
                json: () => Promise.resolve({}),
              });
            }

            // PUT — both solution and README succeed
            return Promise.resolve({
              status: solutionPutStatus,
              json: () => Promise.resolve({}),
            });
          };

          const result = await pushSubmission(validPayload, credentials);

          const solutionPutIndex = callLog.findIndex(c => !c.isReadme && c.method === 'PUT');
          const readmePutIndex  = callLog.findIndex(c =>  c.isReadme && c.method === 'PUT');

          // Both must be called, and solution PUT must come first
          return (
            result.ok === true &&
            solutionPutIndex !== -1 &&
            readmePutIndex   !== -1 &&
            solutionPutIndex < readmePutIndex
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Any non-2xx HTTP status from the GitHub API produces a failure response
// Feature: leetcode-github-sync, Property 16: Any non-2xx HTTP status from the GitHub API produces a failure response
// Validates: Requirements 7.9, 7.11
// ---------------------------------------------------------------------------

describe('getFileSha — Property 16a: any status != 200 and != 404 returns { error: string } containing the status code', () => {
  // Feature: leetcode-github-sync, Property 16: Any non-2xx HTTP status from the GitHub API produces a failure response

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('any HTTP status != 200 and != 404 causes getFileSha to return { error } containing the status code', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 599 }).filter(n => n !== 200 && n !== 404),
        async (status) => {
          global.fetch = (_url, _options) => {
            return Promise.resolve({
              status,
              json: () => Promise.resolve({ message: `Error for status ${status}` }),
            });
          };

          const result = await getFileSha(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            'test-pat'
          );

          return (
            typeof result.error === 'string' &&
            result.error.includes(String(status))
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('putFile — Property 16b: any status != 200 and != 201 returns { ok: false, error: string } containing the status code', () => {
  // Feature: leetcode-github-sync, Property 16: Any non-2xx HTTP status from the GitHub API produces a failure response

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('any HTTP status != 200 and != 201 causes putFile to return { ok: false, error } containing the status code', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 599 }).filter(n => n !== 200 && n !== 201),
        async (status) => {
          global.fetch = (_url, _options) => {
            return Promise.resolve({
              status,
              json: () => Promise.resolve({ message: `Error for status ${status}` }),
            });
          };

          const result = await putFile(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            'test-pat',
            { message: 'test', content: 'dGVzdA==' }
          );

          return (
            result.ok === false &&
            typeof result.error === 'string' &&
            result.error.includes(String(status))
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('pushSubmission — Property 16c: solution GET returning non-200/404 causes pushSubmission to return { ok: false, error }', () => {
  // Feature: leetcode-github-sync, Property 16: Any non-2xx HTTP status from the GitHub API produces a failure response

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('when the solution file GET returns non-200/404, pushSubmission returns { ok: false, error } containing the status code', async () => {
    const validPayload = {
      domain: 'dsa',
      topicSlug: 'array',
      problemNumber: '0001',
      problemSlug: 'two-sum',
      problemTitle: 'Two Sum',
      fileExtension: '.js',
      code: 'const x = 1;',
      notes: '',
      description: 'Given an array...',
    };

    const credentials = { pat: 'test-pat', username: 'user', repo: 'repo' };

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 599 }).filter(n => n !== 200 && n !== 404),
        async (status) => {
          global.fetch = (_url, _options) => {
            return Promise.resolve({
              status,
              json: () => Promise.resolve({ message: `Error for status ${status}` }),
            });
          };

          const result = await pushSubmission(validPayload, credentials);

          return (
            result.ok === false &&
            typeof result.error === 'string' &&
            result.error.includes(String(status))
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: PAT never appears in error messages displayed to the user
// Feature: leetcode-github-sync, Property 19: PAT never appears in error messages displayed to the user
// Validates: Requirements 9.5
// ---------------------------------------------------------------------------

describe('sanitizeError — Property 19: PAT never appears in error messages displayed to the user', () => {
  // Feature: leetcode-github-sync, Property 19: PAT never appears in error messages displayed to the user

  const { sanitizeError } = require('../background');

  test('sanitizeError: result never contains the PAT string', () => {
    fc.assert(
      fc.property(
        // Filter out PATs that appear as substrings of '[REDACTED]' — such single-char
        // or short PATs would be reintroduced by the replacement marker itself,
        // but real GitHub tokens are always 40+ characters and never match.
        fc.string({ minLength: 1 }).filter(s => !'[REDACTED]'.includes(s)),
        fc.string(),
        (pat, baseError) => {
          // Embed PAT somewhere in the error string so we have a realistic scenario
          const errorStr = `${baseError}${pat}${baseError}`;
          const result = sanitizeError(errorStr, pat);
          return !result.includes(pat);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('getFileSha: error response never contains PAT when fetch returns 403 with PAT in body', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use minLength:8 to avoid degenerate single-char PATs whose characters
        // appear inside '[REDACTED]', and filter out PATs that are substrings of
        // the replacement marker itself.
        fc.string({ minLength: 8 }).filter(s => !'[REDACTED]'.includes(s)),
        async (pat) => {
          const originalFetch = global.fetch;
          global.fetch = (_url, _options) => {
            return Promise.resolve({
              status: 403,
              json: () => Promise.resolve({ message: `Forbidden: token=${pat} is invalid` }),
            });
          };

          const result = await getFileSha(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            pat
          );

          global.fetch = originalFetch;

          // Result must be an error and must not contain the PAT
          return (
            typeof result.error === 'string' &&
            !result.error.includes(pat)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('putFile: error response never contains PAT when fetch returns 403 with PAT in body', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Use minLength:8 and filter out PATs that are substrings of '[REDACTED]'
        // to avoid degenerate cases where the replacement marker re-introduces the PAT.
        fc.string({ minLength: 8 }).filter(s => !'[REDACTED]'.includes(s)),
        async (pat) => {
          const originalFetch = global.fetch;
          global.fetch = (_url, _options) => {
            return Promise.resolve({
              status: 403,
              json: () => Promise.resolve({ message: `Forbidden: token=${pat} is invalid` }),
            });
          };

          const result = await putFile(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            pat,
            { message: 'test', content: 'dGVzdA==' }
          );

          global.fetch = originalFetch;

          // Result must be ok:false and error must not contain the PAT
          return (
            result.ok === false &&
            typeof result.error === 'string' &&
            !result.error.includes(pat)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: All GitHub API requests carry the required headers
// Feature: leetcode-github-sync, Property 17: All GitHub API requests carry the required headers
// Validates: Requirements 7.10
// ---------------------------------------------------------------------------

describe('getFileSha + putFile — Property 17: All GitHub API requests carry the required headers', () => {
  // Feature: leetcode-github-sync, Property 17: All GitHub API requests carry the required headers

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('getFileSha: every request includes Authorization: Bearer {pat} and Content-Type: application/json', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (pat) => {
          let capturedHeaders = null;

          global.fetch = (_url, options) => {
            capturedHeaders = options.headers;
            return Promise.resolve({
              status: 200,
              json: () => Promise.resolve({ sha: 'abc123' }),
            });
          };

          await getFileSha(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            pat
          );

          return (
            capturedHeaders !== null &&
            capturedHeaders['Authorization'] === `Bearer ${pat}` &&
            capturedHeaders['Content-Type'] === 'application/json'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('putFile: every request includes Authorization: Bearer {pat} and Content-Type: application/json', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (pat) => {
          let capturedHeaders = null;

          global.fetch = (_url, options) => {
            capturedHeaders = options.headers;
            return Promise.resolve({
              status: 201,
              json: () => Promise.resolve({}),
            });
          };

          await putFile(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            pat,
            { message: 'test', content: 'dGVzdA==' }
          );

          return (
            capturedHeaders !== null &&
            capturedHeaders['Authorization'] === `Bearer ${pat}` &&
            capturedHeaders['Content-Type'] === 'application/json'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: PAT appears only in the Authorization header, never in URL or body
// Feature: leetcode-github-sync, Property 18: PAT appears only in the Authorization header, never in URL or body
// Validates: Requirements 9.3
// ---------------------------------------------------------------------------

describe('getFileSha + putFile — Property 18: PAT appears only in the Authorization header, never in URL or body', () => {
  // Feature: leetcode-github-sync, Property 18: PAT appears only in the Authorization header, never in URL or body

  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('getFileSha: PAT does not appear in the request URL', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8 }),
        async (pat) => {
          let capturedUrl = null;

          global.fetch = (url, _options) => {
            capturedUrl = url;
            return Promise.resolve({
              status: 200,
              json: () => Promise.resolve({ sha: 'abc123' }),
            });
          };

          await getFileSha(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            pat
          );

          return (
            capturedUrl !== null &&
            !capturedUrl.includes(pat)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('putFile: PAT does not appear in the request URL or serialized request body', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8 }),
        async (pat) => {
          let capturedUrl = null;
          let capturedBody = null;

          global.fetch = (url, options) => {
            capturedUrl = url;
            capturedBody = options.body;
            return Promise.resolve({
              status: 201,
              json: () => Promise.resolve({}),
            });
          };

          await putFile(
            'https://api.github.com/repos/user/repo/contents/solution.js',
            pat,
            { message: 'Add solution for 0001. Two Sum', content: 'dGVzdA==' }
          );

          const urlClean = capturedUrl !== null && !capturedUrl.includes(pat);
          const bodyClean = capturedBody !== null && !capturedBody.includes(pat);

          return urlClean && bodyClean;
        }
      ),
      { numRuns: 100 }
    );
  });
});
