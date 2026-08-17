# Bugfix Requirements Document

## Introduction

The LeetUp "Submit & Push to GitHub" modal appears prematurely — before the
current LeetCode submission is confirmed as Accepted. The root cause is a
two-part problem in `content.js`:

1. **Whole-page observation** — `attachObserver()` observes `document.body`
   as the root. Any "Accepted" text node appearing *anywhere* in the page
   (prior submission history, unrelated badges, React-rerendered areas) can
   satisfy the check.

2. **Subtree scanning on mutation targets** — the MutationObserver callback
   calls `hasAcceptedText(mutation.target)` for every `childList` mutation,
   walking the *entire* subtree of the changed element. If a stale "Accepted"
   node exists inside that subtree (e.g. a previously accepted problem's
   result still in the DOM), it is rediscovered whenever an unrelated DOM
   update touches an ancestor element — triggering the modal with no
   connection to the current submission at all.

The fix must constrain detection to the *current* submission result container
and to *newly added/changed nodes only*, rather than arbitrary subtrees across
the whole page.

---

## Glossary

| Term | Definition |
|---|---|
| result container | The DOM element identified by `[data-e2e-locator="submission-result"]` that LeetCode injects dynamically after a submission is sent. |
| pendingSubmission | A boolean flag in content.js that is set to `true` when the user clicks the LeetCode Submit button and reset to `false` once a verdict is received or the safety timeout expires. |
| final verdict | The terminal text node inside the result container that reflects the outcome of the current submission (e.g. "Accepted", "Wrong Answer", "Time Limit Exceeded"). |
| stale node | A DOM text node that contains "Accepted" but was inserted by a prior submission, visible in submission history or a previously rendered result panel. |
| MutationRecord | The object delivered to a MutationObserver callback describing a single DOM change, including `type`, `target`, `addedNodes`, and `removedNodes`. |

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user clicks "Submit" on a LeetCode problem THEN the system arms
`pendingSubmission = true` by matching any `<button>` whose trimmed text is
exactly "submit" (case-insensitive), which may match unrelated buttons on the
page.

1.2 WHEN `pendingSubmission` is true and any mutation fires anywhere in
`document.body` THEN the system walks the full subtree of `mutation.target`
via `hasAcceptedText()`, rediscovering stale "Accepted" nodes from prior
submissions or unrelated page areas, and opens the modal.

1.3 WHEN `pendingSubmission` is true and an unrelated React re-render mutates
a DOM node that happens to contain an existing "Accepted" descendant (e.g.
submission history, a status badge outside the result panel) THEN the system
incorrectly treats this as proof that the current submission was accepted and
opens the modal.

1.4 WHEN `pendingSubmission` is true and the current submission's result
container has not yet been created THEN the system may match an "Accepted"
text node from outside that container before the real verdict is rendered.

1.5 WHEN one accepted result opens the modal and the modal is later closed,
then the user submits again and gets a non-Accepted verdict THEN the system
may still open the modal if a stale "Accepted" node elsewhere in `document.body`
is touched by a subsequent mutation.

---

## Requirements

### Requirement 1: Scope the verdict observer to the current result container only

**User Story:** As a LeetCode user, I want the LeetUp modal to trigger only when my current submission's result container receives a new "Accepted" verdict node, so that prior accepted submissions, history entries, and unrelated page mutations do not open the modal.

#### Acceptance Criteria

1. WHEN `pendingSubmission` is true and a `childList` MutationRecord is delivered whose `addedNodes` contains (or whose subtree of added nodes contains) a text node with trimmed content exactly equal to "Accepted", AND that added node is a descendant of the element matching `[data-e2e-locator="submission-result"]`, THEN the system SHALL open the modal exactly once.

2. WHEN `pendingSubmission` is true and a MutationRecord fires for a DOM change whose `target` is NOT a descendant of `[data-e2e-locator="submission-result"]`, THEN the system SHALL NOT open the modal, regardless of whether any "Accepted" text exists in the mutated subtree.

3. WHEN `pendingSubmission` is true and a `childList` MutationRecord fires inside `[data-e2e-locator="submission-result"]` but no node in `addedNodes` (or the subtrees of `addedNodes`) contains trimmed text exactly equal to "Accepted", THEN the system SHALL NOT open the modal even if a stale "Accepted" text node already exists elsewhere in the container's DOM tree.

4. WHEN `pendingSubmission` is true and a `characterData` MutationRecord fires on a text node that is a descendant of `[data-e2e-locator="submission-result"]` and whose new `textContent` trimmed is exactly "Accepted", THEN the system SHALL open the modal exactly once.

5. IF the user navigates to a new problem via SPA routing and the new page contains an "Accepted" text node from a prior accepted submission on that problem, THEN a DOM mutation touching that node SHALL NOT open the modal while `pendingSubmission` is false.

---

### Requirement 2: Wait for dynamic result container creation before attaching verdict observer

**User Story:** As a LeetCode user, I want LeetUp to wait for the submission result container to appear in the DOM before watching for the verdict, so that delayed or async container creation does not cause the modal to miss the result or fire prematurely.

#### Acceptance Criteria

1. WHILE `pendingSubmission` is true and `[data-e2e-locator="submission-result"]` does not yet exist in the DOM, the system SHALL observe `document.body` at the childList+subtree level solely to detect the insertion of `[data-e2e-locator="submission-result"]`, and upon its insertion SHALL attach a narrowly scoped observer on that element before disconnecting the body-level insertion watcher.

