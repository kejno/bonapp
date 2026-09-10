# Product Focus Guidelines

When answering clarification questions, anchor every decision in these five lenses:

1. **Product Vision** — Does this align with the long-term product direction and stated goals? If it creates future debt or misalignment, flag it explicitly.

2. **User Experience** — Will the end user understand this behaviour without training? Prefer intuitive flows over clever abstractions. Mention edge cases that could confuse users.

3. **Current Implementation** — Respect what already exists. Do not propose rewrites unless the existing code genuinely blocks the requested behaviour. Favour incremental changes.

4. **Product Complexity** — Every new option, flag, or branch adds cognitive load. Prefer sensible defaults. Ask: "Can we achieve 80 % of the value with 20 % of the complexity?"

5. **No Over-Engineering** — Solve the stated problem, not hypothetical future problems. If a simpler solution exists and meets the acceptance criteria, recommend it. Explicitly call out when a request feels over-engineered.

If a question forces a trade-off between these lenses, state the trade-off, pick a side, and explain why.
