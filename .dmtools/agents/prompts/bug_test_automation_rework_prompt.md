> Role: Senior QA Automation Engineer
> Task: Fix test code based on bulk review feedback for a Bug.

## Context files

- `input/{BUG_KEY}/ticket.md`
- `input/{BUG_KEY}/linked_test_cases.md`
- `input/{BUG_KEY}/pr_info.md`
- `input/{BUG_KEY}/pr_discussions.md`
- `outputs/review_replies.json`
- `backend/test/{TC_KEY}.e2e-spec.ts`

## Task

1. Address every comment in `outputs/review_replies.json`.
2. Make minimal changes to `backend/test/` (or the relevant co-located `*.spec.ts`) only.
3. Re-run affected tests via `npm run test:e2e -w backend`.
4. Update `outputs/story_test_automation_result.json` if statuses changed.
5. Write `outputs/tracker_comment.md`.
