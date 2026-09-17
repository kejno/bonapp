/**
 * Guards workflow transitions when generated or existing ticket content
 * contains an explicit human blocker marker.
 */

var config = require('../config.js');

var BLOCKER_MARKER_RE = /(?:⚠(?:️)?\s*)?BLOCKER\s*:/i;

function containsBlockerMarker(value) {
    if (value === null || typeof value === 'undefined') return false;
    if (typeof value === 'string') return BLOCKER_MARKER_RE.test(value);
    if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i++) {
            if (containsBlockerMarker(value[i])) return true;
        }
        return false;
    }
    if (typeof value === 'object') {
        var keys = Object.keys(value);
        for (var j = 0; j < keys.length; j++) {
            if (containsBlockerMarker(value[keys[j]])) return true;
        }
    }
    return false;
}

function textContent(value) {
    if (value === null || typeof value === 'undefined') return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value.map(textContent).filter(Boolean).join(' ');
    }
    if (typeof value === 'object') {
        if (typeof value.text === 'string') return value.text;
        return textContent(value.content || []);
    }
    return '';
}

function collectTextBlocks(value, blocks) {
    blocks = blocks || [];
    if (value === null || typeof value === 'undefined') return blocks;
    if (typeof value === 'string') {
        value.split(/\r?\n/).forEach(function(line) {
            if (line.trim()) blocks.push(line.trim());
        });
        return blocks;
    }
    if (Array.isArray(value)) {
        value.forEach(function(item) { collectTextBlocks(item, blocks); });
        return blocks;
    }
    if (typeof value === 'object') {
        if (value.type === 'paragraph' || value.type === 'heading') {
            var block = textContent(value).replace(/\s+/g, ' ').trim();
            if (block) blocks.push(block);
            return blocks;
        }
        collectTextBlocks(value.content || [], blocks);
    }
    return blocks;
}

function extractBlockerReason(value) {
    var blocks = collectTextBlocks(value, []);
    for (var i = 0; i < blocks.length; i++) {
        var match = BLOCKER_MARKER_RE.exec(blocks[i]);
        if (!match) continue;
        var reason = blocks[i].substring(match.index + match[0].length)
            .replace(/^\s*[*_\-–—:]?\s*/, '')
            .replace(/[*_]+$/g, '')
            .trim();
        if (reason) return reason;
        if (i + 1 < blocks.length) return blocks[i + 1];
    }
    return 'The ticket content contains an explicit BLOCKER that requires human input.';
}

function blockTicket(ticketKey, options) {
    options = options || {};
    var statusName = options.statusName || config.STATUSES.BLOCKED;
    var label = options.label || config.LABELS.CONTENT_BLOCKER;
    var resumeStatus = options.resumeStatus || config.STATUSES.BA_ANALYSIS;
    var reason = options.reason || extractBlockerReason(options.content);

    if (options.initiatorId) {
        try {
            jira_assign_ticket_to({ key: ticketKey, accountId: options.initiatorId });
        } catch (e) {
            console.warn('Failed to assign blocked ticket ' + ticketKey + ':', e);
        }
    }

    // Add the guard label before moving status. Otherwise a label failure
    // could leave an unguarded Blocked ticket that the dependency-unblock
    // rule immediately returns to Backlog.
    jira_add_label({ key: ticketKey, label: label });
    jira_move_to_status({ key: ticketKey, statusName: statusName });
    try { jira_add_label({ key: ticketKey, label: config.LABELS.AI_GENERATED }); } catch (e) {}

    if (options.wipLabel) {
        try { jira_remove_label({ key: ticketKey, label: options.wipLabel }); } catch (e) {}
    }
    if (options.retryLabel) {
        try { jira_remove_label({ key: ticketKey, label: options.retryLabel }); } catch (e) {}
    }

    if (options.comment !== false) {
        try {
            jira_post_comment({
                key: ticketKey,
                comment: 'h3. ⛔ Automation stopped by a content blocker\n\n' +
                    '*Blocked because:* ' + reason + '\n\n' +
                    '*Required actions:*\n' +
                    '# Provide the missing material or clarification described above.\n' +
                    '# Move the ticket to *' + resumeStatus + '*.\n' +
                    '# Run the SM Agent manually or wait for its next automatic cycle.\n\n' +
                    'After Acceptance Criteria are regenerated without a `BLOCKER:` marker, the *' + label +
                    '* label will be removed automatically and the workflow will continue.'
            });
        } catch (e) {
            console.warn('Failed to post blocker comment for ' + ticketKey + ':', e);
        }
    }

    console.log('⛔ ' + ticketKey + ' contains an explicit blocker — moved to ' + statusName);
    return { success: true, blocked: true, ticketKey: ticketKey, status: statusName, label: label };
}

function clearBlockerLabel(ticketKey, label) {
    var blockerLabel = label || config.LABELS.CONTENT_BLOCKER;
    try {
        jira_remove_label({ key: ticketKey, label: blockerLabel });
        console.log('Removed resolved content-blocker label "' + blockerLabel + '" from ' + ticketKey);
        return true;
    } catch (e) {
        console.warn('Could not remove content-blocker label from ' + ticketKey + ':', e);
        return false;
    }
}

module.exports = {
    containsBlockerMarker: containsBlockerMarker,
    extractBlockerReason: extractBlockerReason,
    blockTicket: blockTicket,
    clearBlockerLabel: clearBlockerLabel
};
