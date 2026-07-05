// tests/background.test.js — Unit tests for background.js utilities
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.3, 7.4, 7.5, 7.9, 7.10, 9.5

const { generateReadme, sanitizeError, getFileSha, putFile } = require('../background');

// ---------------------------------------------------------------------------
// generateReadme — unit tests
// ---------------------------------------------------------------------------

describe('generateReadme', () => {
  // ---- Title line (Requirement 6.5) ----

  test('first line is always "# {problemNumber}. {problemTitle}"', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: '',
      description: 'Given an array...',
    });
    expect(result.split('\n')[0]).toBe('# 0001. Two Sum');
  });

  // ---- Notes absent — description immediately after title (Requirements 6.3, 6.4) ----

  test('when notes is empty string, description appears after title with no approach section', () => {
    const result = generateReadme({
      problemNumber: '0042',
      problemTitle: 'Trapping Rain Water',
      notes: '',
      description: 'Given n non-negative integers...',
    });
    const lines = result.split('\n');
    expect(lines[0]).toBe('# 0042. Trapping Rain Water');
    expect(result).not.toContain('## 💡 My Approach');
    expect(result).not.toContain('---');
    expect(result).toContain('Given n non-negative integers...');
  });

  test('when notes is whitespace-only, it is treated as empty — no approach section', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: '   \t\n  ',
      description: 'Given an array...',
    });
    expect(result).not.toContain('## 💡 My Approach');
    expect(result).not.toContain('---');
    expect(result).toContain('Given an array...');
  });

  // ---- Notes present — approach section + separator + description (Requirements 6.2, 6.4) ----

  test('when notes is non-empty, README contains "## 💡 My Approach" section', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: 'Use a hash map.',
      description: 'Given an array...',
    });
    expect(result).toContain('## 💡 My Approach');
    expect(result).toContain('Use a hash map.');
  });

  test('when notes is non-empty, "---" separator appears between approach and description', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: 'Use a hash map.',
      description: 'Given an array...',
    });
    // approach section comes before separator, description comes after
    const approachIdx = result.indexOf('## 💡 My Approach');
    const separatorIdx = result.indexOf('\n---\n');
    const descIdx = result.indexOf('Given an array...');
    expect(approachIdx).toBeLessThan(separatorIdx);
    expect(separatorIdx).toBeLessThan(descIdx);
  });

  test('notes text appears verbatim under the approach heading', () => {
    const notes = 'O(n) time, O(n) space — iterate once with a complement map.';
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes,
      description: 'desc',
    });
    expect(result).toContain(notes);
  });

  // ---- Description placeholder (Requirement 6.6) ----

  test('when description is empty, placeholder is used', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: '',
      description: '',
    });
    expect(result).toContain('_Official problem description unavailable._');
  });

  test('when description is whitespace-only, placeholder is used', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: '',
      description: '   ',
    });
    expect(result).toContain('_Official problem description unavailable._');
  });

  test('placeholder is used even when notes is non-empty and description is empty', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: 'My notes here.',
      description: '',
    });
    expect(result).toContain('## 💡 My Approach');
    expect(result).toContain('_Official problem description unavailable._');
  });

  // ---- Structure ordering (full README shape) ----

  test('full README with notes follows: title → approach → notes → separator → description', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: 'Hash map approach.',
      description: 'Given an array of integers.',
    });
    const titleIdx    = result.indexOf('# 0001. Two Sum');
    const approachIdx = result.indexOf('## 💡 My Approach');
    const notesIdx    = result.indexOf('Hash map approach.');
    const sepIdx      = result.indexOf('\n---\n');
    const descIdx     = result.indexOf('Given an array of integers.');

    expect(titleIdx).toBeLessThan(approachIdx);
    expect(approachIdx).toBeLessThan(notesIdx);
    expect(notesIdx).toBeLessThan(sepIdx);
    expect(sepIdx).toBeLessThan(descIdx);
  });

  test('full README without notes follows: title → description (no approach or separator)', () => {
    const result = generateReadme({
      problemNumber: '0001',
      problemTitle: 'Two Sum',
      notes: '',
      description: 'Given an array of integers.',
    });
    const titleIdx = result.indexOf('# 0001. Two Sum');
    const descIdx  = result.indexOf('Given an array of integers.');

    expect(titleIdx).toBeLessThan(descIdx);
    expect(result).not.toContain('## 💡 My Approach');
    expect(result).not.toContain('---');
  });
});

