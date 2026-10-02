const assert = require('assert');
const configLoader = require('../configLoader.js');
const check = require('../checkBugTestsPassed.js');

const originalLoad = configLoader.loadProjectConfig;

const config = {
    jira: {
        issueTypes: { TEST_CASE: 'Test Case', BUG: 'Bug' },
        statuses: {
            PASSED: 'Passed', SKIPPED: 'Skipped', IRRELEVANT: 'Irrelevant',
            BUG_TO_FIX: 'Bug To Fix', FAILED: 'Failed', DONE: 'Done',
            IN_REWORK: 'In Rework', BLOCKED: 'Blocked',
            IN_REVIEW_PASSED: 'In Review - Passed', IN_REVIEW_FAILED: 'In Review - Failed',
            IN_DEVELOPMENT: 'In Development', READY_FOR_DEVELOPMENT: 'Ready For Development'
        }
    }
};

function runCase(tcStatus) {
    const calls = { moves: [], addedLabels: [] };
    configLoader.loadProjectConfig = () => config;
    global.jira_get_ticket = () => ({ fields: {
        labels: ['test_pr_finalized'],
        issuelinks: [{ outwardIssue: { key: 'BNP-550', fields: {
            issuetype: { name: 'Test Case' }, status: { name: tcStatus } } } }]
    } });
    global.jira_search_by_jql = () => [];
    global.jira_move_to_status = value => calls.moves.push(value.statusName);
    global.jira_add_label = value => calls.addedLabels.push(value.label);
    global.jira_remove_label = () => {};
    global.jira_post_comment = () => {};

    const result = check.action({ ticket: { key: 'BNP-555' },
        jobParams: { customParams: { removeLabel: 'sm_bug_done_check_triggered' } } });
    return { result, calls };
}

try {
    // BNP-555: a TC shared with a Story is briefly In Review - Passed while the
    // Story's QA cycle re-runs it. A finalized Bug must wait, not go to rework.
    ['In Review - Passed', 'In Review - Failed', 'In Development'].forEach(status => {
        const { result, calls } = runCase(status);
        assert.strictEqual(result.action, 'waiting_in_flight', status + ' must be treated as in-flight');
        assert.deepStrictEqual(calls.moves, [], status + ' must not move the Bug');
        assert.deepStrictEqual(calls.addedLabels, [], status + ' must not consume the rework attempt');
    });

    // A genuinely failing TC on a finalized Bug still routes to rework.
    const failed = runCase('Failed');
    assert.strictEqual(failed.result.action, 'moved_to_rework');
    assert.deepStrictEqual(failed.calls.moves, ['In Rework']);
} finally {
    configLoader.loadProjectConfig = originalLoad;
    delete global.jira_get_ticket;
    delete global.jira_search_by_jql;
    delete global.jira_move_to_status;
    delete global.jira_add_label;
    delete global.jira_remove_label;
    delete global.jira_post_comment;
}

console.log('Bug done-check in-flight Test Case tests passed');
