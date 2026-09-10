```mermaid
flowchart TD
    START([Test automation PR ready for review]) --> PROJ["Read instruction.md from repo root if it exists"]
    PROJ --> INPUT["Read PR context from input folder"]
    INPUT --> INPUTS["ticket.md, pr_info.md, pr_diff.txt, pr_files.txt, ci_failures.md, ci_failures_full.log, pr_discussions.md, pr_discussions_raw.json"]
    INPUTS --> SCOPE["Confirm scope: review test code only inside backend/test/*.e2e-spec.ts or co-located backend/src/**/*.spec.ts"]
    SCOPE --> CORRECT["Compare test steps against Test Case: objective, preconditions, steps, expected result"]
    CORRECT --> QUALITY["Check code quality: no hardcoded secrets, proper setup/teardown, no duplicated logic, real assertions"]
    QUALITY --> DATA["Check test data self-sufficiency: generate → download → approve blocked_by_human only when genuinely required"]
    DATA --> PERTC["List every Test Case ticket linked to this PR's parent Story (one spec file per ticket, e.g. backend/test/BNP-27.e2e-spec.ts) — this review re-runs once per linked Test Case and each one needs its OWN verdict, not the PR's overall one"]
    PERTC --> RESULT{Test result in PR description}
    RESULT -->|PASSED| PASSED_REVIEW["Verify the PASSED result is meaningful — not a false positive"]
    RESULT -->|FAILED| FAILED_REVIEW["Verify the test fails for the right reason — not a test code issue"]
    PASSED_REVIEW --> OUTPUT[Write outputs: response.md, pr_review.json (incl. perTestCase), pr_review_general.md, pr_review_comments/]
    FAILED_REVIEW --> OUTPUT
    OUTPUT --> END([End])
```
