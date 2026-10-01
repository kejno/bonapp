/**
 * Reads a Jira custom field value as plain text.
 *
 * Team-managed rich-text (Paragraph) fields such as "Failed Reason" are stored as Atlassian
 * Document Format objects ({ type: 'doc', content: [...] }), not as strings. Depending on how a
 * value was fetched it can also arrive as a plain string or as { value: '...' }.
 */

function adfInlineText(node) {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    return (node.content || []).map(adfInlineText).join('');
}

function adfBlockText(node, prefix) {
    if (!node || typeof node !== 'object') return [];
    var type = node.type;
    if (type === 'bulletList' || type === 'orderedList') {
        var lines = [];
        (node.content || []).forEach(function(item, index) {
            var marker = type === 'orderedList' ? (index + 1) + '. ' : '- ';
            var inner = [];
            (item.content || []).forEach(function(child) { inner = inner.concat(adfBlockText(child, '')); });
            if (inner.length) lines.push(prefix + marker + inner[0]);
            inner.slice(1).forEach(function(line) { lines.push(prefix + '  ' + line); });
        });
        return lines;
    }
    if (type === 'paragraph' || type === 'heading' || type === 'codeBlock') {
        var text = adfInlineText(node);
        return text.trim() ? text.split('\n').map(function(line) { return prefix + line; }) : [];
    }
    var nested = [];
    (node.content || []).forEach(function(child) { nested = nested.concat(adfBlockText(child, prefix)); });
    return nested;
}

function fieldToText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value !== 'object') return '';
    if (typeof value.value === 'string') return value.value.trim();
    if (value.type === 'doc' || Array.isArray(value.content)) {
        return adfBlockText(value, '').join('\n').trim();
    }
    return '';
}

/**
 * Finds a custom field in a Jira `fields` object by id and/or name and returns it as text.
 * dmtools may also expose a custom field under a "Name (customfield_12345)" key, so keys that
 * contain the id or the name are tried as a last resort.
 */
function readFieldText(fields, fieldId, fieldName) {
    if (!fields) return '';
    var candidates = [fieldId, fieldName].filter(function(key) { return key; });
    for (var i = 0; i < candidates.length; i++) {
        var direct = fieldToText(fields[candidates[i]]);
        if (direct) return direct;
    }
    for (var key in fields) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        var matches = candidates.some(function(candidate) { return key.indexOf(candidate) !== -1; });
        if (!matches) continue;
        var text = fieldToText(fields[key]);
        if (text) return text;
    }
    return '';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { fieldToText: fieldToText, readFieldText: readFieldText };
}
