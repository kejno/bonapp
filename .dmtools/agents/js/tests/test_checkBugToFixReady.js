const assert = require('assert');
const checkBugToFixReady = require('../checkBugToFixReady.js');

const statuses = { DONE: 'Done', READY_FOR_TESTING: 'Ready For Testing', BACKLOG: 'Backlog' };
const configLoader = require('../configLoader.js');
const originalLoadProjectConfig = configLoader.loadProjectConfig;
configLoader.loadProjectConfig = () => ({ jira: { statuses, issueTypes: { STORY: 'Story' } } });

// links: { entityKey: { bugs: [{ key, status }], testCases: [key, ...] } }
function installJira(links) {
    const calls = { moves: [], removedLabels: [], comments: [] };
    const asIssue = (key, status) => ({ key, fields: { status: { name: status } } });
    global.jira_search_by_jql = ({ jql }) => {
        let m = jql.match(/^issue in linkedIssues\("([^"]+)"\) AND issuetype = Bug AND status != "Done"$/);
        if (m) return ((links[m[1]] || {}).bugs || []).filter((b) => b.status !== 'Done').map((b) => asIssue(b.key, b.status));
        m = jql.match(/^issue in linkedIssues\("([^"]+)"\) AND issuetype = Bug$/);
        if (m) return ((links[m[1]] || {}).bugs || []).map((b) => asIssue(b.key, b.status));
        m = jql.match(/^issue in linkedIssues\("([^"]+)"\) AND issuetype = "Test Case"$/);
        if (m) return ((links[m[1]] || {}).testCases || []).map((key) => asIssue(key, 'Bug To Fix'));
        throw new Error('unexpected JQL: ' + jql);
    };
    global.jira_move_to_status = ({ key, statusName }) => calls.moves.push({ key, statusName });
    global.jira_remove_label = ({ key, label }) => calls.removedLabels.push({ key, label });
    global.jira_post_comment = ({ key }) => calls.comments.push(key);
    return calls;
}

function run(key, issueType) {
    return checkBugToFixReady.action({
        ticket: { key, fields: { issuetype: { name: issueType } } },
        jobParams: { customParams: { removeLabel: 'sm_bug_to_fix_check_triggered' } }
    });
}

try {
    // Story whose only Bug is linked to its Test Case (not to the Story) and is Done: must be released.
    let calls = installJira({
        'BNP-1': { bugs: [], testCases: ['BNP-10', 'BNP-11'] },
        'BNP-10': { bugs: [], testCases: [] },
        'BNP-11': { bugs: [{ key: 'BNP-90', status: 'Done' }], testCases: [] }
    });
    let result = run('BNP-1', 'Story');
    assert.strictEqual(result.action, 'moved_to_ready_for_testing', 'a Bug linked only via a Test Case must not keep the Story stuck');
    assert.strictEqual(result.totalBugs, 1);
    assert.deepStrictEqual(calls.moves, [{ key: 'BNP-1', statusName: 'Ready For Testing' }]);

    // Same shape, but the Test Case Bug is still open: the Story keeps waiting.
    calls = installJira({
        'BNP-1': { bugs: [], testCases: ['BNP-11'] },
        'BNP-11': { bugs: [{ key: 'BNP-90', status: 'In Progress' }], testCases: [] }
    });
    result = run('BNP-1', 'Story');
    assert.strictEqual(result.action, 'waiting_for_tc_bugs');
    assert.strictEqual(calls.moves.length, 0);
    assert(calls.removedLabels.some((c) => c.label === 'sm_bug_to_fix_check_triggered'), 'lock must be released to re-check next cycle');

    // No Bugs anywhere: nothing to release.
    calls = installJira({
        'BNP-1': { bugs: [], testCases: ['BNP-10'] },
        'BNP-10': { bugs: [], testCases: [] }
    });
    result = run('BNP-1', 'Story');
    assert.strictEqual(result.action, 'no_linked_bugs');
    assert.strictEqual(calls.moves.length, 0);

    // A Bug linked both to the Story and to its Test Case is counted once.
    calls = installJira({
        'BNP-1': { bugs: [{ key: 'BNP-90', status: 'Done' }], testCases: ['BNP-11'] },
        'BNP-11': { bugs: [{ key: 'BNP-90', status: 'Done' }], testCases: [] }
    });
    result = run('BNP-1', 'Story');
    assert.strictEqual(result.action, 'moved_to_ready_for_testing');
    assert.strictEqual(result.totalBugs, 1);

    // Direct Bug still open: waiting, as before.
    calls = installJira({
        'BNP-1': { bugs: [{ key: 'BNP-91', status: 'Ready For Development' }], testCases: [] }
    });
    result = run('BNP-1', 'Story');
    assert.strictEqual(result.action, 'waiting');
    assert.strictEqual(calls.moves.length, 0);

    // Test Case behaviour is unchanged: it looks only at its own Bugs and goes back to Backlog.
    calls = installJira({ 'BNP-11': { bugs: [{ key: 'BNP-90', status: 'Done' }], testCases: ['BNP-99'] } });
    result = run('BNP-11', 'Test Case');
    assert.strictEqual(result.action, 'moved_to_backlog');
    assert.deepStrictEqual(calls.moves, [{ key: 'BNP-11', statusName: 'Backlog' }]);

    calls = installJira({ 'BNP-11': { bugs: [], testCases: [] } });
    result = run('BNP-11', 'Test Case');
    assert.strictEqual(result.action, 'no_linked_bugs');
} finally {
    configLoader.loadProjectConfig = originalLoadProjectConfig;
    delete global.jira_search_by_jql;
    delete global.jira_move_to_status;
    delete global.jira_remove_label;
    delete global.jira_post_comment;
}

console.log('checkBugToFixReady tests passed');
