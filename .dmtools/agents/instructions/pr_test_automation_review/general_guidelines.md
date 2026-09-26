```mermaid
flowchart TD
    START([Test automation PR ready for review]) --> PROJ["Read instruction.md from repo root if it exists"]
    PROJ --> INPUT["Read PR context from input folder"]
    INPUT --> INPUTS["ticket.md, pr_info.md, pr_diff.txt, pr_files.txt, ci_failures.md, ci_failures_full.log, pr_discussions.md, pr_discussions_raw.json"]
    INPUTS --> SCOPE["Confirm scope: review test code only inside apps/api/test/*.e2e-spec.ts or co-located apps/api/src/**/*.spec.ts"]
    SCOPE --> CORRECT["Compare test steps against Test Case: objective, preconditions, steps, expected result"]
    CORRECT --> QUALITY["Check code quality: no hardcoded secrets, proper setup/teardown, no duplicated logic, real assertions"]
    QUALITY --> DATA["Check test data self-sufficiency: generate → download → approve blocked_by_human only when genuinely required"]
    DATA --> PERTC["List every Test Case ticket linked to this PR's parent Story (one spec file per ticket, e.g. apps/api/test/BNP-27.e2e-spec.ts) — this review re-runs once per linked Test Case and each one needs its OWN verdict, not the PR's overall one"]
    PERTC --> RESULT{Test result in PR description}
    RESULT -->|PASSED| PASSED_REVIEW["Verify the PASSED result is meaningful — not a false positive"]
    RESULT -->|FAILED| FAILED_REVIEW["Verify the test fails for the right reason — not a test code issue"]
    FAILED_REVIEW --> SEAM{"Does the test reach the failure<br/>through the RIGHT seam?<br/>see 'Wrong seam' below"}
    SEAM -->|No correct seam exists| SEAMFINDING["Architectural finding, not a test-code finding —<br/>flag in generalComment, not an inline test-code comment"]
    SEAM -->|Yes, seam is right| OUTPUT
    SEAMFINDING --> OUTPUT
    PASSED_REVIEW --> OUTPUT[Write outputs: response.md, pr_review.json (incl. perTestCase), pr_review_general.md, pr_review_comments/]
    OUTPUT --> END([End])
```

## Wrong seam is itself a finding

A FAILED test can be failing for the right *reason* (it caught a real
product gap) while still being written at the wrong *seam* — the level
where the test attaches to the code. Two different problems, two different
findings:

- **Test-code issue** (the existing FAILED_REVIEW check): the test is at a
  reasonable seam but has a bug in the test itself (wrong assertion, bad
  setup, brittle selector).
- **Wrong-seam issue** (new check): the test can only reach the failure by
  going around the production code's public interface — reading internal
  state, calling a private method, asserting on an unrelated side channel —
  because **no correct seam exists** at the right level (e.g. the bug only
  manifests across multiple callers and a single-caller unit test can't
  reproduce the chain that triggers it, or the production code exposes no
  public entry point that reaches the failing path at all).

When the test reaches the failure only by bypassing the interface a real
caller would use, that is not a test-quality nitpick — it means the
**production code's architecture is preventing the bug from being locked
down** at any seam that actually matches how it occurs. Flag this in
`outputs/pr_review_general.md` (not as an inline comment on the test file,
since the fix isn't in the test) and name what public entry point or
interface change would be needed for a correct seam to exist. Do not ask
the author to just "write a better test" when the real gap is that no
better test is currently possible.
