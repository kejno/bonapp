const assert = require('assert');
const unblock = require('../unblockResolvedDependencies.js');

const statuses = { BACKLOG: 'Backlog', IN_PROGRESS: 'In Progress', IN_TESTING: 'In Testing' };
const originalLoadProjectConfig = require('../configLoader.js').loadProjectConfig;
require('../configLoader.js').loadProjectConfig = () => ({ jira: { statuses } });

try {
    const moves = [];
    const reads = [];
    global.jira_get_ticket = ({ key, fields }) => {
        reads.push(fields);
        return { fields: {
            issuetype: { name: 'Story' },
            labels: key === 'BNP-123' ? ['ai_test_automation'] : [],
            issuelinks: []
        } };
    };
    global.jira_move_to_status = ({ key, statusName }) => moves.push({ key, statusName });
    global.jira_post_comment = () => {};

    const manualStoryBlock = unblock.action({ ticket: { key: 'BNP-123' } });
    assert.strictEqual(manualStoryBlock.success, true);
    assert.strictEqual(manualStoryBlock.action, 'manual_block_no_dependencies');
    assert.strictEqual(moves.length, 0, 'a manual block without dependency links must remain Blocked');
    assert(reads[0].includes('labels'), 'unblocker must fetch labels to recover the workflow stage');

    const manualGenericBlock = unblock.action({ ticket: { key: 'BNP-456' } });
    assert.strictEqual(manualGenericBlock.action, 'manual_block_no_dependencies');
    assert.strictEqual(moves.length, 0);
} finally {
    require('../configLoader.js').loadProjectConfig = originalLoadProjectConfig;
    delete global.jira_get_ticket;
    delete global.jira_move_to_status;
    delete global.jira_post_comment;
}

console.log('Unblock resolved dependencies tests passed');
