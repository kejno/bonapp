const assert = require('assert');
const scmModule = require('../common/scm.js');
const recover = require('../recoverMergedPRTicket.js');

const originalCreateScm = scmModule.createScm;
let scmCreated = false;
let statusMoved = false;

try {
    scmModule.createScm = () => {
        scmCreated = true;
        return { listPrs: () => [] };
    };
    global.jira_move_to_status = () => { statusMoved = true; };

    const result = recover.action({
        ticket: {
            key: 'BNP-333',
            fields: { labels: ['test_pr_finalized'] }
        }
    });

    assert.deepStrictEqual(result, {
        success: true,
        action: 'test_pr_already_finalized'
    });
    assert.strictEqual(scmCreated, false, 'finalized ticket must not query GitHub PRs');
    assert.strictEqual(statusMoved, false, 'finalized ticket must not move back to Merged');
} finally {
    scmModule.createScm = originalCreateScm;
    delete global.jira_move_to_status;
}

console.log('Finalized test PR merged-recovery guard test passed');
