/**
 * Detects a CLI-agent run that never really happened, so post-actions can
 * refuse to advance a ticket on the strength of an empty outputs/ folder.
 *
 * Background: dmtools' Java core does not propagate run-agent.sh's exit code
 * as a process exception for skipAIProcessing/outputType:none jobs (see
 * README, known upstream bug 8). A provider that died on a
 * rate/usage limit therefore still reaches postJSAction with an empty
 * outputs/ folder — indistinguishable, from the post-action's point of view,
 * from an agent that ran fine and legitimately had nothing to write.
 *
 * Those two cases need opposite handling: "nothing to write" should move the
 * ticket forward, "never ran" must leave it exactly as it was, or the
 * pipeline silently marks unstarted work as reviewed. Only the provider knows
 * which happened, so it writes outputs/agent_failure.json (see
 * record_agent_failure() in agents/scripts/providers/_common.sh) and this
 * helper reads it back.
 *
 * Failing the workflow step afterwards does not solve this: the post-action
 * has already written to Jira by the time any later step runs.
 */

const outputFiles = require('./outputFiles.js');

var MARKER_NAME = 'agent_failure.json';

/**
 * Read the failure marker written by the provider script, if any.
 * @param {string} [ticketKey] - Ticket key, for outputs/<key>/ resolution.
 * @returns {{provider: string, exitCode: string, reason: string}|null}
 */
function readAgentFailure(ticketKey) {
    var raw = outputFiles.readOutputFile(MARKER_NAME, { ticketKey: ticketKey });
    if (!raw || !String(raw).trim()) {
        return null;
    }
    try {
        var parsed = JSON.parse(String(raw));
        return {
            provider: parsed.provider || 'unknown',
            exitCode: String(parsed.exit_code === undefined ? '' : parsed.exit_code),
            reason: parsed.reason || 'the agent CLI did not complete a real run'
        };
    } catch (error) {
        // A marker we cannot parse still means the provider tried to report a
        // failure — treat it as one rather than falling through to "success".
        console.warn('Could not parse ' + MARKER_NAME + ' — treating as a failed run:', error);
        return {
            provider: 'unknown',
            exitCode: '',
            reason: 'the agent CLI reported a failure (unparseable ' + MARKER_NAME + ')'
        };
    }
}

/**
 * Abort a post-action when the agent CLI never produced a real run.
 *
 * Posts one Jira comment explaining why nothing moved, then returns a result
 * object the post-action should return as-is. Returns null when the run was
 * genuine and the caller should proceed normally.
 *
 * Deliberately makes NO other Jira change: no labels, no status transition,
 * no assignment. An SM rule may already have changed the status before this
 * post-action runs; the next pass can retry only if a rule matches that state.
 *
 * The comment body is in Russian per the project's Jira language rule
 * (agents/instructions/common/language.md); agentName is the agent config
 * name so a reader can tell which job to re-run.
 *
 * @param {string} ticketKey
 * @param {string} agentName - Agent config name, e.g. 'story_questions'.
 * @returns {{success: boolean, error: string}|null}
 */
function abortIfAgentFailed(ticketKey, agentName) {
    var failure = readAgentFailure(ticketKey);
    if (!failure) {
        return null;
    }

    var name = agentName || 'ai-agent';
    var message = 'Agent ' + name + ' did not complete a real run: ' + failure.reason;
    console.error('Aborting post-action — ' + message);

    try {
        jira_post_comment({
            key: ticketKey,
            comment: 'h3. ⚠️ Агент {{' + name + '}} не отработал — дальнейшее продвижение остановлено\n\n' +
                '|Провайдер|{{' + failure.provider + '}}|\n' +
                '|Причина|' + failure.reason + '|\n\n' +
                'Этот post-action не менял статус, лейблы или исполнителя. SM мог изменить статус ' +
                'до запуска агента, поэтому работа не считается завершённой.\n\n' +
                'Следующий цикл SM-агента повторит попытку, если тикет подходит под правило повтора. ' +
                'Если это лимит подписки — дождитесь его сброса и проверьте следующий ран.'
        });
    } catch (error) {
        console.warn('Failed to post agent-failure comment:', error);
    }

    return {
        success: false,
        error: message
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        readAgentFailure: readAgentFailure,
        abortIfAgentFailed: abortIfAgentFailed
    };
}
