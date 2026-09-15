# Story-level Test Automation Guidelines

You are automating a Story that has reached **Ready For Testing**. The Story
already has linked Test Case tickets. Your job is to process **all linked
Test Cases in one bulk run**.

This is a monorepo (Turborepo/pnpm workspaces) with one backend app and two
frontend apps, each with its own test tooling — there is no shared
`tests/e2e/` directory at the repo root.

- Backend (`apps/api/`): NestJS + **Jest** (not Vitest).
  - Integration tests (HTTP requests through the real app, e.g. via
    `supertest`) live in `apps/api/test/*.e2e-spec.ts`, run with
    `npm run test:e2e -w apps/api` (config: usually
    `apps/api/test/jest-e2e.json` — the standard Nest CLI layout).
  - Unit tests (service/guard/controller logic in isolation) live next to
    the source file in `apps/api/src/**/*.spec.ts`, run with
    `npm run test -w apps/api` (config: the `jest` section of
    `apps/api/package.json` — the standard Nest CLI layout, matching
    `**/*.spec.ts`). See existing `*.spec.ts` files in `apps/api/src/` as a
    style reference, if any already exist.
- Frontend (`apps/guest-web/` and `apps/admin-web/`): React + Vite +
  **Vitest** for unit tests, Playwright for e2e.
  - Unit tests live co-located with the source file in
    `apps/{guest-web,admin-web}/src/**/*.{spec,test}.{ts,tsx}`, run with
    `npm run test -w apps/guest-web` or `npm run test -w apps/admin-web`.

For a given Test Case, prefer a backend integration test
(`apps/api/test/{TC_KEY}.e2e-spec.ts`) when it exercises an HTTP
endpoint end-to-end (the realistic default for API-level Test Cases in this
project); use a unit test (co-located `*.spec.ts`/`*.test.ts(x)` in the
relevant app) only when the Test Case is specifically about one
service/guard/pipe's or component's isolated logic.

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
     `apps/api/test/{TC_KEY}.e2e-spec.ts` (or, for a unit-scoped Test Case,
     next to the relevant source file in `apps/api/src/`, `apps/guest-web/src/`,
     or `apps/admin-web/src/`).
   - If it exists, run it: `npm run test:e2e -w apps/api -- {TC_KEY}` (or
     `npm run test -w apps/api -- {TC_KEY}` / `npm run test -w apps/guest-web
     -- {TC_KEY}` / `npm run test -w apps/admin-web -- {TC_KEY}` for a unit
     test, depending on which app owns the code).
   - If it is missing, write a new spec file for it (Jest's `describe`/`it`/
     `expect` API for backend, Vitest's for frontend; for backend
     integration specs, `supertest` against the Nest app instance — see
     existing `apps/api/test/*.e2e-spec.ts` files, if any, for the style).
     Match the style of existing specs.
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
- If **every** linked Test Case is blocked by missing setup, set `overall`
  to `blocked_by_human` and produce `outputs/blocked.json`.

## Scope rules

- You may ONLY write code inside `apps/api/test/`, `apps/api/src/**/*.spec.ts`,
  `apps/guest-web/src/**/*.{spec,test}.{ts,tsx}`, and
  `apps/admin-web/src/**/*.{spec,test}.{ts,tsx}` files. Do not touch non-test
  application code to make a test pass — a test automation run is not a
  bug-fix run; if the product itself is broken, record it as a `failed`
  result instead of patching the app.
- Do not add new test tooling/frameworks (e.g. installing Playwright) as
  part of this run — only write tests using the Jest/Vitest tooling already
  configured for each app.
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
