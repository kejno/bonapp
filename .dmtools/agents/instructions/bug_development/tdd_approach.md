```mermaid
flowchart TD
    subgraph TDD["TDD for Bug Fixes — RED-GREEN-REFACTOR"]
        T0["Start with a clear understanding of the bug from RCA"]
        T1["RED: Use the linked Test Case's spec (apps/api/test/&lt;TC_KEY&gt;.e2e-spec.ts, or a co-located apps/api/src/**/*.spec.ts for backend; apps/guest-web or apps/admin-web src/**/*.{spec,test}.ts(x) for frontend) as the reproduction, or write one<br/>— must describe the exact failure scenario<br/>— run npm run test:e2e -w apps/api (or npm run test -w apps/api / -w apps/guest-web / -w apps/admin-web) to confirm it FAILS"]
        T2["GREEN: Write minimum fix to make the reproduction test PASS<br/>— simplest possible change<br/>— do not refactor unrelated code"]
        T3["REFACTOR: Clean up while keeping tests GREEN<br/>— improve naming, remove duplication<br/>— run full suite after every change"]
        T4{"More edge cases to cover?"}
        T5["Repeat RED-GREEN-REFACTOR for next edge case"]
        T0 --> T1 --> T2 --> T3 --> T4
        T4 -->|Yes| T5 --> T1
        T4 -->|No| DONE([Bug fixed with regression tests])
    end

    subgraph RULES["Bug TDD Rules"]
        R1["❌ NEVER fix code without a failing reproduction test first"]
        R2["❌ NEVER write more code than needed to fix the bug"]
        R3["✅ Returned bugs: your fix must differ from the previous attempt"]
        R4["✅ If the bug involves a loop/collection, add a reproduction case with 2+ items, not only a single-item scenario — a single-item test can pass while multi-item logic is still broken"]
        R5["✅ Run the FULL test suite before finishing — no regressions allowed"]
    end

    TDD --> RULES
```

## Choosing what to fake — dependency categories

When the reproduction test needs a double for something the buggy code
depends on, pick it by what that dependency actually is — don't default to
mocking everything:

| Dependency kind | Example in bonapp | What to use in the reproduction test |
|---|---|---|
| **In-process** — pure computation, in-memory state | pricing math, cart totals, DTO mapping | No double needed — call the real function |
| **Local-substitutable** — has a real local stand-in | Postgres via `PrismaService` | Run against the real local Postgres in the test setup — not a mock of `PrismaService` |
| **Remote but owned** — our own service across a network boundary | internal WebSocket/BullMQ jobs between `apps/api` modules | Test through an in-memory adapter of the same port the production code depends on |
| **True external** — third party we don't control | Оплати, ЕРИП/bePaid, СКНО fiscal gateway, iiko/r_keeper | A mock/stub of that gateway's client is correct here |

Mocking a **true external** dependency is fine. Mocking your own internal
collaborator instead (e.g. mocking `PaymentService` instead of calling the
real one and only faking the external gateway client it wraps) hides the bug
behind the mock — the reproduction test can pass while the actual bug is
still there.
