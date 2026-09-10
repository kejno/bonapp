/**
 * TEMP DEBUG: check SCRUM-16 status + linked Test Cases.
 */
function action(params) {
    try {
        var t = jira_get_ticket('SCRUM-16');
        console.log('SCRUM-16 status: ' + JSON.stringify(t.fields && t.fields.status && t.fields.status.name));
    } catch (e) {
        console.log('ticket read failed: ' + e);
    }
    try {
        var tcs = jira_search_by_jql({
            jql: 'issue in linkedIssues("SCRUM-16") AND issuetype = "Test Case"',
            fields: ['key', 'summary', 'status'],
            maxResults: 20
        }) || [];
        console.log('Linked Test Cases: ' + JSON.stringify(tcs.map(function(t) {
            return { key: t.key, status: t.fields && t.fields.status && t.fields.status.name };
        })));
    } catch (e) {
        console.log('tc search failed: ' + e);
    }
    return { success: true };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action: action };
}
