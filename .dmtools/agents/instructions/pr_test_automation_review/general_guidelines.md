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
    FAILED_REVIEW --> DEFECT{"Is the test correct AND the failure<br/>a genuine product defect/gap?<br/>see 'Genuine defect → APPROVE' below"}
    DEFECT -->|Yes| APPROVE_DEFECT["perTestCase verdict = APPROVE<br/>(NOT a BLOCK — the test did its job)"]
    DEFECT -->|No, test itself is wrong| BLOCK_TEST["perTestCase verdict = BLOCK,<br/>inline comments on the test-code issue"]
    APPROVE_DEFECT --> OUTPUT
    BLOCK_TEST --> OUTPUT
    PASSED_REVIEW --> OUTPUT[Write outputs: response.md, pr_review.json (incl. perTestCase), pr_review_general.md, pr_review_comments/]
    OUTPUT --> END([End])
```

## Do not re-raise an issue already sitting in an open thread

Before writing a new inline comment, check `pr_discussions.md` /
`pr_discussions_raw.json` for an existing **open** (unresolved) thread on the
same file that already raises the same underlying issue. If one exists and
rework has not actually changed the code the thread is about, do not create
a second inline comment restating it — that thread is already open and
waiting on a fix; a second one doesn't get it fixed any faster and only
duplicates the conversation.

This matters because `pr_test_automation_rework` is instructed to reply to
**every** open thread on each of its runs (see its own
`general_guidelines.md`) — a review that opens a fresh thread for an
unresolved issue every round, instead of leaving the original thread open,
produces one more "✅ Addressed." reply per round on top of all the previous
rounds' duplicate threads. Observed on PR #169: the same BNP-417 finding
("calls the API directly instead of exercising the KDS drag-and-drop through
the UI") was re-opened as a new thread on repeated rounds, and rework's
blanket reply-to-all-open-threads behavior compounded it into 700+ comments.

Only open a new thread when: the finding is genuinely new (a different file,
a different defect), or the previous thread was already resolved and a
*new* instance of a similar issue has appeared. If the same file/finding
keeps failing across rounds with the code essentially unchanged, say so in
`generalComment` instead of adding another inline comment — that's a signal
rework isn't actually fixing it, not a reason to file it again.

## Genuine defect → APPROVE, not BLOCK

A FAILED test is not automatically a problem with the test. If the test
correctly exercises the Test Case's steps and the failure is because the
product doesn't yet do what the ticket expects, **the test succeeded at its
job** — it caught a real gap. Give that Test Case's `perTestCase` entry
`"APPROVE"`, not `"BLOCK"`.

This is not a cosmetic choice of wording: `APPROVE` is what moves the Test
Case to the `Failed` status that the SM pipeline's bulk-bugs-creation rule
watches for (`sm.json` → "Failed Test Cases → create or link bugs in
batch") — that automated step is what turns a genuine product defect into a
Bug ticket. Using `BLOCK` instead sends the Test Case back to
`pr_test_automation_rework`, which can only edit test code — it has no
mandate or mechanism to fix the product, and no mechanism to create a Bug
either. A genuine product defect marked `BLOCK` therefore never resolves:
rework keeps adjusting the test, review keeps finding the same underlying
defect, and the PR cycles indefinitely instead of the defect ever reaching
a Bug ticket a developer can act on.

Use `BLOCK` only when the test itself is the problem: wrong assertions,
wrong preconditions, doesn't match the Test Case steps, flaky, or missing
the evidence a developer would need. If you are on a re-review and the same
FAILED result keeps recurring across rounds with the test code essentially
unchanged, that is a strong signal the failure is a genuine defect being
misclassified as a test-code issue — re-check against this section rather
than requesting another round of test edits.
