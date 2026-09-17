const assert = require('assert');
const guard = require('../common/blockerGuard.js');

assert.strictEqual(guard.containsBlockerMarker('No blockers here'), false);
assert.strictEqual(guard.containsBlockerMarker('⚠ BLOCKER: missing Figma'), true);
assert.strictEqual(guard.containsBlockerMarker('⚠️ BLOCKER: missing mockup'), true);
assert.strictEqual(guard.containsBlockerMarker('BLOCKER: missing specification'), true);
assert.strictEqual(guard.containsBlockerMarker({
    type: 'doc',
    content: [{ type: 'text', text: '⚠ BLOCKER: nested ADF marker' }]
}), true);
assert.strictEqual(guard.containsBlockerMarker({
    type: 'doc',
    content: [{ type: 'text', text: 'Ready for implementation' }]
}), false);

assert.strictEqual(
    guard.extractBlockerReason('*⚠ BLOCKER:* The SCREEN_20 mockup and Figma link are missing.'),
    'The SCREEN_20 mockup and Figma link are missing.'
);
assert.strictEqual(
    guard.extractBlockerReason({
        type: 'doc',
        content: [{
            type: 'paragraph',
            content: [
                { type: 'text', text: '⚠ BLOCKER:' },
                { type: 'text', text: ' A Figma mockup is required.' }
            ]
        }]
    }),
    'A Figma mockup is required.'
);

console.log('All blocker guard checks passed');
