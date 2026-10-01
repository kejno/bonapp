const assert = require('assert');
const { fieldToText, readFieldText } = require('../common/fieldText.js');
const configLoader = require('../configLoader.js');

const ADF_FAILED_REASON = {
    type: 'doc',
    version: 1,
    content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Failure Summary' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'GET /api/v1/superadmin/tenants вернул 404 вместо 200.' }] }
    ]
};
const EXPECTED_TEXT = 'Failure Summary\nGET /api/v1/superadmin/tenants вернул 404 вместо 200.';

// --- fieldToText / readFieldText -------------------------------------------------------------
assert.strictEqual(fieldToText(ADF_FAILED_REASON), EXPECTED_TEXT, 'ADF paragraph field must become plain text');
assert.strictEqual(fieldToText('  plain  '), 'plain');
assert.strictEqual(fieldToText({ value: 'select value' }), 'select value');
assert.strictEqual(fieldToText(null), '');
assert.strictEqual(fieldToText({ type: 'doc', version: 1, content: [] }), '');
assert.strictEqual(fieldToText(42), '');

assert.strictEqual(
    fieldToText({ type: 'doc', content: [
        { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }, { type: 'hardBreak' }, { type: 'text', text: 'cont' }] }] }
        ] },
        { type: 'orderedList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }
        ] }
    ] }),
    '- one\n- two\n  cont\n1. first'
);

assert.strictEqual(readFieldText({ customfield_10177: ADF_FAILED_REASON }, 'customfield_10177', 'Failed Reason'), EXPECTED_TEXT, 'by id');
assert.strictEqual(readFieldText({ 'Failed Reason': 'by name' }, 'customfield_10177', 'Failed Reason'), 'by name', 'falls back to the name');
assert.strictEqual(readFieldText({ 'Failed Reason (customfield_10177)': 'decorated key' }, 'customfield_10177', 'Failed Reason'), 'decorated key', 'dmtools decorated key');
assert.strictEqual(readFieldText({ summary: 'x' }, 'customfield_10177', 'Failed Reason'), '', 'missing field is empty');
assert.strictEqual(readFieldText(undefined, 'customfield_10177', 'Failed Reason'), '');

// --- project config exposes the Failed Reason field id -----------------------------------------
assert.strictEqual(require('../../../config.js').jira.fields.failedReasonId, 'customfield_10177');
(function checkMergedConfig() {
    // In the runtime file_read() reads .dmtools/config.js; reproduce that with the real file.
    const fs = require('fs');
    global.file_read = ({ path }) => fs.readFileSync(path, 'utf8');
    try {
        const merged = configLoader.loadProjectConfig({ configPath: '.dmtools/config.js' });
        assert.strictEqual(merged.jira.fields.failedReasonId, 'customfield_10177', 'merged config must carry the id');
        assert.strictEqual(merged.jira.fields.acceptanceCriteria, 'Acceptance Criteria', 'default field names must survive the merge');
    } finally {
        delete global.file_read;
    }
})();

// --- prepareBulkBugsCreationContext ---------------------------------------------------------------
const prepare = require('../prepareBulkBugsCreationContext.js');
assert.strictEqual(prepare.extractFailedReason({ customfield_10177: ADF_FAILED_REASON }, 'Failed Reason', 'customfield_10177'), EXPECTED_TEXT);
assert.strictEqual(prepare.getFailedReasonFieldId({ jira: { fields: { failedReasonId: 'customfield_1' } } }, { failedReasonFieldId: 'customfield_2' }, 'Failed Reason'), 'customfield_2', 'customParams wins');
assert.strictEqual(prepare.getFailedReasonFieldId({ jira: { fields: { failedReasonId: 'customfield_1' } } }, {}, 'Failed Reason'), 'customfield_1');
assert.strictEqual(prepare.getFailedReasonFieldId({ jira: { fields: {} } }, {}, 'customfield_9'), 'customfield_9', 'a field name that is already an id');
assert.strictEqual(prepare.getFailedReasonFieldId({ jira: { fields: {} } }, {}, 'Failed Reason'), '');

