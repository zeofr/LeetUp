## Bug Report

### Summary
After submitting a LeetCode solution that is judged Accepted, the LeetUp modal never appears and nothing is pushed to GitHub.

### Root Causes

**1. Observer is never started on page load**
`attachObserver()` and `startUrlPolling()` are defined in `content.js` but are never called. The MutationObserver is therefore never attached, so no DOM mutations are ever detected regardless of verdict.

**2. Result panel selector fails before submission**
`attachObserver()` looks for `[data-e2e-locator="submission-result"]` which does not exist in the DOM when the page first loads — it only appears after the user clicks Submit. The function returns `null` immediately and the observer is never created. Fix is to observe `document.body` as a stable fallback and filter for the "Accepted" text anywhere in the subtree.

**3. `scrapeSubmission()` returns null when `topicSlug` is empty**
LeetCode no longer renders topic tag links (`a[href*="/tag/"]`) on the problem page by default — they are hidden behind a "Topics" toggle. This causes `topicSlug` to be empty, which triggers a hard `return null` and silently aborts the push. Fix is to make `topicSlug` optional and fall back to `"uncategorized"` when not found.

### Fix Plan
1. Add initialisation calls at the bottom of `content.js`: `attachObserver()` + `startUrlPolling()`
2. Change `attachObserver()` to always observe `document.body` instead of looking for the result panel (which may not exist yet)
3. In `scrapeSubmission()`, change the `topicSlug` validation from a hard `return null` to a graceful fallback of `"uncategorized"`

### Affected File
`content.js`
