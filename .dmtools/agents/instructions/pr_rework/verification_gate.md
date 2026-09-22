# PR Rework — Verification Gate

Every rework round costs a full review cycle. A round spent reporting a lint
error, a type error, or a broken existing test is a round that finds no real
problem. Those failures are cheap to catch here and expensive to catch in review.

**Do not finish the rework until this gate passes.**

## Mandatory checks before writing outputs

Run these from the repository root, in order. All must pass:

```bash
npm run lint
npm run typecheck
npm test
```

If any command fails:

1. Fix the root cause — never disable a rule, loosen a type, or delete a failing
   assertion to get past the gate.
2. Re-run the failing command until it passes.
3. Re-run the whole sequence afterwards, since a fix can break an earlier step.

If a command does not exist in this repository, state that in `outputs/response.md`
and run the closest equivalent. Do not silently skip a check.

## Blast-radius check

A fix that satisfies one review thread frequently breaks code that an earlier
round already reviewed and accepted. Before finishing, check whether the change
touches any of the following — and if so, verify every consumer:

| Change | Required verification |
|---|---|
| Global provider (`APP_GUARD`, `APP_INTERCEPTOR`, `APP_FILTER`, global middleware) | Run the **entire** e2e suite, not just the specs you touched — a global guard applies to every existing route |
| DB schema, unique index, or constraint | Grep for every query using the affected field; a new composite key breaks existing single-field lookups |
| Public method signature or removed/renamed export | Grep for all callers across `apps/*` and `packages/*` |
| Migration files | Never edit an already-applied migration — add a new one. Keep timestamps strictly after those already on the base branch |
| Shared config (`tsconfig`, `eslint`, CI workflow) | Run lint, typecheck and tests for every affected workspace |

Use CodeGraph when available (`codegraph_callers`, `codegraph_impact`);
otherwise use grep and say so in `outputs/response.md`:

```bash
grep -rn "changedSymbolName" --include="*.ts" apps packages
```

## Migration safety

Migrations are append-only. Before adding one:

```bash
git diff --name-status origin/<baseBranch>...HEAD -- '*/migrations/*'
```

Any `M` (modified) entry on an existing migration is a defect — revert that file
and put the change in a new migration whose timestamp is later than every
migration already present on the base branch.

## Report the result

In `outputs/response.md`, under `## Test Coverage`, state explicitly which
commands were run and that they passed. If a blast-radius check applied, name
what was verified and how.
