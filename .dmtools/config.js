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
        repo: 'resume'
    },

    jira: {
        project: 'SCRUM',
        parentTicket: ''
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
