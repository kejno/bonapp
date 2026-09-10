# Enhanced Story Content Guidelines

Keep wording specific and useful; avoid generic filler.

```mermaid
flowchart TD
    subgraph NO["❌ No water words"]
        N1["Avoid: user-friendly, seamless, robust, intuitive, enhanced, improved"]
        N2["Use concrete: business facts, user actions, system behavior, data rules"]
        N3["Do not restate ticket title to fill space"]
    end

    subgraph SP["Story Points"]
        S1["1-3 SP: simple, single component"]
        S2["5-8 SP: medium, multiple components"]
        S3["8-13 SP: complex, cross-system"]
        S4[">13 SP: split into multiple stories"]
    end

    subgraph AC["Acceptance Criteria"]
        A1["Critical and testable"]
        A2["Group related under AC categories"]
        A3["Bullets, NO checkboxes [ ]"]
        A4["Present tense: 'The system does...'"]
        A5["Each AC independently testable"]
        A6["Link to child tickets: (see DMC-123)"]
        A7["Treat existing_questions.json answers as binding"]
    end

    NO --> SP --> AC
```

## Examples

- **Business Context**: "Users need secure authentication to protect sensitive data."
- **Out of Scope**: "Advanced features planned for future releases."
