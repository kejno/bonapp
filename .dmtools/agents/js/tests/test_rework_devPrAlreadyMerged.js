const assert = require('assert');
const configLoader = require('../configLoader.js');
const gh = require('../common/githubHelpers.js');
const restoreFromReleases = require('../restoreFromReleases.js');
const setup = require('../preCliReworkSetup.js');
const push = require('../pushReworkChanges.js');

const originals = {
    load: configLoader.loadProjectConfig,
    createScm: configLoader.createScm,
    findPR: gh.findPRForTicket,
    findMerged: gh.findMergedPRForTicket,
    restore: restoreFromReleases.action
};

const config = {
    git: { baseBranch: 'main' },
    repository: { owner: 'kejno', repo: 'bonapp' },
    jira: { statuses: { IN_TESTING: 'In Testing', IN_REWORK: 'In Rework' } }
};

function runSetup(labels) {
    const calls = { moves: [], comments: [], files: [] };
    configLoader.loadProjectConfig = () => config;
    configLoader.createScm = () => ({});
    restoreFromReleases.action = () => {};
    gh.findPRForTicket = () => null;
    gh.findMergedPRForTicket = () => ({ number: 255, html_url: 'https://github.com/kejno/bonapp/pull/255' });
    global.jira_get_ticket = () => ({ fields: { labels: labels } });
    global.jira_move_to_status = value => calls.moves.push(value.statusName);
    global.jira_post_comment = value => calls.comments.push(value.comment);
    global.jira_remove_label = () => {};
    global.file_write = value => calls.files.push(value.path);

    const result = setup.action({ inputFolderPath: 'input/BNP-555' });
    assert.strictEqual(result.action, 'dev_pr_already_merged');
    assert(calls.files.includes('outputs/agent_cli_intentionally_skipped.json'));
    return calls;
}

try {
    // BNP-555: recover_merged_pr ignores finalized tickets, so pr_rework must
    // hand the Bug back to In Testing itself or it loops in In Rework forever.
    const finalized = runSetup(['test_pr_finalized']);
    assert.deepStrictEqual(finalized.moves, ['In Testing']);
    assert(finalized.comments[0].indexOf('In Testing') !== -1);

    // Without a finalized test PR, recover_merged_pr owns the ticket — leave it.
    const notFinalized = runSetup([]);
    assert.deepStrictEqual(notFinalized.moves, []);

    // Push step must honour the pre-action's intentional skip instead of
    // failing on the missing pr_info.md.
    const pushCalls = { comments: [], commands: [] };
    global.file_read = value => value.path === 'outputs/agent_cli_intentionally_skipped.json'
        ? JSON.stringify({ reason: 'dev_pr_already_merged' })
        : null;
    global.jira_post_comment = value => pushCalls.comments.push(value.comment);
    global.cli_execute_command = value => { pushCalls.commands.push(value.command); return ''; };
    const pushResult = push.action({ ticket: { key: 'BNP-555' }, response: '' });
    assert.strictEqual(pushResult.success, true);
    assert.strictEqual(pushResult.path, 'cli-intentionally-skipped');
    assert.deepStrictEqual(pushCalls.comments, [], 'skip must not post Rework Push Failed');
    assert.deepStrictEqual(pushCalls.commands, [], 'skip must not touch git');
} finally {
    configLoader.loadProjectConfig = originals.load;
    configLoader.createScm = originals.createScm;
    gh.findPRForTicket = originals.findPR;
    gh.findMergedPRForTicket = originals.findMerged;
    restoreFromReleases.action = originals.restore;
    delete global.jira_get_ticket;
    delete global.jira_move_to_status;
    delete global.jira_post_comment;
    delete global.jira_remove_label;
    delete global.file_write;
    delete global.file_read;
    delete global.cli_execute_command;
}

console.log('Rework with already-merged dev PR tests passed');
