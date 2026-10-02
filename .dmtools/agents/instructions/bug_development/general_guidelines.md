```mermaid
flowchart TD
    START([Bug ticket ready for fix]) --> READ["⚠️ MANDATORY: Read ALL input files FIRST — see instructions/common/input_context_reading.md"]
    READ --> RETURNED{Ticket returned to development?}
    RETURNED -->|Yes| PREV["Review previous PR diff and QA feedback in comments.md"]
    PREV --> RCA_RET["Write/Update RCA explaining why previous fix failed — see output_rules.md for rca.md format"]
    RETURNED -->|No| RCA_FRESH["Write fresh RCA from ticket description and linked_tests.md"]
    RCA_RET --> HYPOTHESES
    RCA_FRESH --> HYPOTHESES["Rank 3-5 falsifiable hypotheses for the root cause in the RCA<br/>— see 'Ranked hypotheses' below — before writing any reproduction code"]
    HYPOTHESES --> REPRO["Find or write the test that reproduces the bug (apps/api/test/&lt;TC_KEY&gt;.e2e-spec.ts for a linked Test Case, or a co-located apps/api/src/**/*.spec.ts for backend; apps/guest-web/src/**/*.{spec,test}.ts(x) or apps/admin-web/src/**/*.{spec,test}.ts(x) for frontend). Run it — it MUST FAIL"]
    REPRO --> EXISTS{Test fails?}
    EXISTS -->|No| ALREADY["Check git history, current code, and linked tests.<br/>⚠️ If linked test exists: verify it passes AND the test was created/updated BEFORE the fix commit — not after.<br/>If bug is genuinely fixed — write outputs/already_fixed.json and stop"]
    ALREADY --> END_FIXED([End — bug already fixed])
    EXISTS -->|Yes| BLOCKED{Fix requires external decision, secrets, or infra changes?}
    BLOCKED -->|Yes| BLOCK["Write outputs/blocked.json and stop — see output_rules.md"]
    BLOCK --> END_BLOCKED([End — blocked awaiting human input])
    BLOCKED -->|No| FIX["Make minimum targeted fix for the root cause ONLY"]
    FIX --> VERIFY["Run reproduction test (must PASS) and the full test suite for the affected app (no regressions) via npm run test -w apps/api and npm run test:e2e -w apps/api (or npm run test -w apps/guest-web / npm run test -w apps/admin-web for frontend)"]
    VERIFY --> PASS{All tests pass?}
    PASS -->|No| ADJUST["Adjust fix and re-run tests"]
    ADJUST --> VERIFY
    PASS -->|Yes| DEBUGCLEAN["grep for the [DEBUG-xxxx] prefix — see 'Debug instrumentation' below —<br/>remove every temporary log/probe before continuing"]
    DEBUGCLEAN --> GITSTATUS["Run git status and review every new/modified file"]
    GITSTATUS --> SECRETS{Sensitive or untracked non-code files present?}
    SECRETS -->|Yes| IGNORE["Add appropriate patterns to .gitignore"]
    SECRETS -->|No| SUMMARY["Write concise bug fix summary to outputs/response.md — see output_rules.md"]
    IGNORE --> SUMMARY
    SUMMARY --> END([End — post-processing handles git/PR])
```

## Returning from test-automation failure

When this Bug has been sent back to development because a linked Test Case failed:

1. Read the `Failed Reason` field of every linked Test Case.
2. If the failure is caused by a missing token, missing permission, missing secret, or any other access/credential/infra issue that you cannot fix in product code, write `outputs/blocked.json` and stop. Do **not** try to code a fix for an access problem.
3. Only attempt a product-code fix when the failure is a genuine product regression.

## Ranked hypotheses — before writing any reproduction code

Jumping straight from the ticket description to a reproduction test anchors
on whatever cause looks most obvious first. Before touching code or writing
the reproduction test, add a short "Hypotheses" list to the RCA with 3-5
**ranked, falsifiable** candidate root causes:

> Format: "If `<X>` is the cause, then `<changing Y>` will make the bug
> disappear / `<changing Z>` will make it worse."

If a candidate can't be phrased as a testable prediction, it's a guess, not
a hypothesis — sharpen it or drop it. Use the ticket, `comments.md`, and
`linked_tests.md` to rank them (e.g. a recently changed file from the diff
history outranks an untouched one). The reproduction test in the next step
should target the top-ranked hypothesis first; if it doesn't reproduce the
bug, that's a falsified hypothesis — move to the next one and say so in the
RCA rather than silently pivoting.

## Debug instrumentation

Any temporary log, `console.log`/`Logger.debug` call, or probe added while
narrowing down the cause must be tagged with a unique prefix, e.g.
`[DEBUG-a4f2]`. This makes cleanup mechanical: before finishing, `grep -rn
"\[DEBUG-" <changed files>` and remove every match. An untagged debug log
left behind is indistinguishable from an intentional one and will surface as
a review finding — tag everything temporary as you add it, not retroactively
at the end.
