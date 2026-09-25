```mermaid
flowchart TD
    subgraph TDD["TDD — Test-Driven Development Workflow"]
        T0["Start with a clear understanding of the requirement"]
        T1["RED: Write a failing unit test FIRST<br/>— before any production code<br/>— test must describe the expected behavior<br/>— run it to confirm it FAILS"]
        T2["GREEN: Write minimum production code to make the test PASS<br/>— no over-engineering<br/>— simplest possible implementation"]
        T3["REFACTOR: Clean up code while keeping tests GREEN<br/>— improve naming, remove duplication<br/>— apply OOP principles<br/>— run tests after every change"]
        T4{"More requirements to implement?"}
        T5["Repeat RED-GREEN-REFACTOR for next behavior"]
        T0 --> T1 --> T2 --> T3 --> T4
        T4 -->|Yes| T5 --> T1
        T4 -->|No| DONE([All behaviors implemented with tests])
    end

    subgraph RULES["TDD Rules"]
        R1["❌ NEVER write production code without a failing test first"]
        R2["❌ NEVER write more production code than needed to pass the test"]
        R3["✅ Tests must be fast, isolated, and deterministic"]
        R4["✅ Aim for 100% unit test coverage on new and modified code"]
        R5["✅ When behavior involves a loop/collection, add a case with 2+ items, not only a single-item happy path — a single-item test can pass while multi-item logic is still wrong"]
        R6["✅ Run the full test suite before finishing — no regressions allowed"]
        R7["✅ Run lint on the exact files you added/modified before finishing — zero errors there; don't touch pre-existing violations elsewhere"]
        R8["✅ Run typecheck before finishing — fix only errors in files you added/modified; pre-existing errors elsewhere are not yours to fix"]
    end

    TDD --> RULES
```

## Where to write TDD tests

Write failing unit / widget tests in the project's standard unit-test tree **only**:

- Flutter / Dart projects → `test/`
- Node projects → `__tests__/` or `test/` according to the repo convention
- Python projects → `tests/` or project-specific unit-test directory

❌ **Never** place development TDD tests under `testing/`.
`testing/` is owned by test-automation agents (regression probes, workflow
observation tests, accessibility gates, etc.). If your production changes break
existing tests there, leave them untouched and mention the breakage in
`outputs/response.md` so the test-automation agent can update them.

## Choosing what to fake — dependency categories

When a new/modified unit under TDD depends on something outside itself,
pick the test double by what that dependency actually is — don't default to
mocking everything:

| Dependency kind | Example in bonapp | What to use in the test |
|---|---|---|
| **In-process** — pure computation, in-memory state | pricing math, cart totals, DTO mapping | No double needed — call the real function |
| **Local-substitutable** — has a real local stand-in | Postgres via `PrismaService` | Run against the real local Postgres in the test setup — not a mock of `PrismaService` |
| **Remote but owned** — our own service across a network boundary | internal WebSocket/BullMQ jobs between `apps/api` modules | Test through an in-memory adapter of the same port the production code depends on |
| **True external** — third party we don't control | Оплати, ЕРИП/bePaid, СКНО fiscal gateway, iiko/r_keeper | A mock/stub of that gateway's client is correct here |

Mocking a **true external** dependency is fine. Mocking your own internal
collaborator (e.g. mocking `PaymentService` instead of calling the real one
and only faking the external gateway client it wraps) is not — that produces
an implementation-coupled test that can pass while the real behavior is
broken.
