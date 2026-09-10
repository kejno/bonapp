# Story-level Test Automation Guidelines

You are automating a Story that has reached **Ready For Testing**. The Story
already has linked Test Case tickets. Your job is to process **all linked
Test Cases in one bulk run**.

This project uses **Vitest**, not Playwright/browser-based E2E — there is no
`tests/e2e/` directory or `playwright.config.ts` here.

- Backend (`backend/`): NestJS + Vitest.
  - Integration tests (HTTP requests through the real app, e.g. via
    `supertest`) live in `backend/test/*.e2e-spec.ts`, run with
    `npm run test:e2e -w backend` (config: `backend/vitest.config.e2e.ts`,
    matches `**/*.e2e-spec.ts`).
  - Unit tests (service/guard/controller logic in isolation) live next to
    the source file in `backend/src/**/*.spec.ts`, run with
    `npm run test -w backend` (config: `backend/vitest.config.ts`, matches
    `**/*.spec.ts`). See `backend/src/identity/auth.service.spec.ts` and
    `backend/src/identity/guards/roles.guard.spec.ts` for the existing
    style.
- Frontend (`frontend/`): no test tooling is set up yet. If a Test Case
  requires testing frontend behavior and no test runner exists yet for
  `frontend/`, treat it the same as any other missing-infrastructure case
  (see Failure classification below) rather than installing a new
  framework (e.g. Playwright) yourself.

For a given Test Case, prefer an integration test
(`backend/test/{TC_KEY}.e2e-spec.ts`) when it exercises an HTTP
endpoint end-to-end (the realistic default for API-level Test Cases in this
project); use a unit test (co-located `*.spec.ts`) only when the Test Case is
specifically about one service/guard/pipe's isolated logic.

## Workflow

1. Read the Story ticket and all linked Test Cases from
   `input/{STORY_KEY}/linked_test_cases.md`.
2. If `input/{STORY_KEY}/merge_conflicts.md` is present, the test branch
   could not be cleanly synced with `origin/main`. Resolve every
   `<<<<<<<` / `=======` / `>>>>>>>` conflict marker in the listed files,
   using `input/{STORY_KEY}/pr_diff.txt` for context. Stage each resolved
   file with `git add <file>`. Do NOT `git commit` or `git merge --abort`.
3. For each linked Test Case:
   - Check if an automated test already exists at
     `backend/test/{TC_KEY}.e2e-spec.ts` (or, for a unit-scoped Test Case,
     next to the relevant source file).
   - If it exists, run it: `npm run test:e2e -w backend -- {TC_KEY}` (or
     `npm run test -w backend -- {TC_KEY}` for a unit test).
   - If it is missing, write a new spec file for it (Vitest's `describe`/
     `it`/`expect` API; for integration specs, `supertest` against the
     Nest app instance — see `backend/test/app.e2e-spec.ts`). Match the
     style of existing specs.
4. Produce a single result JSON: `outputs/story_test_automation_result.json`.
5. For every failed Test Case, produce `outputs/failed_description_{TC_KEY}.md`.
6. If environment/credentials are missing, produce `outputs/blocked.json`
   instead of running tests.

## Failure classification

- A **product failure** — the test ran and found a real bug in the product —
  must be recorded as `failed`. The Story and the failing Test Case follow
  the normal review flow.
- An **access / credential / permission / infrastructure failure** — the
  test account cannot reach a required service, repository, secret, or
  token — is **NOT a product failure**. Mark that Test Case as `skipped`,
  explain the blocker in `failureSummary`, and keep the overall result as
  `passed` if all other Test Cases passed. Do **not** mark it `failed`.
- A Test Case that needs frontend test tooling that does not exist yet
  (see the Frontend note above) is also **NOT a product failure** — mark it
  `skipped` with `failureSummary` explaining that `frontend/` has no test
  runner configured. Do not install one as part of this run.
- If **every** linked Test Case is blocked by missing setup, set `overall`
  to `blocked_by_human` and produce `outputs/blocked.json`.

## Scope rules

- You may ONLY write code inside `backend/test/` and `backend/src/**/*.spec.ts`
  files. Do not touch non-test application code to make a test pass — a test
  automation run is not a bug-fix run; if the product itself is broken,
  record it as a `failed` result instead of patching the app.
- Do not install Playwright or any browser-based E2E framework — out of
  scope for this run (see Failure classification above for how to handle a
  Test Case that would need one).
- Each Test Case gets its own spec file.
- Match the existing style: real assertions against the actual response/
  return value, no page-object or heavy abstraction layer unless the Story
  genuinely needs one to avoid duplication across many specs.

## Output files

| File | Purpose |
|------|---------|
| `outputs/story_test_automation_result.json` | Per-TC results and overall status. |
| `outputs/tracker_comment.md` | Human-readable summary for the Story ticket comment. |
| `outputs/failed_description_{TC_KEY}.md` | Full failure report for a failed Test Case. |
| `outputs/blocked.json` | Required when automation cannot run due to missing setup. |

## Result statuses

- `passed` — test ran successfully.
- `failed` — test ran and failed; a failed description file must be written.
- `skipped` — test cannot be automated (requires human-only verification); explain why.
- `blocked_by_human` — the whole Story is blocked by missing credentials/data.
