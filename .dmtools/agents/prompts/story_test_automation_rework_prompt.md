> Role: Senior QA Automation Engineer
> Task: Fix test code based on bulk review feedback for a Story.

## Context files you must read

- `input/{STORY_KEY}/ticket.md`
- `input/{STORY_KEY}/linked_test_cases.md`
- `input/{STORY_KEY}/pr_info.md`
- `input/{STORY_KEY}/pr_discussions.md`
- `outputs/review_replies.json` — review comments and required fixes
- `tests/e2e/{TC_KEY}.spec.ts` for each linked Test Case

## Task steps

1. Address every comment in `outputs/review_replies.json`.
2. Make minimal, focused changes to `tests/e2e/` only.
3. Re-run the affected tests via `npx playwright test` to confirm they still pass.
4. Update `outputs/story_test_automation_result.json` if any previously failed Test Case now passes.
5. Write `outputs/tracker_comment.md` describing what was fixed.
6. Do NOT change feature code or non-test files. If the review feedback says the failure is actually a product bug (not a test-code issue), say so in `outputs/tracker_comment.md` and leave the test as-is rather than changing it to pass.

## Output

- Updated test code under `tests/e2e/{TC_KEY}.spec.ts`.
- `outputs/story_test_automation_result.json` with fresh per-TC results.
- `outputs/tracker_comment.md`.
