# Contributing

## Code Style

- Plain JavaScript — no build step, no transpiler, no bundler
- No external runtime dependencies — only dev dependencies (Jest, fast-check)
- JSDoc comments on all exported functions: `@param`, `@returns`, and a description
- Inline comments for non-obvious logic
- `console.warn` for recoverable issues (unknown language), `console.error` for unrecoverable scraping failures

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

[optional body]
```

Types used in this project:

| Type | When to use |
|---|---|
| `feat` | New feature or behaviour |
| `fix` | Bug fix |
| `test` | Adding or updating tests only |
| `docs` | Documentation only |
| `chore` | Maintenance — deps, config, .gitignore |
| `refactor` | Code restructure with no behaviour change |
| `style` | Formatting, whitespace, CSS only |

Scopes: `manifest`, `content`, `background`, `popup`, `modal`, `docs`, `tests`

Examples:
```
feat(content): add fallback selector for CodeMirror editor
fix(background): handle network timeout in getFileSha
test(background): add property test for README structure
docs: update API reference for sanitizeError
```

## Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make changes. Run tests after every meaningful change:
   ```bash
   npm test
   ```

3. Stage specific files — do not use `git add .` blindly:
   ```bash
   git add content.js tests/content.pbt.test.js
   ```

4. Commit with a conventional message.

5. Push to your fork and open a pull request against `main`.

## Adding a New Language

1. Add the entry to `LANG_MAP` in `content.js`:
   ```js
   ['elixir', '.ex'],
   ```

2. Add domain classification logic in `getDomain` if the language belongs to a non-`dsa` domain.

3. Update the language table in `docs/api-reference.md`.

4. Run `npm test` — the property tests for Properties 4, 5, and 6 will catch any regression.

## Adding a New Property Test

1. Choose the correct PBT file:
   - Content script behaviour → `tests/content.pbt.test.js`
   - Background / GitHub API → `tests/background.pbt.test.js`
   - Popup → `tests/popup.pbt.test.js`
   - Security / storage → `tests/pat-storage-location.pbt.test.js`

2. Add a `describe` block with the property name in the title.

3. Include this comment at the top of each `test`:
   ```js
   // Feature: leetup, Property N: description
   ```

4. Use `numRuns: 100` minimum; use 200 for critical-path properties.

5. Document the new property in `docs/testing.md` under the Property Inventory table.
