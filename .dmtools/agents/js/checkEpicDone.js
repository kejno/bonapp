/**
 * Complete an active Epic once every direct child Story is Done.
 * Empty Epics are intentionally left open: they still need intake.
 */

const configLoader = require('./configLoader.js');

function action(params) {
    var ticketKey = params.ticket && params.ticket.key;
    if (!ticketKey) return { success: false, action: 'missing_ticket' };

    var projectConfig = configLoader.loadProjectConfig(params.jobParams || params);
    var doneStatus = projectConfig.jira.statuses.DONE;
    var stories;

    try {
        stories = jira_search_by_jql({
            jql: 'parent = ' + ticketKey + ' AND issuetype = Story ORDER BY created ASC',
            fields: ['key', 'status']
        }) || [];
    } catch (e) {
        console.warn('Failed to fetch child Stories for ' + ticketKey + ':', e.message || e);
        return { success: false, action: 'fetch_failed', error: e.toString() };
    }

    if (stories.length === 0) {
        console.log(ticketKey + ' has no child Stories — waiting for intake');
        return { success: true, action: 'waiting_for_intake', ticketKey: ticketKey };
    }

    var unfinished = stories.filter(function(story) {
        return !(story.fields && story.fields.status && story.fields.status.name === doneStatus);
    });
    if (unfinished.length > 0) {
        console.log(ticketKey + ' still has ' + unfinished.length + ' unfinished Story/Stories');
        return {
            success: true,
            action: 'waiting_for_stories',
            ticketKey: ticketKey,
            unfinished: unfinished.map(function(story) { return story.key; })
        };
    }

    try {
        jira_move_to_status({ key: ticketKey, statusName: doneStatus });
        jira_post_comment({
            key: ticketKey,
            comment: 'h3. ✅ Epic Completed Automatically\n\n' +
                'All *' + stories.length + '* child Stories are in *' + doneStatus + '*.\n\n' +
                'The Epic was automatically moved to *' + doneStatus + '*.'
        });
        console.log('Moved Epic ' + ticketKey + ' to ' + doneStatus);
        return { success: true, action: 'moved_to_done', ticketKey: ticketKey };
    } catch (e) {
        console.warn('Failed to complete Epic ' + ticketKey + ':', e.message || e);
        return { success: false, action: 'move_failed', error: e.toString() };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action };
}
