// content.test.js — Unit tests for content.js utilities
// Tests for getFileExtension and getDomain functions.

const { LANG_MAP, getFileExtension, getDomain } = require('./content');

// ---------------------------------------------------------------------------
// getFileExtension — unit tests
// ---------------------------------------------------------------------------

describe('getFileExtension', () => {
  test('maps python3 to .py', () => {
    expect(getFileExtension('Python3')).toBe('.py');
  });

  test('maps python to .py', () => {
    expect(getFileExtension('Python')).toBe('.py');
  });

  test('maps java to .java', () => {
    expect(getFileExtension('Java')).toBe('.java');
  });

  test('maps javascript to .js', () => {
    expect(getFileExtension('JavaScript')).toBe('.js');
  });

  test('maps typescript to .ts', () => {
    expect(getFileExtension('TypeScript')).toBe('.ts');
  });

  test('maps c++ to .cpp', () => {
    expect(getFileExtension('C++')).toBe('.cpp');
  });

  test('maps c to .c', () => {
    expect(getFileExtension('C')).toBe('.c');
  });

  test('maps c# to .cs', () => {
    expect(getFileExtension('C#')).toBe('.cs');
  });

  test('maps go to .go', () => {
    expect(getFileExtension('Go')).toBe('.go');
  });

  test('maps rust to .rs', () => {
    expect(getFileExtension('Rust')).toBe('.rs');
  });

  test('maps kotlin to .kt', () => {
    expect(getFileExtension('Kotlin')).toBe('.kt');
  });

  test('maps swift to .swift', () => {
    expect(getFileExtension('Swift')).toBe('.swift');
  });

  test('maps ruby to .rb', () => {
    expect(getFileExtension('Ruby')).toBe('.rb');
  });

  test('maps scala to .scala', () => {
    expect(getFileExtension('Scala')).toBe('.scala');
  });

  test('maps php to .php', () => {
    expect(getFileExtension('PHP')).toBe('.php');
  });

  test('maps mysql to .sql', () => {
    expect(getFileExtension('MySQL')).toBe('.sql');
  });

  test('maps ms sql server to .sql', () => {
    expect(getFileExtension('MS SQL Server')).toBe('.sql');
  });

  test('maps oracle to .sql', () => {
    expect(getFileExtension('Oracle')).toBe('.sql');
  });

  test('maps bash to .sh', () => {
    expect(getFileExtension('Bash')).toBe('.sh');
  });

  test('handles whitespace padding', () => {
    expect(getFileExtension('  Python3  ')).toBe('.py');
  });

  test('handles mixed case', () => {
    expect(getFileExtension('pYtHoN3')).toBe('.py');
  });

  test('returns .txt for unrecognized language', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getFileExtension('Haskell')).toBe('.txt');
    warnSpy.mockRestore();
  });

  test('warns with original input for unrecognized language', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getFileExtension('  Haskell  ');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('  Haskell  ')
    );
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getDomain — unit tests
// ---------------------------------------------------------------------------

