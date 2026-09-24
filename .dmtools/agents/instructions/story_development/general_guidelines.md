```mermaid
flowchart TD
    START([Story ticket ready for development]) --> READ_INPUT["⚠️ MANDATORY: Read ALL input files FIRST — see instructions/common/input_context_reading.md"]
    READ_INPUT --> PARENT["Read parent epic context if present:<br/>- input/TICKET/parent_context_ba.md — business rules<br/>- input/TICKET/parent_context_sa.md — technical design<br/>- input/TICKET/parent_context_vd.md — visual design"]
    PARENT --> ANALYZE["Analyze requirements — every acceptance criterion must be addressed"]
    ANALYZE --> ARCH["Understand existing codebase patterns, architecture, and test structure"]
    ARCH --> PRINCIPLES["Apply OOP principles: SRP, OCP, DI, Encapsulation, Composition over inheritance"]
    PRINCIPLES --> TDD["Follow TDD approach — see tdd_approach.md"]
    TDD --> TEST_LOC["Write TDD tests in the standard unit-test tree only<br/>— Flutter/Dart: test/<br/>— NEVER in testing/ (owned by test-automation agents)"]
    TEST_LOC --> IMPLEMENT["Implement source code and unit tests following existing patterns"]
    IMPLEMENT --> DOCS["Update documentation ONLY if ticket explicitly requires it"]
    DOCS --> RUN["Run all unit tests — MUST pass before finishing"]
    RUN --> PASS{Tests pass?}
    PASS -->|No| FIX["Fix failures and re-run tests"]
    FIX --> RUN
    PASS -->|Yes| DIFFLIST["List new/modified source files only<br/>(e.g. git diff --diff-filter=ACM --name-only + git status --short for untracked)"]
    DIFFLIST --> LINT["Lint exactly those files<br/>(e.g. npx eslint &lt;changed-files&gt;, not the whole workspace) — MUST pass before finishing"]
    LINT --> LINTPASS{Lint passes, zero errors, on changed files?}
    LINTPASS -->|No| LINTFIX["Fix lint errors in changed files — auto-fixable ones via --fix, rest manually<br/>NEVER disable/suppress a rule to make it pass<br/>Pre-existing errors in untouched files are NOT your responsibility — do not fix or reformat them"]
    LINTFIX --> LINT
    LINTPASS -->|Yes| TYPECHECK["Run the project's typecheck command for the whole changed workspace<br/>(e.g. npm run typecheck --workspace=apps/api) — TypeScript has no reliable single-file mode,<br/>so this may surface pre-existing errors; only fix ones in files you touched"]
    TYPECHECK --> TYPEPASS{Typecheck introduces no NEW errors in your changed files?}
    TYPEPASS -->|No| TYPEFIX["Fix type errors in the files you changed — NEVER silence with `any`/`@ts-ignore` to make it pass<br/>Leave pre-existing errors in untouched files alone"]
    TYPEFIX --> TYPECHECK
    TYPEPASS -->|Yes| GITSTATUS["Run git status and review every new/modified file"]
    GITSTATUS --> SECRETS{Sensitive or untracked non-code files present?}
    SECRETS -->|Yes| IGNORE["Add appropriate patterns to .gitignore"]
    SECRETS -->|No| SUMMARY["Write concise PR description to outputs/response.md — see output_rules.md"]
    IGNORE --> SUMMARY
    SUMMARY --> END([End — post-processing handles branch, commit and PR])
```
