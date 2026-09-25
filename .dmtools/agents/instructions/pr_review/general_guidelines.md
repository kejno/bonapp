# PR Review General Guidelines

## Review flow

```mermaid
flowchart TD
    START([PR ready for review]) --> READ["1. Read input context:<br/>instruction.md, ticket.md, pr_info.md,<br/>pr_diff.txt, pr_files.txt, ci_failures.md,<br/>ci_failures_full.log, pr_discussions.md,<br/>pr_discussions_raw.json"]
    READ --> ROUND{"pr_info.md:<br/>review round?"}
    ROUND -->|First review| DIFF["2. Diff checklist on FULL pr_diff.txt"]
    ROUND -->|Re-review after rework| INCDIFF["2. Diff checklist on incremental_diff.txt only;<br/>check prior open threads fixed"]
    DIFF --> FILES["3. Read full content of every changed file"]
    INCDIFF --> FILES2["3. Read full content of files touched<br/>by incremental_diff.txt + open-thread files"]
    FILES --> CODEGRAPH["4. Use CodeGraph:<br/>callers/callees of changed symbols,<br/>search for sensitive patterns,<br/>impact analysis"]
    FILES2 --> CODEGRAPH
    CODEGRAPH --> DIMS["5. Evaluate review dimensions:<br/>Security · Architecture/OOP · Code quality<br/>Test coverage · Duplication · Backward compatibility"]
    DIMS --> SEVERITY["6. Classify each finding:<br/>BLOCKING / IMPORTANT / SUGGESTION"]
    SEVERITY --> SCOPE{"First review?"}
    SCOPE -->|Yes| EXHAUST["7. Exhaustive pass:<br/>re-read changed files,<br/>surface ALL remaining issues"]
    SCOPE -->|No, re-review| NOSCOPE["7. No new IMPORTANT/SUGGESTION outside diff;<br/>new BLOCKING via impact analysis stays in scope"]
    EXHAUST --> OUTPUT["8. Write outputs:<br/>pr_review.json · pr_review_general.md · pr_review_comments/*.md"]
    NOSCOPE --> OUTPUT
    OUTPUT --> END([End])
```

## 1. Input context — MANDATORY reading order

```mermaid
flowchart TD
    subgraph PR_CONTEXT["⚠️ PR-specific files (read first)"]
        P1["1️⃣ instruction.md (repo root) — project stack, conventions"]
        P2["2️⃣ input/TICKET/pr_info.md — PR title, author, branch, description, review round"]
        P3["3️⃣ input/TICKET/pr_diff.txt — the full PR diff"]
        P3B["3️⃣b input/TICKET/incremental_diff.txt — diff since last review (re-review rounds only)"]
        P4["4️⃣ input/TICKET/pr_files.txt — list of changed files"]
        P5["5️⃣ input/TICKET/ci_failures.md — CI failures = BLOCKING (last 500 lines)"]
        P5_FULL["5️⃣ input/TICKET/ci_failures_full.log — full CI logs"]
        P6["6️⃣ input/TICKET/pr_discussions.md + pr_discussions_raw.json — existing comments"]
        P1 --> P2 --> P3 --> P3B --> P4 --> P5 --> P5_FULL --> P6
    end

    subgraph TICKET_CONTEXT["Ticket context (for understanding PR purpose)"]
        T1["7️⃣ input/TICKET/ticket.md — linked ticket description, ACs"]
        T2["8️⃣ input/TICKET/comments.md — ticket discussion if present"]
        T3["9️⃣ input/TICKET/parent-*.md — parent story context"]
        T4["🔟 input/TICKET/confluence/*.md — linked specifications"]
        T1 --> T2 --> T3 --> T4
    end

    subgraph RULE["⚠️ Rule"]
        R1["If file exists in input/ → read locally, do NOT re-fetch via dmtools"]
    end

    PR_CONTEXT --> TICKET_CONTEXT --> RULE
```

Read PR files to understand WHAT changed. Read ticket files to understand WHY it changed and verify against requirements.

## 2. Diff checklist — apply to `pr_diff.txt` (first review) or `incremental_diff.txt` (re-review, see §7)

For every hunk, ask at least these questions:

- [ ] Does the change match the ticket scope? Any scope creep?
- [ ] Are new or changed public APIs contract-safe for existing callers?
- [ ] Is user/external input validated, sanitized, or escaped?
- [ ] Are secrets, tokens, or PATs handled safely — not logged, not interpolated into shell scripts?
- [ ] Are new or modified files present under `testing/` in a non-test-automation PR?
- [ ] Is dead code, unused imports, or obvious duplication introduced?
- [ ] Are error paths handled, or are failures silently swallowed?
- [ ] Are new dependencies justified and compatible with the existing stack?
- [ ] Beyond blockers: what other maintainability, correctness, or quality improvements are visible in the changed code?

## 3. Changed-file deep read

Do not review from the diff alone. On a first review, read the full content of every changed file. On a re-review, read the full content of every file touched by `incremental_diff.txt` (full file, not just the hunk — surrounding context matters), plus any file with a still-open thread from §7:

- imports and dependencies
- class/method responsibilities and adherence to SRP / OOP principles
- naming consistency with the rest of the codebase
- error handling, logging, and edge cases
- test coverage for changed behavior
- backward-compatibility and migration impact

## 4. Impact analysis (CodeGraph or grep fallback)

**Always run this step, on both a first review and a re-review — it is not exempted by §7's incremental scoping.** §7 limits which code gets *new style/maintainability findings*; it never limits the blast-radius check. A rework commit can introduce a BLOCKING regression in a file the diff never touches (e.g. it changes a function's contract and an untouched caller still assumes the old one) — that regression is only visible from this step, not from reading `incremental_diff.txt` in isolation.

