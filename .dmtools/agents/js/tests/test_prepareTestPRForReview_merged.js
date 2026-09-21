const assert = require('assert');
const configLoader = require('../configLoader.js');
const storyTestMerge = require('../mergeStoryTestAutomationPR.js');
const prepare = require('../prepareTestPRForReview.js');

const originalLoad = configLoader.loadProjectConfig;
const originalCreate = configLoader.createScm;
const originalMerge = storyTestMerge.attemptMerge;
const originalCreatePullRequest = require('../common/pullRequest.js').createPullRequest;
const prHelper = require('../common/pullRequest.js');

const config = {
    formats: { prTitle: { testAutomation: '[QA] {ticketKey} {ticketSummary}' } },
    git: { baseBranch: 'main' },
    jira: {
        issueTypes: { STORY: 'Story', BUG: 'Bug', TEST_CASE: 'Test Case' },
        statuses: { IN_TESTING: 'In Testing' }
    }
};
const mergedPr = { number: 63, html_url: 'https://github.com/kejno/bonapp/pull/63',
    head: { ref: 'test/BNP-284' }, merged_at: '2026-09-20T21:00:00Z' };

function runCase(alreadyFinalized) {
    const calls = { merge: 0, moves: [], removed: [], files: [] };
    configLoader.loadProjectConfig = () => config;
    configLoader.createScm = () => ({
        getRemoteRepoInfo: () => ({ owner: 'kejno', repo: 'bonapp' }),
        listPrs: state => state === 'closed' ? [mergedPr] : []
    });
    storyTestMerge.attemptMerge = () => { calls.merge++; return { success: true, alreadyMerged: true }; };
    global.jira_get_ticket = () => ({ fields: { labels: alreadyFinalized ? ['test_pr_finalized'] : [],
        status: { name: 'In Testing' }, issuetype: { name: 'Story' } } });
    global.jira_move_to_status = value => calls.moves.push(value);
    global.jira_remove_label = value => calls.removed.push(value);
    global.file_write = value => calls.files.push(value);
    global.cli_execute_command = () => '';

    const result = prepare.action({ ticket: { key: 'BNP-284', fields: { issuetype: { name: 'Story' } } },
        jobParams: { customParams: { removeLabel: 'sm_story_test_review_triggered' } } });
    assert.strictEqual(result, false, 'merged PR must skip the reviewer');
    assert.strictEqual(calls.merge, 1, 'merged PR must reconcile all linked Test Cases');
    assert(calls.removed.some(x => x.label === 'sm_story_test_review_triggered'));
    assert(calls.files.some(x => x.path === 'outputs/agent_cli_intentionally_skipped.json'));
    if (!alreadyFinalized) {
        assert(calls.moves.some(x => x.statusName === 'In Testing'));
    }
}

function runNoCommitsCase() {
    const calls = { commands: [], files: [], moves: [] };
    configLoader.loadProjectConfig = () => config;
    configLoader.createScm = () => ({
        getRemoteRepoInfo: () => ({ owner: 'kejno', repo: 'bonapp' }),
        listPrs: () => []
    });
    prHelper.createPullRequest = () => {
        throw new Error('GraphQL: No commits between main and test/BNP-333');
    };
    global.jira_get_ticket = () => ({ fields: { labels: [], summary: 'Already merged tests',
        status: { name: 'In Review - Passed' }, issuetype: { name: 'Bug' } } });
    global.jira_add_label = () => {};
    global.jira_move_to_status = value => calls.moves.push(value);
    global.jira_post_comment = () => {};
    global.file_write = value => calls.files.push(value);
    global.cli_execute_command = value => {
        calls.commands.push(value.command);
        return value.command.indexOf('git ls-remote') === 0
            ? 'abc refs/heads/test/BNP-333\n'
            : '';
    };

    const result = prepare.action({ ticket: { key: 'BNP-333', fields: { issuetype: { name: 'Bug' } } } });
    assert.strictEqual(result, false, 'branch already merged must skip the reviewer');
    assert(calls.moves.some(x => x.statusName === 'In Testing'));
    assert(calls.files.some(x => x.path === 'outputs/agent_cli_intentionally_skipped.json'),
        'branch already merged must mark the CLI skip as intentional');
    assert(calls.commands.some(x => x.indexOf('bash -c "rm -f outputs/pr_review.json') === 0),
        'stale output cleanup must use the whitelisted bash command');
}

try {
    runCase(false);
    runCase(true);
    runNoCommitsCase();
} finally {
    configLoader.loadProjectConfig = originalLoad;
    configLoader.createScm = originalCreate;
    storyTestMerge.attemptMerge = originalMerge;
    prHelper.createPullRequest = originalCreatePullRequest;
    delete global.jira_get_ticket;
    delete global.jira_move_to_status;
    delete global.jira_remove_label;
    delete global.jira_add_label;
    delete global.jira_post_comment;
    delete global.file_write;
    delete global.cli_execute_command;
}

console.log('Merged test PR review preparation tests passed');