2. WHEN `pendingSubmission` is true and the result container is created and subsequently a MutationRecord inside it carries a newly added or changed text node with trimmed content exactly "Accepted", THEN the system SHALL open the modal and SHALL immediately set `pendingSubmission` to false.

3. WHEN `pendingSubmission` is true and the result container is created but a MutationRecord inside it carries a newly added or changed text node with any verdict text other than "Accepted" (e.g. "Wrong Answer", "Time Limit Exceeded", "Runtime Error", "Memory Limit Exceeded", "Compile Error"), THEN the system SHALL NOT open the modal and SHALL immediately set `pendingSubmission` to false.

4. IF `pendingSubmission` is true and no verdict is delivered within 15 seconds of the Submit click, THEN the system SHALL set `pendingSubmission` to false as a cleanup mechanism and SHALL NOT use this timeout expiry to trigger any UI action.

---

### Requirement 3: Modal idempotency, timeout-as-cleanup, and SPA reconnect

**User Story:** As a LeetCode user, I want the LeetUp modal to open at most once per accepted submission, the 15-second timeout to be a cleanup mechanism only, and SPA navigation to fully reset the observer state, so that duplicate modals, dangling state, and cross-page false positives cannot occur.

#### Acceptance Criteria

1. WHEN a single accepted submission causes multiple MutationRecord callbacks to fire (e.g. several `childList` records in one React render cycle all reporting "Accepted"-containing nodes in the result container), THEN the system SHALL open the modal exactly once and SHALL ignore all subsequent callbacks for the same submission.

2. WHEN the 15-second safety timeout fires after a Submit click that produced no verdict, THEN the system SHALL set `pendingSubmission` to false, SHALL clear the timeout handle, and SHALL NOT open the modal or perform any user-visible action as a result of the timeout alone.

3. WHEN the user navigates to a new LeetCode problem via SPA routing (pushState, popstate, or hashchange), THEN the system SHALL disconnect the existing verdict observer (if any), reset `pendingSubmission` to false, and attach a new observer scoped to the new page, such that "Accepted" text from the prior problem's result container does NOT open a modal on the new page.

4. WHEN `pendingSubmission` is false and any DOM mutation fires anywhere on the page, THEN the system SHALL NOT evaluate any text node for the "Accepted" verdict and SHALL NOT open the modal.

---

### Requirement 4: Preserve the existing GitHub push flow (regression prevention)

**User Story:** As a LeetCode user, I want all existing GitHub push behavior to remain unchanged after the observer fix, so that genuine accepted submissions still open the modal, notes are captured, and the push succeeds or fails exactly as before.

#### Acceptance Criteria

1. WHEN the user has clicked the LeetCode Submit button (setting `pendingSubmission` to true) and a mutation delivers an "Accepted" text node into the result container, THEN the system SHALL open the "Submit & Push to GitHub" modal.

2. WHEN the user fills in notes in the modal and clicks "Submit & Push to GitHub", THEN the system SHALL send a `PUSH_SUBMISSION` message to the background service worker with a payload containing all of the following fields: `problemNumber`, `problemSlug`, `problemTitle`, `topicSlug`, `language`, `fileExtension`, `domain`, `code`, `description`, and `notes`.

3. WHEN the GitHub push succeeds, THEN the system SHALL display "Pushed successfully!" in the modal status area and close the modal after 2000 ms.

4. WHEN the GitHub push fails, THEN the system SHALL hide the loading spinner, display the error message from `response.error` in the modal status area, and re-enable the submit button so the user can retry.

5. WHEN the user closes the modal via the × button or the Escape key, THEN the system SHALL remove the modal from the DOM within 100 ms.

6. IF `pendingSubmission` is false and "Accepted" text appears anywhere in the page (e.g. from submission history on page load), THEN the system SHALL ignore it and not open the modal.

7. IF `scrapeSubmission()` returns `null` because any of the required DOM fields (`problemNumber`, `code`, or `problemSlug`) is unavailable after an accepted verdict is detected, THEN the system SHALL not open the modal.

8. WHEN the push flow is triggered, THEN the system SHALL complete the solution file PUT request before initiating the README PUT request.

---

## Bug Condition Pseudocode

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X — a DOM MutationRecord delivered to the attachObserver callback
  OUTPUT: boolean

  // Bug fires when pendingSubmission is armed AND the observer scans a
  // mutation target's full subtree and finds *any* "Accepted" text node,
  // regardless of whether it was newly inserted for the current submission.
  RETURN (
    pendingSubmission = true
    AND mutation.type = 'childList'
    AND hasAcceptedText(mutation.target)   // scans full subtree — the defect
    AND the found "Accepted" node is NOT inside the current-submission result
        container OR was not newly added in this mutation
  )
END FUNCTION
```

### Property: Fix Checking

```pascal
// Property: Fix Checking — stale/off-container "Accepted" must not trigger modal
FOR ALL X WHERE isBugCondition(X) DO
  result ← attachObserver_fixed(X)
  ASSERT document.getElementById('lgs-modal') = null
END FOR
```

### Property: Preservation Checking

```pascal
// Property: Preservation Checking — legitimate acceptance still triggers modal
FOR ALL X WHERE NOT isBugCondition(X) AND X is a genuine current-verdict "Accepted" node DO
  result ← attachObserver_fixed(X)
  ASSERT document.getElementById('lgs-modal') ≠ null
END FOR
```