Use CodeGraph to find "what could break":

- `codegraph_callers` / `codegraph_callees` on modified public symbols — on a re-review, run this on every symbol touched by `incremental_diff.txt`, and follow callers even into files outside the diff
- `codegraph_search` for: `PAT_TOKEN`, `secrets.`, `github.token`, `previousViewModel`
- `codegraph_impact` before flagging architectural changes

If this surfaces a real BLOCKING regression in a file `incremental_diff.txt` doesn't cover, it is always in scope regardless of review round — file it as `outputs/pr_review_general.md` (not an inline comment, since the affected line isn't in the diff) and say explicitly which changed symbol caused it.

**If CodeGraph unavailable**, use grep and document it:
```bash
grep -rn "changedFunctionName" --include="*.ts" .
grep -rn "secrets\.\|github\.token" .
```

## 5. Review dimensions

Rate the PR across all relevant dimensions:

| Dimension | What to check |
|---|---|
| **Security** | injection, unsafe interpolation, secret leakage, missing permissions, unsafe defaults |
| **Architecture / OOP** | SRP, coupling, abstraction consistency, provider/repository boundaries |
| **Code quality** | naming, complexity, error handling, logging, comments |
| **Tests** | coverage for new/changed paths, meaningful assertions, no brittle string-only tests |
| **Duplication** | copy-paste, duplicated logic across files, duplicated configuration |
| **Backward compatibility** | public API changes, migration paths, default behavior |
| **Performance** | unnecessary rebuilds, heavy sync operations, missing timeouts |
| **Workflow / CI safety** | (when `.github/workflows/` changes) secret declarations, ref pinning, permissions, timeouts |

## 6. Severity classification

Classify every finding before writing outputs:

- **BLOCKING** — merge would cause a bug, security issue, data loss, or CI break. Must be fixed.
- **IMPORTANT** — real maintainability or correctness issue. Strongly prefer fixing before merge.
- **SUGGESTION** — optional improvement, style, or future polish. Does not block merge.

When in doubt, start one level higher; downgrade only after confirming the risk is negligible.

## 7. First review vs. re-review — scope discipline

`pr_info.md` states the **review round** at the bottom (written by the setup step):

- **"First review on this PR"** → this is a fresh, exhaustive pass. Review the entire `pr_diff.txt`. Everything in this document (checklist, deep-read, dimensions, exhaustive pass) applies at full scope. Aim to surface the maximum number of actionable findings — the author will not get a cheaper chance to catch what's missed here.

- **"Re-review after rework — last reviewed commit `<sha>`"** → a previous round of this same review already covered the code as it stood at `<sha>`. This round exists to check the fix and its consequences, not to re-litigate style/maintainability calls already made on unchanged code:
  - Read `incremental_diff.txt` (diff from `<sha>` to the current head) as the primary object of review. This is what actually changed since last time.
  - Cross-check `pr_discussions.md` / `pr_discussions_raw.json`: for every previously open BLOCKING/IMPORTANT thread, don't just check that *something* changed nearby — verify the current code actually removes the failure scenario the thread described. A rename, a comment, or a partial fix that leaves the same bug reachable through a slightly different path is **not** a fix: re-raise it. Only put a thread in `resolvedThreadIds` when you can state why the original failure scenario can no longer happen.
  - Run §4 impact analysis on every symbol `incremental_diff.txt` touches — this is not optional on a re-review (see §4). A new BLOCKING issue anywhere this analysis reaches — inside or outside `incremental_diff.txt` — is always in scope, since it is a consequence of the rework itself.
  - **Do not open new IMPORTANT/SUGGESTION findings on code the rework didn't touch and §4 impact analysis doesn't implicate**, purely from re-reading the full `pr_diff.txt` and noticing something imperfect that was already there last round. That code already passed (or was accepted at) the prior round; re-flagging pre-existing imperfections on every rework cycle is exactly the churn this rule exists to stop. New BLOCKING findings are never suppressed by this rule, wherever they're found — severity, not location, is what §7 restricts.
  - If `incremental_diff.txt` says "No new commits since the last reviewed commit" but the ticket was sent for re-review anyway, re-check only the previously flagged threads against the current code — do not perform a fresh full-PR pass.
  - If `incremental_diff.txt` is missing even though `pr_info.md` says this is a re-review (setup could not compute it — e.g. history was rewritten by a force-push), fall back to a full `pr_diff.txt` pass as if it were a first review, and say so in `generalComment`.

The goal: every BLOCKING/IMPORTANT issue is raised the first time the code that has it is seen, and stays raised until actually fixed — including regressions the fix itself introduces, wherever they surface. What §7 stops is re-opening SUGGESTION/IMPORTANT-level style and maintainability debate on code nobody touched and nothing implicates, purely because it's being looked at again.

## 8. Outputs

Write the standard review artifacts:

- `outputs/pr_review.json` — structured data with `recommendation`, `summary`, `inlineComments`, `issueCounts`
- `outputs/pr_review_general.md` — 1-2 paragraph general PR comment
- `outputs/pr_review_comments/*.md` — one file per detailed inline comment

**Inline comment lines must be present in the full PR diff (`pr_diff.txt`), even on a re-review.** GitHub review threads can only be attached to added or context lines inside a diff hunk against the base branch — `incremental_diff.txt` only scopes *which* findings to look for, it is never what a comment line number is validated against. If `pr_diff.txt` is truncated, run `git diff origin/{baseBranch}...HEAD` to locate the correct line numbers. Findings on unchanged code outside the diff belong in `outputs/pr_review_general.md`, not as inline comments.

Do NOT write `outputs/response.md`; the review is posted to GitHub only.
