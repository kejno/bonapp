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
    PASSED_REVIEW --> OUTPUT[Write outputs: response.md, pr_review.json (incl. perTestCase), pr_review_general.md, pr_review_comments/]
    FAILED_REVIEW --> OUTPUT
    OUTPUT --> END([End])
```

## Scope and contract validation

Before judging whether a test matches its Test Case, verify that the Test Case
itself is consistent with the parent Story and the implemented contract.
Parent Story scope and explicit implementation evidence take precedence over
an incorrect, stale, or prematurely generated Test Case.

- Verify exact endpoint paths, methods, authentication mechanisms, DTOs, and
  status codes against controllers and other implementation in the PR branch.
- Do not accept a guessed endpoint merely because the Test Case names it.
- Do not treat functionality owned by another unmerged Story as a product
  defect of the current Story.
- For middleware, RLS, migration, or service Stories, require an HTTP test only
  when an HTTP contract is explicitly in scope or supplied by a merged
  dependency.

## Recommendation versus test result

The PR recommendation evaluates test-code quality; it is not the product test
result. Apply this decision table:

| Situation | Recommendation |
|---|---|
| Test code incorrectly implements a valid, in-scope Test Case | `REQUEST_CHANGES` |
| Test Case fundamentally contradicts the parent Story or implemented contract | `BLOCK` as invalid scope; do not trigger test-code rework |
| Test correctly exposes an in-scope product defect | `APPROVE`; keep the Test Case result `failed` |
| Test requires another unmerged Story or future capability | `BLOCK` as blocked dependency; do not trigger test-code rework |
| Test is correct and passes | `APPROVE` |

Never request test-code changes merely because a correct test fails. When no
test-code change is requested, all review threads are resolved, and the
remaining work requires application code, approve the test PR and route the
failed result into the product bug/development flow.
