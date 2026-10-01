/**
 * Project config for the dmtools-agents SM pipeline, adapted from
 * https://github.com/IstiN/dmtools-agents for this repo.
 *
 * Discovered automatically by js/configLoader.js at .dmtools/config.js
 * (repo root) or ../.dmtools/config.js (when run from agents/).
 *
 * Fill in JIRA_PROJECT_KEY once the Jira Cloud project is created —
 * see .dmtools/README.md for the setup steps.
 */
module.exports = {
    repository: {
        owner: 'kejno',
        repo: 'bonapp'
    },

    jira: {
        project: 'BNP',
        parentTicket: '',
        // A Jira search returns a custom field only when it is requested by id. The Failed Reason
        // (Paragraph, Test Case) id is needed to hand the failure to the bulk bug creation agent.
        fields: {
            failedReasonId: 'customfield_10177'
        }
    },

    git: {
        baseBranch: 'main'
    },

    // agents/*.json configFile paths in sm.json are resolved relative to this dir.
    agentConfigsDir: '.dmtools/agents',

    scm: {
        provider: 'github'
    }
};
