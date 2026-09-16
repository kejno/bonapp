/**
 * Move To Ready For Testing Action (postJSAction for test_cases_generator)
 * Moves the ticket to "Ready For Testing" status after test cases are generated.
 */

const configLoader = require('./configLoader.js');
const agentFailure = require('./common/agentFailure.js');

function action(params) {
    try {
        const ticketKey = params.ticket ? params.ticket.key : null;
        if (!ticketKey) {
            return { success: false, error: 'No ticket key found in params' };
        }

        // Nothing here inspects what the generator produced, so without this
        // guard a CLI that died on a usage limit still moves the ticket on to
        // testing. See common/agentFailure.js.
        const aborted = agentFailure.abortIfAgentFailed(ticketKey, 'test_cases_generator');
        if (aborted) {
            return aborted;
        }

        const projectConfig = configLoader.loadProjectConfig(params.jobParams || params);
        const jiraConfig = projectConfig.jira;

        console.log('Moving ' + ticketKey + ' to ' + jiraConfig.statuses.READY_FOR_TESTING);

        jira_move_to_status({
            key: ticketKey,
            statusName: jiraConfig.statuses.READY_FOR_TESTING
        });

        console.log('✅ ' + ticketKey + ' moved to ' + jiraConfig.statuses.READY_FOR_TESTING);

        return {
            success: true,
            message: ticketKey + ' moved to ' + jiraConfig.statuses.READY_FOR_TESTING
        };

    } catch (error) {
        console.error('❌ Error in moveToReadyForTesting:', error);
        return { success: false, error: error.toString() };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action };
}
