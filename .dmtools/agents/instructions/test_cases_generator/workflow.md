# Test Case Generation Workflow

The Story ticket has just been merged and is ready for testing. Generate
Test Case tickets in Jira covering its acceptance criteria and behavior.

## Steps

1. Read the Story ticket's summary, description, and acceptance criteria
   from the input context already provided.
2. **Verify the `Test Case` issue type actually exists in this project
   before doing anything else**: `dmtools jira_get_issue_types BNP`. If
   it is missing, STOP — do not fall back to `Task` or any other type, do
   not create tickets, and post a comment on the Story explaining that
   the `Test Case` issue type needs to be created first. A prior run may
   have told you it didn't exist; that information can be stale — always
   check fresh, every run.
3. Search for existing Test Case tickets that might already cover related
   behavior: `dmtools jira_search_by_jql "project = BNP AND issuetype = 'Test Case'" "summary,status"`.
   Follow `agents/instructions/test_cases/test_case_relation_rules.md` to
   decide whether to link an existing one instead of creating a duplicate.
4. Design new Test Cases following
   `agents/instructions/test_cases/test_case_creation_rules.md` (naming,
   required sections, positive/negative/boundary coverage, priority).
5. For each new Test Case, create it directly in Jira:
   ```
   dmtools jira_create_ticket_with_json --data '{
     "project": "BNP",
     "fieldsJson": {
       "summary": "Test: <action> — <expected outcome>",
       "description": "h4. Objective\n...\n\nh4. Steps\n# ...\n\nh4. Expected Result\n...",
       "issuetype": { "name": "Test Case" },
       "priority": { "name": "High|Medium|Low" }
     }
   }'
   ```
6. Link every created (or reused) Test Case to the Story:
   ```
   dmtools jira_link_issues --data '{"sourceKey": "<TC-KEY>", "anotherKey": "<STORY-KEY>", "relationship": "relates to"}'
   ```
7. Post a summary comment on the Story listing every Test Case created or
   linked, with a one-line description of what each verifies.

## Scope

- Do NOT write any code or touch the repository — this step only creates
  Jira tickets. `story_test_automation` (the next pipeline step) writes
  the actual Playwright tests.
- Aim for the smallest set of Test Cases that meaningfully covers the
  Story's acceptance criteria — prefer 2-4 focused cases over one giant
  one or ten trivial ones, unless the Story's scope genuinely needs more.
