const assert = require('assert');
const development = require('../developTicketAndCreatePR.js');

const config = {
    formats: {
        prTitle: {
            development: '{ticketKey} {ticketSummary}',
            bugDevelopment: '[BUGFIX] {ticketKey} {ticketSummary}'
        }
    },
    jira: {
        issueTypes: { BUG: 'Bug' }
    }
};

assert.strictEqual(
    development.resolvePrTitleTemplate(config, { prTitleTemplate: 'bugDevelopment' }, {
        fields: {}
    }),
    '[BUGFIX] {ticketKey} {ticketSummary}',
    'explicit bug title must work even when the runtime ticket omits issuetype'
);

assert.strictEqual(
    development.resolvePrTitleTemplate(config, {}, {
        fields: { issuetype: { name: 'Bug' } }
    }),
    '[BUGFIX] {ticketKey} {ticketSummary}',
    'Bug issuetype must select the bug title template'
);

assert.strictEqual(
    development.resolvePrTitleTemplate(config, {}, {
        fields: { issuetype: { name: 'Story' } }
    }),
    '{ticketKey} {ticketSummary}',
    'non-Bug tickets must retain the development title template'
);

console.log('Development PR title resolution checks passed');