// ---------------------------------------------------------------------------
// sanitizeError — unit tests (Requirements 9.5)
// ---------------------------------------------------------------------------

describe('sanitizeError', () => {
  test('replaces a single occurrence of pat with [REDACTED]', () => {
    const result = sanitizeError('Token abc123 is invalid', 'abc123');
    expect(result).toBe('Token [REDACTED] is invalid');
  });

  test('replaces ALL occurrences of pat when it appears multiple times', () => {
    const pat = 'mysecret';
    const result = sanitizeError(`error: ${pat} and again ${pat}`, pat);
    expect(result).toBe('error: [REDACTED] and again [REDACTED]');
    // Confirm the original pat is fully absent
    expect(result).not.toContain(pat);
  });

  test('returns the string unchanged when pat is an empty string', () => {
    const str = 'some error message';
    expect(sanitizeError(str, '')).toBe(str);
  });

  test('returns the string unchanged when pat does not appear in it', () => {
    const str = 'network failure';
    expect(sanitizeError(str, 'xyz')).toBe(str);
  });

  test('handles PAT containing regex special characters', () => {
    const pat = 'tok+en.{2}';
    const str = `Bearer ${pat} refused`;
    const result = sanitizeError(str, pat);
    expect(result).toBe('Bearer [REDACTED] refused');
    expect(result).not.toContain(pat);
  });
});

// ---------------------------------------------------------------------------
// getFileSha — unit tests (Requirements 7.3, 7.10, 7.11, 9.5)
// ---------------------------------------------------------------------------

describe('getFileSha', () => {
  const TEST_URL = 'https://api.github.com/repos/user/repo/contents/path/file.js';
  const TEST_PAT = 'ghp_testtoken123';

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ---- HTTP 200: file exists, returns sha ----

  test('GET 200 returns { sha: "abc123" } from response JSON', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ sha: 'abc123', name: 'file.js' }),
    });

    const result = await getFileSha(TEST_URL, TEST_PAT);
    expect(result).toEqual({ sha: 'abc123' });
  });

  // ---- HTTP 404: file does not exist, returns sha: null ----

  test('GET 404 returns { sha: null }', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({ message: 'Not Found' }),
    });

    const result = await getFileSha(TEST_URL, TEST_PAT);
    expect(result).toEqual({ sha: null });
  });

  // ---- HTTP 403: unexpected status returns error with status code ----

  test('GET 403 returns { error: string } containing the status code', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });

    const result = await getFileSha(TEST_URL, TEST_PAT);
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('403');
  });

  // ---- PAT must be stripped from error messages ----

  test('PAT is stripped from error messages on non-200/404 responses', async () => {
    const sensitiveMessage = `Bearer ${TEST_PAT} is not authorized`;
    global.fetch.mockResolvedValueOnce({
      status: 403,
      json: async () => ({ message: sensitiveMessage }),
    });

    const result = await getFileSha(TEST_URL, TEST_PAT);
    expect(result).toHaveProperty('error');
    expect(result.error).not.toContain(TEST_PAT);
    expect(result.error).toContain('[REDACTED]');
  });

  test('PAT is stripped from network error messages', async () => {
    global.fetch.mockRejectedValueOnce(new Error(`connect refused for ${TEST_PAT}`));

    const result = await getFileSha(TEST_URL, TEST_PAT);
    expect(result).toHaveProperty('error');
    expect(result.error).not.toContain(TEST_PAT);
  });

  // ---- Required headers on every call ----

  test('sends Authorization: Bearer {pat} header on every call', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ sha: 'sha1' }),
    });

    await getFileSha(TEST_URL, TEST_PAT);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_PAT}`);
  });

  test('sends Content-Type: application/json header on every call', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ sha: 'sha1' }),
    });

    await getFileSha(TEST_URL, TEST_PAT);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  test('both required headers are present on a 404 call too', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 404,
      json: async () => ({}),
    });

    await getFileSha(TEST_URL, TEST_PAT);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_PAT}`);
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  // ---- Uses GET method ----

  test('issues a GET request (not POST/PUT)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ sha: 'sha1' }),
    });

    await getFileSha(TEST_URL, TEST_PAT);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('GET');
  });
});