describe('getDomain', () => {
  // SQL languages → sql-databases
  test('classifies MySQL as sql-databases', () => {
    expect(getDomain('MySQL')).toBe('sql-databases');
  });

  test('classifies MS SQL Server as sql-databases', () => {
    expect(getDomain('MS SQL Server')).toBe('sql-databases');
  });

  test('classifies Oracle as sql-databases', () => {
    expect(getDomain('Oracle')).toBe('sql-databases');
  });

  // Bash → shell-scripting
  test('classifies Bash as shell-scripting', () => {
    expect(getDomain('Bash')).toBe('shell-scripting');
  });

  // All other languages → dsa
  test('classifies Python3 as dsa', () => {
    expect(getDomain('Python3')).toBe('dsa');
  });

  test('classifies Java as dsa', () => {
    expect(getDomain('Java')).toBe('dsa');
  });

  test('classifies JavaScript as dsa', () => {
    expect(getDomain('JavaScript')).toBe('dsa');
  });

  test('classifies C++ as dsa', () => {
    expect(getDomain('C++')).toBe('dsa');
  });

  test('classifies Go as dsa', () => {
    expect(getDomain('Go')).toBe('dsa');
  });

  test('classifies Rust as dsa', () => {
    expect(getDomain('Rust')).toBe('dsa');
  });

  // Case-insensitivity
  test('handles lowercase mysql', () => {
    expect(getDomain('mysql')).toBe('sql-databases');
  });

  test('handles uppercase MYSQL', () => {
    expect(getDomain('MYSQL')).toBe('sql-databases');
  });

  test('handles lowercase bash', () => {
    expect(getDomain('bash')).toBe('shell-scripting');
  });

  test('handles uppercase BASH', () => {
    expect(getDomain('BASH')).toBe('shell-scripting');
  });

  // Whitespace trimming
  test('trims whitespace before classifying sql language', () => {
    expect(getDomain('  MySQL  ')).toBe('sql-databases');
  });

  test('trims whitespace before classifying bash', () => {
    expect(getDomain('  Bash  ')).toBe('shell-scripting');
  });

  test('trims whitespace before classifying dsa language', () => {
    expect(getDomain('  Python3  ')).toBe('dsa');
  });

  // Unknown language → dsa (fallback)
  test('classifies unknown language as dsa', () => {
    expect(getDomain('Haskell')).toBe('dsa');
  });

  // Return value is always one of the three valid domains
  test('always returns one of the three valid domain strings', () => {
    const validDomains = ['dsa', 'sql-databases', 'shell-scripting'];
    const languages = ['Python3', 'MySQL', 'MS SQL Server', 'Oracle', 'Bash',
                       'Java', 'JavaScript', 'C++', 'Go', 'Rust', 'Haskell'];
    for (const lang of languages) {
      expect(validDomains).toContain(getDomain(lang));
    }
  });
});

// ---------------------------------------------------------------------------
// buildRepoPath — unit tests
// ---------------------------------------------------------------------------

const { buildRepoPath } = require('./content');

describe('buildRepoPath', () => {
  test('returns correct path for a typical input', () => {
    expect(buildRepoPath('dsa', 1, 'two-sum'))
      .toBe('dsa/0001-two-sum/');
  });

  test('zero-pads single-digit problem numbers to 4 digits', () => {
    expect(buildRepoPath('dsa', 1, 'two-sum'))
      .toBe('dsa/0001-two-sum/');
  });

  test('zero-pads 2-digit problem numbers to 4 digits', () => {
    expect(buildRepoPath('dsa', 42, 'trapping-rain-water'))
      .toBe('dsa/0042-trapping-rain-water/');
  });

  test('zero-pads 3-digit problem numbers to 4 digits', () => {
    expect(buildRepoPath('dsa', 322, 'coin-change'))
      .toBe('dsa/0322-coin-change/');
  });

  test('does not pad 4-digit problem numbers', () => {
    expect(buildRepoPath('dsa', 1000, 'minimum-cost-to-connect-sticks'))
      .toBe('dsa/1000-minimum-cost-to-connect-sticks/');
  });

  test('accepts string problem numbers', () => {
    expect(buildRepoPath('sql-databases', '175', 'combine-two-tables'))
      .toBe('sql-databases/0175-combine-two-tables/');
  });

  test('uses the correct domain in the path', () => {
    expect(buildRepoPath('sql-databases', 1, 'some-problem'))
      .toBe('sql-databases/0001-some-problem/');

    expect(buildRepoPath('shell-scripting', 1, 'some-problem'))
      .toBe('shell-scripting/0001-some-problem/');
  });

  test('path always ends with a trailing slash', () => {
    const result = buildRepoPath('dsa', 1, 'two-sum');
    expect(result).toMatch(/\/$/);
  });

  // Null / error cases — missing arguments
  test('returns null and logs error when domain is falsy (null)', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(buildRepoPath(null, 1, 'two-sum')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"domain"'));
    errorSpy.mockRestore();
  });

  test('returns null and logs error when domain is empty string', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(buildRepoPath('', 1, 'two-sum')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"domain"'));
    errorSpy.mockRestore();
  });

  test('returns null and logs error when problemNumber is falsy (null)', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(buildRepoPath('dsa', null, 'two-sum')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"problemNumber"'));
    errorSpy.mockRestore();
  });

  test('returns null and logs error when problemSlug is falsy', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(buildRepoPath('dsa', 1, '')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"problemSlug"'));
    errorSpy.mockRestore();
  });

  test('returns null and logs error when all arguments are falsy', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(buildRepoPath(null, null, null)).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

