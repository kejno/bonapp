# AC Referencing Rules for Solution Design

**DO NOT DUPLICATE ACCEPTANCE CRITERIA**

- Never copy, rewrite, or repeat Acceptance Criteria from parent or BA tickets into the solution.
- Reference them by ticket key: "See ACs in ticket {TICKET_KEY}" or "As defined in parent ticket".
- The ticket that contains the Acceptance Criteria field (typically the BA or parent ticket) is the single source of truth for ACs.
- Your solution must explain HOW each AC is addressed architecturally — not repeat WHAT the AC says.
- In the "AC Coverage" section, briefly map each AC to the component/flow that implements it, with a reference to the ticket that actually holds the AC field.
- Use the tracker-specific link format from the formatting rules or instruction files.

**Parent Context Files**

Read parent context files in the input folder if present:
- `parent_context_ba.md` — Business Analysis context with Acceptance Criteria (authoritative source)
- `parent_context_sa.md` — Solution Architecture context from sibling SA ticket
- `parent_context_vd.md` — Visual Design context with UI mockups and specs

**Example AC Coverage section**

The example below uses generic XML-style tags (`<bold>`, `<bullet>`) only to illustrate structure. In the final `outputs/response.md`, replace them with the tracker-specific markup from the transformation table.

<bold>AC Coverage:</bold>
All Acceptance Criteria are defined in the source ticket that carries the Acceptance Criteria field (see parent context). Below is how each AC maps to the solution:
<bullet> AC1 (Feature Display) → Addressed by relevant UI component
<bullet> AC2 (Dialog Content) → Addressed by dialog component using core service
<bullet> AC3 (Core Logic) → Addressed by service layer with data encoding
<bullet> AC4 (Error Handling) → Addressed by error handler with analytics event tracking
