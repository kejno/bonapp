/**
 * Unblock Resolved Dependencies — postJSAction for unblock_resolved_dependencies agent.
 *
 * Runs on every SM cycle for each ticket in "Blocked" status.
 * - Reads issuelinks to find all "is blocked by" dependencies (inwardIssue with Blocks link type).
 * - If all blockers are in a terminal status (Done, Merged, Passed, Closed, Irrelevant)
 *   or the blocker was deleted (inwardIssue === null), resumes the ticket.
 * - An Epic with existing child Stories moves to In Progress. A Story whose
 *   test automation has already started returns to In Testing; an empty Epic
 *   or other ticket moves to Backlog for normal intake/processing.
 * - Otherwise leaves the ticket in Blocked.
 */

const configLoader = require('./configLoader.js');
const tokenUsageComment = require('./common/tokenUsageComment.js');
const { LABELS } = require('./config.js');

function isResolved(blocker, terminalStatuses) {
    // Deleted ticket — no inwardIssue object at all
    if (!blocker) return true;

    var statusName = blocker.fields && blocker.fields.status && blocker.fields.status.name;
    if (!statusName) return false;

    return terminalStatuses.indexOf(statusName) !== -1;
}

function resumeStatus(ticketKey, ticket, jiraConfig) {
    var issueType = ticket && ticket.fields && ticket.fields.issuetype &&
        ticket.fields.issuetype.name;
    var labels = ticket && ticket.fields && ticket.fields.labels || [];
    // A blocked Story can already be deep in the test-automation lifecycle.
    // Sending it to Backlog would bypass the In Testing review/merge/done rules.
    if (issueType === 'Story' && labels.indexOf(LABELS.AI_TEST_AUTOMATION) !== -1) {
        return jiraConfig.statuses.IN_TESTING;
    }
    if (issueType !== 'Epic') return jiraConfig.statuses.BACKLOG;

    try {
        var children = jira_search_by_jql({
            jql: 'parent = ' + ticketKey + ' AND issuetype = Story',
            fields: ['key'],
            maxResults: 1
        }) || [];
        return children.length > 0
            ? jiraConfig.statuses.IN_PROGRESS
            : jiraConfig.statuses.BACKLOG;
    } catch (e) {
        // Fail safely: an Epic must not re-enter intake when we cannot prove it
        // is empty, because that could create duplicate Stories.
        console.warn('Failed to inspect child Stories for Epic ' + ticketKey + ':', e.message || e);
        return null;
    }
}

function moveToResumeStatus(ticketKey, ticket, jiraConfig) {
    var status = resumeStatus(ticketKey, ticket, jiraConfig);
    if (!status) return { success: false, action: 'child_check_failed' };
    jira_move_to_status({ key: ticketKey, statusName: status });
    return { success: true, status: status };
}

function action(params) {
    var ticketKey = params.ticket && params.ticket.key;
    if (!ticketKey) {
        console.error('No ticket key provided');
        return { success: false, action: 'missing_ticket' };
    }

    var projectConfig = configLoader.loadProjectConfig(params.jobParams || params);
    var jiraConfig = projectConfig.jira;
    var terminalStatuses = [
        jiraConfig.statuses.DONE,
        jiraConfig.statuses.MERGED,
        jiraConfig.statuses.PASSED,
        jiraConfig.statuses.IRRELEVANT,
        // Not part of STATUSES/config — kept as a literal for backward compatibility
        'Closed'
    ].filter(Boolean);

    console.log('=== Unblock resolved dependencies check for', ticketKey, '===');

    var ticket;
    try {
        ticket = jira_get_ticket({ key: ticketKey, fields: ['issuelinks', 'issuetype', 'labels'] });
    } catch (e) {
        console.warn('Failed to fetch ticket details:', e.message || e);
        return { success: false, action: 'fetch_failed', error: e.toString() };
    }

    var links = (ticket && ticket.fields && ticket.fields.issuelinks) || [];

    // Find all inward blockers (tickets that block the current one)
    var blockers = [];
    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        // inwardIssue means: current ticket is blocked by the inwardIssue
        if (link.inwardIssue && link.type && link.type.name === 'Blocks') {
            blockers.push(link.inwardIssue);
        }
    }

    console.log('Found', blockers.length, 'blocker(s) for', ticketKey);

    // This agent only resolves dependency-driven blocks. A ticket may also be
    // deliberately Blocked for manual triage without an "is blocked by" link.
    // Treating zero links as resolved re-opens those tickets immediately and
    // can restart an already exhausted automation cycle.
    if (blockers.length === 0) {
        console.log('No dependency links found — leaving', ticketKey, 'Blocked for manual triage');
        return { success: true, action: 'manual_block_no_dependencies', ticketKey: ticketKey };
    }

    // Check if all blockers are resolved
    var unresolved = [];
    for (var j = 0; j < blockers.length; j++) {
        var b = blockers[j];
        var bKey = b.key || '?';
        var bStatus = b.fields && b.fields.status && b.fields.status.name || 'Unknown';
        if (isResolved(b, terminalStatuses)) {
            console.log('  Blocker', bKey, 'is resolved (', bStatus, ')');
        } else {
            console.log('  Blocker', bKey, 'is NOT resolved (', bStatus, ')');
            unresolved.push({ key: bKey, status: bStatus });
        }
    }

    if (unresolved.length > 0) {
        console.log('Still blocked by', unresolved.length, 'unresolved ticket(s):', unresolved.map(function(u) { return u.key; }).join(', '));
        return { success: true, action: 'still_blocked', unresolved: unresolved, ticketKey };
    }

    // All blockers resolved → resume according to issue type/intake state.
    console.log('All', blockers.length, 'blocker(s) resolved — resuming', ticketKey);
    var resumeMove;
    try {
        resumeMove = moveToResumeStatus(ticketKey, ticket, jiraConfig);
        if (!resumeMove.success) return resumeMove;
    } catch (e) {
        console.warn('Failed to resume ticket:', e.message || e);
        return { success: false, action: 'move_failed', error: e.toString() };
    }

    var resolvedKeys = blockers.map(function(b) {
        return b.key + ' (' + (b.fields && b.fields.status && b.fields.status.name || '?') + ')';
    }).join(', ');

    try {
        jira_post_comment({
            key: ticketKey,
            comment: 'h3. ✅ Auto-unblocked — All Dependencies Resolved\n\n' +
                'All *' + blockers.length + '* blocker(s) are now in a terminal status:\n' +
                resolvedKeys.split(', ').map(function(k) { return '- ' + k; }).join('\n') + '\n\n' +
                'Automatically moved to *' + resumeMove.status + '*.'
        });
        console.log('✅ Posted unblock comment to Jira');
    } catch (e) {
        console.warn('Failed to post comment:', e.message || e);
    }

    console.log('✅ Moved', ticketKey, 'to', resumeMove.status);

    // Post token usage summary comments (e.g. [story_acceptance_criteria]: {...}) if any provider
    // wrote outputs/*_usage.json during the agent run.
    try {
        tokenUsageComment.postTokenUsageComments(ticketKey, { initiator: params.initiator });
    } catch (e) {
        console.warn('Failed to post token usage comments:', e);
    }

    return { success: true, action: 'moved_to_resume_status', blockersResolved: blockers.length, ticketKey: ticketKey };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action };
}
