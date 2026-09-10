/**
 * Finish Test Cases Generation (postJSAction for test_cases_generator)
 *
 * After TestCasesGenerator has created the linked Test Case tickets:
 * 1. Make sure the ticket is in Ready For Testing so *_test_automation can pick it up.
 * 2. Remove the sm_test_cases_triggered / sm_bug_test_cases_triggered guard label so
 *    the next SM cycle can run story_test_automation / bug_test_automation — this
 *    config is shared between the Story and Bug generator rules, and each rule's
 *    automation counterpart is gated on its own type-specific label (see sm.json).
 *
 * For Bugs specifically, the generator's own JQL re-matches "Ready For Testing" every
 * cycle (unlike the Story path, which leaves "Merged" via targetStatus and so never
 * re-matches its own JQL) — removing the guard label would otherwise make the ticket
 * visible to the generator rule again and re-trigger it forever instead of letting
 * automation run. sm_bug_test_cases_done is a permanent marker (never removed) that
 * the generator rule's JQL excludes on, independent of the transient guard label.
 */

const configLoader = require('./configLoader.js');
const tokenUsageComment = require('./common/tokenUsageComment.js');

function action(params) {
    const ticketKey = params.ticket && params.ticket.key;
    if (!ticketKey) {
        return { success: false, error: 'No ticket key found in params' };
    }
    const projectConfig = configLoader.loadProjectConfig(params.jobParams || params);
    const jiraConfig = projectConfig.jira;

    console.log('=== Finishing test case generation for', ticketKey, '===');

    try {
        jira_move_to_status({ key: ticketKey, statusName: jiraConfig.statuses.READY_FOR_TESTING });
        console.log('✅ Moved', ticketKey, 'to', jiraConfig.statuses.READY_FOR_TESTING);
    } catch (e) {
        console.warn('Could not move Story to Ready For Testing:', e);
    }

    const issueType = params.ticket && params.ticket.fields && params.ticket.fields.issuetype
        && params.ticket.fields.issuetype.name;
    const guardLabel = issueType === jiraConfig.issueTypes.BUG
        ? 'sm_bug_test_cases_triggered'
        : 'sm_test_cases_triggered';

    try {
        jira_remove_label({ key: ticketKey, label: guardLabel });
        console.log('Removed', guardLabel, '— test_automation can run next cycle');
    } catch (e) {
        console.warn('Could not remove', guardLabel, 'label:', e);
    }

    if (issueType === jiraConfig.issueTypes.BUG) {
        try {
            jira_add_label({ key: ticketKey, label: 'sm_bug_test_cases_done' });
            console.log('Added sm_bug_test_cases_done — generator will not re-trigger for this ticket');
        } catch (e) {
            console.warn('Could not add sm_bug_test_cases_done label:', e);
        }
    }

    try {
        tokenUsageComment.postTokenUsageComments(ticketKey, { initiator: params.initiator });
    } catch (e) {
        console.warn('Failed to post token usage comments:', e);
    }

    return { success: true, ticketKey: ticketKey };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action };
}
