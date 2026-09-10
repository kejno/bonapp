```mermaid
flowchart TD
    O1["Write outputs/response.md — concise tracker-agnostic Markdown summary"]
    O2["Write outputs/pr_review.json — structured data for GitHub PR review"]
    O3["Write outputs/pr_review_general.md — brief general PR comment (1-2 paragraphs max)"]
    O4["Write outputs/pr_review_comments/ — directory with individual inline comment files"]
    O5["If pr_discussions.md present → include resolvedThreadIds in pr_review.json"]
    O6["Tracker-specific formatting is injected via cliPromptsByTracker — do NOT hardcode Jira/ADO markup in response.md"]
    O7["A test-automation PR usually covers several Test Cases in one branch (one spec file per ticket, e.g. tests/e2e/BNP-27.spec.ts) — the postJSAction re-runs this same review once per linked Test Case and applies ITS OWN verdict, not a shared one, so pr_review.json MUST include perTestCase (see below)"]
    O1 --> O2 --> O3 --> O4 --> O5 --> O6 --> O7
```

## perTestCase — required when the PR touches more than one Test Case

`pr_review.json` MUST include a `perTestCase` object mapping each Test Case's
ticket key to its own verdict, `"APPROVE"` or `"BLOCK"` — derived from that
Test Case's own spec file only, ignoring issues found in other files in the
diff:

```json
"perTestCase": {
  "BNP-25": "APPROVE",
  "BNP-26": "APPROVE",
  "BNP-27": "BLOCK"
}
```

- Key = the Test Case ticket key. Determine it from the spec file name
  (`tests/e2e/{KEY}.spec.ts`) for every Test Case ticket linked to this PR's
  parent Story, whether or not that Test Case's file changed in this diff —
  a ticket with no blocking issues in the diff is `"APPROVE"`.
- A single `BLOCKING` inline comment on a ticket's own file is enough to make
  that entry `"BLOCK"`; issues confined to a sibling ticket's file must NOT
  affect this ticket's entry.
- The top-level `recommendation` stays the overall PR verdict (BLOCK if ANY
  Test Case is BLOCK) — `perTestCase` is what actually drives each ticket's
  Jira status, so get it right per-file even when the overall verdict is
  BLOCK because of just one file.