(function checkPrepareAction() {
    const written = {};
    const searches = [];
    const original = configLoader.loadProjectConfig;
    configLoader.loadProjectConfig = () => ({ jira: { fields: { failedReasonId: 'customfield_10177' } } });
    global.file_write = (a, b) => { if (typeof a === 'object') written[a.path] = a.content; else written[a] = b; };
    global.jira_search_by_jql = ({ jql, fields }) => {
        searches.push({ jql, fields });
        if (jql.indexOf('status = Failed') !== -1) {
            return [{ key: 'BNP-549', fields: { summary: 'Test: roles', status: { name: 'Failed' }, attachment: [], customfield_10177: ADF_FAILED_REASON } }];
        }
        return [];
    };
    try {
        prepare.action({ inputFolderPath: 'input/BNP-549', customParams: {}, jira: { project: 'BNP' } });
        const tcSearch = searches.find((s) => s.jql.indexOf('status = Failed') !== -1);
        assert(tcSearch.fields.indexOf('customfield_10177') !== -1, 'the failed-TC search must request the Failed Reason field by id');
        const tcs = JSON.parse(written['input/BNP-549/failed_tcs.json']);
        assert.strictEqual(tcs[0].failedReason, EXPECTED_TEXT, 'the agent context must carry the failure text');
    } finally {
        configLoader.loadProjectConfig = original;
        delete global.file_write;
        delete global.jira_search_by_jql;
    }
})();

// --- postBulkBugsCreation fallback ---------------------------------------------------------------
const postBulk = require('../postBulkBugsCreation.js');
global.jira_get_ticket = () => ({ fields: { customfield_10177: ADF_FAILED_REASON } });
assert.strictEqual(postBulk.getFailedReasonForTc('BNP-549', 'Failed Reason', 'customfield_10177'), EXPECTED_TEXT);
global.jira_get_ticket = () => { throw new Error('boom'); };
assert.strictEqual(postBulk.getFailedReasonForTc('BNP-549', 'Failed Reason', 'customfield_10177'), '', 'a Jira error must not break bug creation');
delete global.jira_get_ticket;

// --- postStoryTestAutomationResults: attaching the failed-description report ---------------------------------
const postStory = require('../postStoryTestAutomationResults.js');
(function checkAttach() {
    const repoRoot = '/repo';
    const reportName = 'failed_description_BNP-549.md';
    const writes = [];
    const attaches = [];
    global.file_read = () => null; // .dmtools/-relative lookups find nothing: the agent wrote under the repo root
    global.cli_execute_command = ({ command }) => command === 'cat ' + repoRoot + '/outputs/' + reportName
        ? '# Failure\n404 on GET /superadmin/tenants'
        : 'cat: No such file or directory';
    global.file_write = (args) => writes.push(args);
    global.jira_attach_file_to_ticket = (args) => attaches.push(args);
    try {
        const name = postStory.attachFailedDescription('BNP-549', 'outputs/' + reportName, repoRoot);
        assert.strictEqual(name, reportName);
        assert.deepStrictEqual(writes, [{ path: 'outputs/' + reportName, content: '# Failure\n404 on GET /superadmin/tenants' }], 'the report must be staged under .dmtools/outputs');
        assert.strictEqual(attaches.length, 1);
        assert.strictEqual(attaches[0].filePath, 'outputs/' + reportName, 'attach from the staged copy, not the repo-root path');
        assert.strictEqual(attaches[0].ticketKey, 'BNP-549');

        attaches.length = 0; writes.length = 0;
        const missing = postStory.attachFailedDescription('BNP-550', 'outputs/failed_description_BNP-550.md', repoRoot);
        assert.strictEqual(missing, null, 'a report that does not exist is skipped, not attached');
        assert.strictEqual(attaches.length, 0);
    } finally {
        delete global.file_read;
        delete global.cli_execute_command;
        delete global.file_write;
        delete global.jira_attach_file_to_ticket;
    }
})();

console.log('failedReason tests passed');
