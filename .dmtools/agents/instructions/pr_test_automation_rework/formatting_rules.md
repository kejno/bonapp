```mermaid
flowchart TD
    F1["outputs/response.md must be a markdown document"]
    F2["Required sections: ## Issues/Notes (if any), ## Approach, ## Files Modified, ## Test Coverage"]
    F3["outputs/pr_body.md — GitHub Markdown for SCM-facing summary"]
    F4["outputs/test_automation_result.json — structured test result"]
    F5["Be surgical but thorough — fix exact issues flagged, then check same pattern across codebase"]
    F6["Do NOT refactor unrelated code or add unrequested features"]
```
