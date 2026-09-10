Example PR test automation review outputs — keep concise:

### outputs/pr_review.json
```json
{
  "recommendation": "BLOCK",
  "summary": "Test uses a fixed timeout instead of Vitest's assertion API and a brittle CSS selector.",
  "generalComment": "outputs/pr_review_general.md",
  "inlineComments": [
    {"path":"backend/test/TEST-123.e2e-spec.ts","line":12,"body":"🚨 BLOCKING: a brittle raw selector/query — use a semantic, typed API call (e.g. supertest's `.post('/route')`) like the rest of the existing specs in backend/test/.","severity":"BLOCKING"},
    {"path":"backend/test/TEST-123.e2e-spec.ts","line":18,"body":"🚨 BLOCKING: a fixed sleep/timeout — replace with awaiting the actual async operation (e.g. `await request(app).post(...)`) instead of a race-prone delay.","severity":"BLOCKING"},
    {"path":"backend/test/TEST-123.e2e-spec.ts","line":5,"body":"💡 SUGGESTION: Group related assertions under describe(...) to match the existing file's structure.","severity":"SUGGESTION"}
  ],
  "issueCounts": {"blocking":2,"important":0,"suggestions":1},
  "perTestCase": {"TEST-123": "BLOCK"}
}
```

### outputs/pr_review.json (APPROVE example)
```json
{
  "recommendation": "APPROVE",
  "summary": "Test correctly exercises the ticket's acceptance criteria with real assertions and no flaky waits.",
  "generalComment": "outputs/pr_review_general.md",
  "inlineComments": [],
  "issueCounts": {"blocking":0,"important":0,"suggestions":0},
  "perTestCase": {"TEST-123": "APPROVE"}
}
```

### outputs/pr_review.json (multi-Test-Case PR — only one file has issues)
A Story's test-automation PR often bundles several Test Cases (one spec file
per ticket). Here `BNP-25.spec.ts` and `BNP-26.spec.ts` are clean;
`BNP-27.spec.ts` is missing an assertion. Only BNP-27 gets a BLOCK entry —
BNP-25 and BNP-26 must NOT be penalized for an issue confined to a
different file, even though the overall PR `recommendation` is BLOCK because
at least one Test Case blocks merge:
```json
{
  "recommendation": "BLOCK",
  "summary": "BNP-25 and BNP-26 are correct. BNP-27 is missing the required text-muted assertion after the dark-theme toggle.",
  "generalComment": "outputs/pr_review_general.md",
  "inlineComments": [
    {"path":"backend/test/BNP-27.e2e-spec.ts","line":14,"body":"🚨 BLOCKING: Only toBeVisible() is asserted after switching to dark theme. The expected result requires verifying the text-muted token is still applied, not just that the element isn't hidden.","severity":"BLOCKING"}
  ],
  "issueCounts": {"blocking":1,"important":0,"suggestions":0},
  "perTestCase": {"BNP-25": "APPROVE", "BNP-26": "APPROVE", "BNP-27": "BLOCK"}
}
```

### outputs/pr_review_general.md
```markdown
## Automated Test PR Review — BLOCK

**Summary**: Test contains a brittle raw selector and a fixed timeout instead of proper async/await assertions.

**Next Steps**:
1. Replace the CSS selector with a role-based locator (getByRole/getByText), matching the existing specs in backend/test/
2. Replace waitForTimeout with an auto-retrying expect(...) assertion
```
