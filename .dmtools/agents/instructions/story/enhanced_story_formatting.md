# Enhanced Story Template Guidelines

The block below is a **structural template / example only**. The tags such as `<bold>`, `<bullet>`, and `<heading2>` are placeholders that show the required shape of the document.

**CRITICAL: Never write the final `outputs/response.md` using these literal metatags.** Use the tracker-specific transformation table (for example `agents/instructions/tracker/jira_markup_transform.md` when the tracker is Jira) to convert every placeholder into the correct tracker markup.

```mermaid
flowchart TD
    subgraph SECTIONS["Required Sections (in order)"]
        S1["<bold>Story Points:</bold> [1-13]"]
        S2["<bold>Business Context:</bold><br/>Why needed, problem solved, value provided"]
        S3["<bold>User Story:</bold><br/>As a [type] I want [action] So that [value]"]
        S4["<bold>Acceptance Criteria:</bold><br/>AC 1 - [Category]<br/><bullet> [testable req 1]<br/><bullet> [testable req 2]"]
        S5["<bold>Business Rules:</bold><br/><bullet> [constraints, policies, validations]"]
        S6["<bold>Out of Scope:</bold><br/><bullet> [explicitly not included]<br/><bullet> [future enhancements]"]
    end

    subgraph RULES["Formatting Rules"]
        R1["Replace all [placeholders] with concrete content"]
        R2["Never omit a top-level section — use 'Not identified' if empty"]
        R3["AC numbering: AC 1, AC 2, AC 3 (NOT AC-1 — Jira Smart Link conflict)"]
        R4["Plain bullets under each AC category"]
        R5["No intro, conclusion, ticket key heading, or 'Acceptance Criteria for...' prefix"]
    end

    SECTIONS --> RULES
```

## Rules

- The template above is a structural example. Replace every `<bold>`, `<italic>`, `<strike>`, `<underline>`, `<code>`, `<codeblock>`, `<bullet>`, `<numbered>`, `<heading1>`, `<heading2>`, `<heading3>`, `<link>`, `<image>`, `<quote>`, `<panel>`, `<color>`, and `<hr>` placeholder with the equivalent markup defined in the tracker-specific transformation table.
- Do NOT leave literal XML-style tags such as `<bold>` or `<code>` in the final `outputs/response.md`.
- Do NOT use Markdown syntax in Jira output: no `**bold**`, no `- item` bullets, no `# headings`, no triple backticks.
- Use the tracker-specific link format when referencing tickets or URLs.

**IMPORTANT**: Read `input/existing_questions.json` for answered questions as context. Use `dmtools` CLI commands for full ticket details.

**IMPORTANT**: Check child tickets and parent story for better context using the appropriate `dmtools` search command.
