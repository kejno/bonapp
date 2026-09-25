/**
 * Check WIP Label Pre-Action
 * Checks if ticket has a work-in-progress label and stops processing if found
 * Returns false to stop processing, true to continue
 */

/**
 * Pre-action function to check for WIP label
 * 
 * @param {Object} params - Parameters from Teammate job
 * @param {Object} params.ticket - Jira ticket object
 * @param {Object} params.metadata - Job metadata containing contextId
 * @returns {boolean} false to stop processing, true to continue
 */

var configLoader = require('./configLoader.js');
var gh = require('./common/githubHelpers.js');
var blockerGuard = require('./common/blockerGuard.js');

function action(params) {
    try {
        const ticket = params.ticket;
        const metadata = params.metadata;

        console.log('=== Running checkWipLabel pre-action ===');
        console.log('Ticket key:', ticket && ticket.key ? ticket.key : '(missing)');
        console.log('Context ID:', metadata && metadata.contextId ? metadata.contextId : '(missing)');
        
        if (!ticket || !ticket.key) {
            throw new Error('Ticket not found or not provided: ensure inputJql targets a valid, existing Jira ticket');
        }
        if (!ticket || !metadata || !metadata.contextId) {
            console.log('No contextId in metadata, continuing with processing');
            return true;
        }
        
        // Dynamically generate WIP label from contextId
        const wipLabel = metadata.contextId + '_wip';
        const ticketKey = ticket.key;
        
        // Get ticket labels
        const labels = ticket.fields && ticket.fields.labels ? ticket.fields.labels : [];
        console.log('Expected WIP label:', wipLabel);
        console.log('Ticket labels:', labels.length > 0 ? labels.join(', ') : '(none)');
        
        // Check if WIP label exists
        if (labels.includes(wipLabel)) {
            console.log('⏸️  Ticket ' + ticketKey + ' has WIP label "' + wipLabel + '" - skipping processing');
            
            // Post comment to ticket explaining why it was skipped
            try {
                jira_post_comment({
                    key: ticketKey,
                    comment: 'h3. *Processing Skipped*\n\n' +
                            'This ticket has the *' + wipLabel + '* label indicating work is in progress.\n' +
                            'Processing will be skipped until the label is removed.\n\n' +
                            '_Remove the label to allow automated processing._'
                });
                console.log('Posted skip notification comment to ' + ticketKey);
            } catch (commentError) {
                console.warn('Failed to post skip comment:', commentError);
            }
            
            console.log('checkWipLabel result: stop processing');
            return false; // Stop processing
        }
        
        console.log('✅ Ticket ' + ticketKey + ' does not have WIP label "' + wipLabel + '" - continuing with processing');

        var customParams = (params.jobParams && params.jobParams.customParams) || params.customParams || {};

        // Solution generation must not consume CI or advance a story whose
        // Acceptance Criteria explicitly says required human input is missing.
        if (customParams.blockOnAcceptanceCriteriaMarker) {
            try {
                var freshTicket = jira_get_ticket({ key: ticketKey, fields: ['Acceptance Criteria'] });
                var freshFields = freshTicket && freshTicket.fields ? freshTicket.fields : freshTicket;
                var acceptanceCriteria = freshFields && freshFields['Acceptance Criteria'];
                if (blockerGuard.containsBlockerMarker(acceptanceCriteria)) {
                    blockerGuard.blockTicket(ticketKey, {
                        wipLabel: wipLabel,
                        retryLabel: 'sm_story_acceptance_criteria_triggered',
                        content: acceptanceCriteria
                    });
                    console.log('checkWipLabel result: stop processing (Acceptance Criteria blocker)');
                    return false;
                }
            } catch (blockerError) {
                console.warn('Failed to inspect Acceptance Criteria blocker (non-fatal):', blockerError);
            }
        }

        // Development must not start on a Story whose parent Epic is still
        // Blocked — the Epic being unavailable usually means the umbrella
        // scope/dependencies aren't settled yet, even though the Story itself
        // reached Ready For Development. Skip this cycle without touching
        // status/labels; SM will retry the Story on its next pass, and the
        // Epic's own unblock (unblock_resolved_dependencies) doesn't affect
        // this check since it's evaluated fresh from Jira every time.
        if (customParams.blockOnParentEpicStatus) {
            try {
                var parentKey = ticket.fields && ticket.fields.parent && ticket.fields.parent.key;
                if (parentKey) {
                    var parentTicket = jira_get_ticket({ key: parentKey, fields: ['status'] });
                    var parentFields = parentTicket && parentTicket.fields ? parentTicket.fields : parentTicket;
                    var parentStatus = parentFields && parentFields.status && parentFields.status.name;
                    var blockedStatuses = [].concat(customParams.blockOnParentEpicStatus === true
                        ? ['Blocked']
                        : customParams.blockOnParentEpicStatus);
                    if (parentStatus && blockedStatuses.indexOf(parentStatus) !== -1) {
                        console.log('⏸️  Parent Epic ' + parentKey + ' is ' + parentStatus + ' - skipping ' + ticketKey);
                        try {
                            jira_post_comment({
                                key: ticketKey,
                                comment: 'h3. *Processing Skipped*\n\n' +
                                    'Parent Epic ' + parentKey + ' is currently *' + parentStatus + '*.\n' +
                                    'Development will not start until the Epic leaves that status.\n\n' +
                                    '_No status or label change was made — the SM Agent will re-check on its next cycle._'
                            });
                        } catch (commentError) {
                            console.warn('Failed to post skip comment:', commentError);
                        }
                        console.log('checkWipLabel result: stop processing (parent Epic blocked)');
                        return false;
                    }
                    console.log('✅ Parent Epic ' + parentKey + ' status "' + parentStatus + '" - continuing');
                }
            } catch (epicError) {
                console.warn('Failed to check parent Epic status (non-fatal):', epicError);
            }
        }

        // Optional: verify an open PR exists for review/rework agents.
        if (customParams.checkOpenPR) {
            try {
                var config = configLoader.loadProjectConfig(params.jobParams || params);
                var scm = configLoader.createScm(config);
                var prSearchOptions = config.prSearchFn ? { prSearchFn: config.prSearchFn } : {};
                var pr = gh.findPRForTicket(scm, ticketKey, prSearchOptions);
                if (!pr) {
                    console.log('⏸️  No open PR found for ' + ticketKey + ' - skipping processing');
                    try {
                        jira_post_comment({
                            key: ticketKey,
                            comment: 'h3. *Processing Skipped*\n\nNo open Pull Request found for this ticket. The review/rework agent cannot run without an existing PR.\n\n_Ticket will be processed again once a PR is available._'
                        });
                    } catch (commentError) {
                        console.warn('Failed to post skip comment:', commentError);
                    }
                    console.log('checkWipLabel result: stop processing (no open PR)');
                    return false;
                }
                console.log('✅ Found open PR #' + pr.number + ' for ' + ticketKey + ' - continuing');
            } catch (prError) {
                console.warn('Failed to check open PR (non-fatal):', prError);
            }
        }

        console.log('checkWipLabel result: continue processing');
        return true; // Continue processing
        
    } catch (error) {
        console.error('❌ Error in WIP label check:', error);
        // On error, continue processing to avoid blocking legitimate workflows
        console.warn('Continuing with processing despite error in WIP check');
        console.log('checkWipLabel result: continue processing after error');
        return true;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action: action };
}
