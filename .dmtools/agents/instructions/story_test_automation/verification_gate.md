# Story Test Automation — Verification Gate

A spec file that doesn't lint or doesn't typecheck fails CI on the automation
PR, which then needs a manual rework round to fix a problem that was cheap to
catch here. Run this gate on every spec file you wrote or modified this run,
before writing `outputs/story_test_automation_result.json`.

**Do not finish the run until this gate passes for every test file you touched.**

## Mandatory checks

Only lint/typecheck the files you actually added or modified this run — never
the whole workspace, and never pre-existing spec files you didn't touch.

For each app whose test files you touched:

```bash
# apps/api (Jest)
npx eslint <your .spec.ts files under apps/api>
npm run typecheck -w apps/api   # no reliable single-file mode — runs project-wide,
                                 # but only fix errors in files you added/modified

# apps/guest-web (Vitest)
npx eslint <your .spec.ts/.test.ts/.test.tsx files under apps/guest-web>
npm run typecheck -w apps/guest-web

# apps/admin-web (Vitest)
npx eslint <your .spec.ts/.test.ts/.test.tsx files under apps/admin-web>
npm run typecheck -w apps/admin-web
```

If a command name differs from the above in this repository (check each app's
`package.json` scripts), use the actual script name — do not skip the check
because the exact command guessed here doesn't exist.

If typecheck surfaces a pre-existing error in a file you did not touch, leave
it alone — note it in `outputs/tracker_comment.md` if it blocks a clean run,
don't fix unrelated code.

## On failure

1. Fix the root cause in the spec file — never disable a lint rule, loosen a
   type, or delete a failing assertion to get past the gate.
2. Re-run the failing command until it passes.
3. Re-run the test itself afterwards (per `general_guidelines.md` workflow),
   since a lint/type fix can change runtime behavior.

If eslint or typecheck is not configured for an app you touched, state that in
`outputs/tracker_comment.md` and proceed — do not invent a config to satisfy
this gate.

## Report the result

In `outputs/tracker_comment.md`, note that lint and typecheck were run for the
test files this round produced or modified, and that they passed. If a check
could not run (missing script, no config), say so explicitly instead of
silently skipping it.