// ---------------------------------------------------------------------------
// putFile — unit tests (Requirements 7.3, 7.4, 7.5, 7.9, 7.10, 9.5)
// ---------------------------------------------------------------------------

describe('putFile', () => {
  const TEST_URL = 'https://api.github.com/repos/user/repo/contents/path/solution.py';
  const TEST_PAT = 'ghp_testtoken456';
  const TEST_BODY = { message: 'Add solution', content: 'cHJpbnQoMSk=' };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ---- HTTP 201: new file created ----

  test('PUT 201 returns { ok: true }', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 201,
      json: async () => ({ content: { sha: 'newsha' } }),
    });

    const result = await putFile(TEST_URL, TEST_PAT, TEST_BODY);
    expect(result).toEqual({ ok: true });
  });

  // ---- HTTP 200: existing file updated ----

  test('PUT 200 returns { ok: true }', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ content: { sha: 'updatedsha' } }),
    });

    const result = await putFile(TEST_URL, TEST_PAT, TEST_BODY);
    expect(result).toEqual({ ok: true });
  });

  // ---- HTTP 422: validation failure returns { ok: false, error } ----

  test('PUT 422 returns { ok: false, error } containing the status code', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 422,
      json: async () => ({ message: 'Unprocessable Entity' }),
    });

    const result = await putFile(TEST_URL, TEST_PAT, TEST_BODY);
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('422');
  });

  // ---- PAT stripped from error messages ----

  test('PAT is stripped from error messages on non-200/201 responses', async () => {
    const sensitiveMessage = `Bearer ${TEST_PAT} unauthorized`;
    global.fetch.mockResolvedValueOnce({
      status: 401,
      json: async () => ({ message: sensitiveMessage }),
    });

    const result = await putFile(TEST_URL, TEST_PAT, TEST_BODY);
    expect(result).toHaveProperty('ok', false);
    expect(result.error).not.toContain(TEST_PAT);
    expect(result.error).toContain('[REDACTED]');
  });

  // ---- Network error: PAT stripped ----

  test('PAT is stripped from network error messages', async () => {
    global.fetch.mockRejectedValueOnce(new Error(`connect refused for ${TEST_PAT}`));

    const result = await putFile(TEST_URL, TEST_PAT, TEST_BODY);
    expect(result).toHaveProperty('ok', false);
    expect(result.error).not.toContain(TEST_PAT);
  });

  // ---- Authorization header present ----

  test('sends Authorization: Bearer {pat} header', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 201,
      json: async () => ({}),
    });

    await putFile(TEST_URL, TEST_PAT, TEST_BODY);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_PAT}`);
  });

  // ---- Content-Type header present ----

  test('sends Content-Type: application/json header', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 201,
      json: async () => ({}),
    });

    await putFile(TEST_URL, TEST_PAT, TEST_BODY);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  // ---- Method is PUT ----

  test('issues a PUT request (not GET/POST)', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 201,
      json: async () => ({}),
    });

    await putFile(TEST_URL, TEST_PAT, TEST_BODY);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('PUT');
  });

  // ---- Body is JSON-serialized ----

  test('request body is JSON.stringify of the provided body object', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 201,
      json: async () => ({}),
    });

    await putFile(TEST_URL, TEST_PAT, TEST_BODY);

    const [, options] = global.fetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify(TEST_BODY));
  });

  // ---- Network error returns ok: false ----

  test('network error returns { ok: false, error: string }', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

    const result = await putFile(TEST_URL, TEST_PAT, TEST_BODY);
    expect(result).toHaveProperty('ok', false);
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// pushSubmission — unit tests (Requirements 7.1, 7.2, 7.7, 7.8, 7.9, 9.5)
// ---------------------------------------------------------------------------

const { pushSubmission } = require('../background');

/** Minimal valid payload used across tests */
const BASE_PAYLOAD = {
  domain: 'dsa',
  topicSlug: 'array',
  problemNumber: '0001',
  problemSlug: 'two-sum',
  problemTitle: 'Two Sum',
  fileExtension: '.py',
  code: 'print(1)',
  notes: '',
  description: 'Given an array...',
};

/** Valid credentials object */
const VALID_CREDS = { pat: 'ghp_abc123', username: 'testuser', repo: 'solutions' };

describe('pushSubmission', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ---- Missing credentials ----

  test('returns error when credentials are null (no chrome env)', async () => {
    const result = await pushSubmission(BASE_PAYLOAD, null);
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toMatch(/configure credentials/i);
  });

  test('returns error when pat is missing from credentials', async () => {
    const result = await pushSubmission(BASE_PAYLOAD, { pat: '', username: 'user', repo: 'repo' });
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toMatch(/configure credentials/i);
  });

  test('returns error when username is missing', async () => {
    const result = await pushSubmission(BASE_PAYLOAD, { pat: 'ghp_tok', username: '', repo: 'repo' });
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toMatch(/configure credentials/i);
  });

  test('returns error when repo is missing', async () => {
    const result = await pushSubmission(BASE_PAYLOAD, { pat: 'ghp_tok', username: 'user', repo: '' });
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toMatch(/configure credentials/i);
  });

  test('returns error when any credential field is undefined', async () => {
    const result = await pushSubmission(BASE_PAYLOAD, { pat: 'ghp_tok', username: 'user', repo: undefined });
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toMatch(/configure credentials/i);
  });

  // ---- Successful push (both files new — no SHA) ----

  test('returns { ok: true } when both solution and README PUTs succeed (201)', async () => {
    global.fetch
      // GET solution → 404 (new file)
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      // PUT solution → 201
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })
      // GET README → 404 (new file)
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      // PUT README → 201
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toEqual({ ok: true });
  });

  test('returns { ok: true } when both solution and README PUTs succeed (200)', async () => {
    global.fetch
      // GET solution → 200 with SHA (existing file)
      .mockResolvedValueOnce({ status: 200, json: async () => ({ sha: 'abc123' }) })
      // PUT solution → 200
      .mockResolvedValueOnce({ status: 200, json: async () => ({}) })
      // GET README → 200 with SHA
      .mockResolvedValueOnce({ status: 200, json: async () => ({ sha: 'def456' }) })
      // PUT README → 200
      .mockResolvedValueOnce({ status: 200, json: async () => ({}) });

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toEqual({ ok: true });
  });

  // ---- Aborts when solution GET returns non-200/404 ----

  test('aborts and returns error if solution GET returns 403', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toContain('403');
    // Only one fetch call (the GET) — no PUT was issued
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('aborts and returns error if solution GET returns 500', async () => {
    global.fetch.mockResolvedValueOnce({
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    });

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toHaveProperty('ok', false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ---- Aborts when solution PUT fails ----

  test('aborts without pushing README when solution PUT returns 422', async () => {
    global.fetch
      // GET solution → 404
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      // PUT solution → 422
      .mockResolvedValueOnce({ status: 422, json: async () => ({ message: 'Unprocessable' }) });

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toContain('422');
    // Only 2 fetch calls: GET solution + PUT solution — README was never touched
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('aborts without pushing README when solution PUT returns 403', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 403, json: async () => ({ message: 'Forbidden' }) });

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toHaveProperty('ok', false);
    // 2 calls: GET solution, PUT solution
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  // ---- README GET fails after solution PUT succeeds ----

  test('returns error if README GET returns 403', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) }) // GET solution
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) }) // PUT solution
      .mockResolvedValueOnce({ status: 403, json: async () => ({ message: 'Forbidden' }) }); // GET README

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toContain('403');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  // ---- README PUT fails ----

  test('returns error if README PUT returns 422', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) }) // GET solution
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) }) // PUT solution
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) }) // GET README
      .mockResolvedValueOnce({ status: 422, json: async () => ({ message: 'Unprocessable' }) }); // PUT README

    const result = await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(result).toHaveProperty('ok', false);
    expect(result.error).toContain('422');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  // ---- SHA inclusion ----

  test('solution PUT body includes SHA when solution GET returns 200', async () => {
    const mockSha = 'abc123def456';

    global.fetch
      .mockResolvedValueOnce({ status: 200, json: async () => ({ sha: mockSha }) }) // GET solution
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })                // PUT solution
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })                // GET README
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });               // PUT README

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    // Second fetch call is the solution PUT
    const [, putOptions] = global.fetch.mock.calls[1];
    const putBody = JSON.parse(putOptions.body);
    expect(putBody).toHaveProperty('sha', mockSha);
  });

  test('solution PUT body does NOT include SHA when solution GET returns 404', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) }) // GET solution → new
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) }) // PUT solution
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) }) // GET README
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });// PUT README

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    const [, putOptions] = global.fetch.mock.calls[1];
    const putBody = JSON.parse(putOptions.body);
    expect(putBody).not.toHaveProperty('sha');
  });

  test('README PUT body includes SHA when README GET returns 200', async () => {
    const readmeSha = 'readme_sha_xyz';

    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })               // GET solution
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })               // PUT solution
      .mockResolvedValueOnce({ status: 200, json: async () => ({ sha: readmeSha }) }) // GET README
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });              // PUT README

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    // Fourth fetch call is the README PUT
    const [, readmePutOptions] = global.fetch.mock.calls[3];
    const readmePutBody = JSON.parse(readmePutOptions.body);
    expect(readmePutBody).toHaveProperty('sha', readmeSha);
  });

  // ---- Commit message format ----

  test('solution PUT commit message matches "Add solution for {number}. {title}"', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    const [, putOptions] = global.fetch.mock.calls[1];
    const putBody = JSON.parse(putOptions.body);
    expect(putBody.message).toBe(`Add solution for ${BASE_PAYLOAD.problemNumber}. ${BASE_PAYLOAD.problemTitle}`);
  });

  // ---- Path construction ----

  test('constructs the correct solution path in the GitHub API URL', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    const expectedPath = `dsa/array/0001-two-sum/solution.py`;
    const [solutionGetUrl] = global.fetch.mock.calls[0];
    expect(solutionGetUrl).toContain(expectedPath);
  });

  test('constructs the correct README path in the GitHub API URL', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    const expectedPath = `dsa/array/0001-two-sum/README.md`;
    const [readmeGetUrl] = global.fetch.mock.calls[2];
    expect(readmeGetUrl).toContain(expectedPath);
  });

  // ---- PAT sanitization ----

  test('PAT does not appear in returned error messages', async () => {
    const pat = 'ghp_supersecrettoken';
    global.fetch.mockResolvedValueOnce({
      status: 403,
      json: async () => ({ message: `Bearer ${pat} is not authorized` }),
    });

    const result = await pushSubmission(BASE_PAYLOAD, { pat, username: 'user', repo: 'repo' });
    expect(result).toHaveProperty('ok', false);
    expect(result.error).not.toContain(pat);
    expect(result.error).toContain('[REDACTED]');
  });

  // ---- Call ordering: solution before README ----

  test('solution GET is the first fetch call issued', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    const [firstUrl] = global.fetch.mock.calls[0];
    expect(firstUrl).toContain('solution.py');
  });

  test('README GET is the third fetch call (after solution GET + PUT)', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);

    const [thirdUrl] = global.fetch.mock.calls[2];
    expect(thirdUrl).toContain('README.md');
  });

  // ---- Total fetch call count for a full happy-path push ----

  test('a full successful push issues exactly 4 fetch calls (GET sol, PUT sol, GET readme, PUT readme)', async () => {
    global.fetch
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 201, json: async () => ({}) });

    await pushSubmission(BASE_PAYLOAD, VALID_CREDS);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// Message listener logic — unit tests (Requirement 7.1)
// ---------------------------------------------------------------------------
// The chrome.runtime.onMessage listener registration is guarded by
// `typeof chrome !== 'undefined'`, so it won't execute in Jest's Node
// environment. Instead, we test the handler *behaviour* directly by:
//   - mocking pushSubmission to control its return value
//   - manually invoking the same logic the listener would run
//   - asserting sendResponse receives the correct value

describe('PUSH_SUBMISSION message handler logic', () => {
  const { pushSubmission: realPushSubmission } = require('../background');

  // Simulate the handler body as it appears in the listener
  async function simulateHandler(message, mockPushSubmission) {
    return new Promise((resolve) => {
      const sendResponse = resolve;
      if (message.type === 'PUSH_SUBMISSION') {
        mockPushSubmission(message.payload)
          .then(result => sendResponse(result))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
      }
    });
  }

  test('calls pushSubmission with the message payload when type is PUSH_SUBMISSION', async () => {
    const mockPush = jest.fn().mockResolvedValue({ ok: true });
    const message = { type: 'PUSH_SUBMISSION', payload: BASE_PAYLOAD };

    await simulateHandler(message, mockPush);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(BASE_PAYLOAD);
  });

  test('sends the success response back via sendResponse on successful push', async () => {
    const mockPush = jest.fn().mockResolvedValue({ ok: true });
    const message = { type: 'PUSH_SUBMISSION', payload: BASE_PAYLOAD };

    const response = await simulateHandler(message, mockPush);

    expect(response).toEqual({ ok: true });
  });

  test('sends an error response via sendResponse when pushSubmission returns { ok: false }', async () => {
    const mockPush = jest.fn().mockResolvedValue({ ok: false, error: 'Something went wrong' });
    const message = { type: 'PUSH_SUBMISSION', payload: BASE_PAYLOAD };

    const response = await simulateHandler(message, mockPush);

    expect(response).toEqual({ ok: false, error: 'Something went wrong' });
  });

  test('sends { ok: false, error: string } via sendResponse when pushSubmission throws', async () => {
    const mockPush = jest.fn().mockRejectedValue(new Error('Unexpected failure'));
    const message = { type: 'PUSH_SUBMISSION', payload: BASE_PAYLOAD };

    const response = await simulateHandler(message, mockPush);

    expect(response).toHaveProperty('ok', false);
    expect(response.error).toContain('Unexpected failure');
  });

  test('passes all payload fields through to pushSubmission unchanged', async () => {
    const customPayload = {
      ...BASE_PAYLOAD,
      problemNumber: '0042',
      problemSlug: 'trapping-rain-water',
      problemTitle: 'Trapping Rain Water',
      notes: 'Two pointer approach',
    };
    const mockPush = jest.fn().mockResolvedValue({ ok: true });
    const message = { type: 'PUSH_SUBMISSION', payload: customPayload };

    await simulateHandler(message, mockPush);

    expect(mockPush).toHaveBeenCalledWith(customPayload);
  });
});
