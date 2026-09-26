/**
 * Pre-CLI Rework Setup Action (preCliJSAction for pr_rework agent)
 * 1. Finds the existing PR for the ticket — if none is open but one already
 *    merged, quietly skips the CLI call instead of failing (see the merged-PR
 *    branch of Step 2 below)
 * 2. Checks out the PR branch
 * 3. Merges origin/{baseBranch} into the PR branch (auto-update, before setup commands run —
 *    see the comment above the detectMergeConflicts() call for why the order matters)
 * 4. Runs project-specific setup commands (build/verify) against the now-updated branch
 * 5. Writes input folder: pr_info.md, pr_diff.txt, pr_discussions.md, pr_discussions_raw.json
 * 6. Fetches question subtasks with answers (extra context)
 * 7. Posts "Rework Started" comment to Jira
 */

var configLoader = require('./configLoader.js');
const gh = require('./common/githubHelpers.js');
const gitOps = require('./common/gitOps.js');
const fetchQuestionsToInput = require('./fetchQuestionsToInput.js');
const fetchParentContextToInput = require('./fetchParentContextToInput.js');
var restoreFromReleases = require('./restoreFromReleases.js');
var setupCommands = require('./common/setupCommands.js');

/**
 * Optionally syncs the PR's base branch with its own upstream (config.git.baseBranch)
 * before merge-conflict detection runs. Relevant in two-branch mode, where the PR's base is
 * a long-lived branch (e.g. "release/rc_*") that can drift stale relative to
 * config.git.baseBranch over time. Delegates to a project-specific hook
 * (customParams.branchSyncFnPath) because syncing may require bypassing branch-protection
 * rules that block direct pushes to that branch — same rationale as
 * customParams.branchCreateFnPath in checkoutBranch.js.
 *
 * No-op when branchSyncFnPath isn't configured, or when the PR's base already IS
 * config.git.baseBranch (nothing to sync). Failures are logged and swallowed — the sync is
 * a best-effort freshness step, not a hard prerequisite for the rest of the rework flow.
 *
 * @param {string} baseBranch    - the PR's base branch (prDetails.base.ref)
 * @param {Object} customParams  - agent customParams (may contain branchSyncFnPath)
 * @param {Object} config        - resolved project config (config.git.baseBranch, workingDir)
 */
function syncBaseBranchIfConfigured(baseBranch, customParams, config) {
    if (!customParams.branchSyncFnPath || !baseBranch || baseBranch === config.git.baseBranch) {
        return;
    }
    var branchSyncFn = configLoader.loadHookFn(customParams.branchSyncFnPath, 'branchSyncFnPath');
    if (!branchSyncFn) {
        return;
    }
    try {
        console.log('Syncing base branch', baseBranch, 'via', customParams.branchSyncFnPath);
        branchSyncFn({
            branchName: baseBranch,
            targetBranch: config.git.baseBranch,
            workingDir: config.workingDir,
            config: config
        });
        cli_execute_command({ command: gh.buildOriginFetchCommand() });
    } catch (e) {
        console.warn('branchSyncFnPath failed (non-fatal):', e && e.toString ? e.toString() : String(e));
    }
}

// Defensive cap on Jira/tracker comment length for any failSetup() caller. The
// setupCommands module already truncates its own embedded command output at the
// source (see truncateSetupError), but other failure messages here (e.g. branch
// checkout errors) could still, in principle, be arbitrarily long — Jira rejects
// comments over ~350000 characters, and previously that rejection was silently
// swallowed, leaving the ticket with no visible failure reason at all.
var truncateForComment = setupCommands.truncateSetupError;

// Tells the CI workflow's "Validate Codex/Claude execution" gate that the
// missing provider transcript is expected, not a crash — same contract
// prepareTestPRForReview.js uses (markCliIntentionallySkipped there). Without
// this, a preCliJSAction that skips the CLI call still shows up as
// "No Codex transcript was produced" -> job failure, indistinguishable from a
// real broken invocation.
function markCliIntentionallySkipped(reason) {
    try {
        file_write({
            path: 'outputs/agent_cli_intentionally_skipped.json',
            content: JSON.stringify({ reason: reason })
        });
    } catch (e) {
        console.warn('Failed to write agent_cli_intentionally_skipped.json:', e);
    }
}

function failSetup(ticketKey, inputFolder, message) {
    try {
        file_write({
            path: inputFolder + '/rework_setup_failed.md',
            content: '# Rework Setup Failed\n\n' + message + '\n'
        });
    } catch (e) {
        console.warn('Failed to write rework setup failure marker:', e);
    }
    try {
        jira_post_comment({
            key: ticketKey,
            comment: 'h3. ❌ Rework Setup Failed\n\n' + truncateForComment(message)
        });
    } catch (e) {
        console.error('Failed to post rework setup failure comment to ' + ticketKey + ':', e && e.toString ? e.toString() : String(e));
    }
    throw new Error(message);
}

function action(params) {
    try {
        var actualParams = params.inputFolderPath ? params : (params.jobParams || params);
        var inputFolder = actualParams.inputFolderPath;
        var ticketKey = inputFolder.split('/').pop();
        // paramsForConfigLoad re-attaches params.ticket (sibling of jobParams in the
        // real Teammate execution path) so baseBranchResolverFnPath can key off the
        // ticket's fixVersion — see configLoader.js for details.
        var config = configLoader.loadProjectConfig(configLoader.paramsForConfigLoad(params));
        var customParams = (params.jobParams && params.jobParams.customParams) || actualParams.customParams;
        var scm = configLoader.createScm(config);

        // Restore configured artefacts (e.g. cosmo test reports) from GitHub Release — non-fatal
        try { restoreFromReleases.action(params); } catch (e) { console.warn('⚠️ restoreFromReleases failed (non-fatal):', e); }

        console.log('=== Rework setup for:', ticketKey, '===');

        // Step 1: GitHub repo info — prefer targetRepository from config over git remote
        var repoInfo = null;
        if (config.repository && config.repository.owner && config.repository.repo) {
            repoInfo = { owner: config.repository.owner, repo: config.repository.repo };
            console.log('Using targetRepository from config:', repoInfo.owner + '/' + repoInfo.repo);
        } else {
            repoInfo = scm.getRemoteRepoInfo();
        }
        if (!repoInfo) {
            const err = 'Could not determine GitHub repository from git remote';
            try { jira_post_comment({ key: ticketKey, comment: 'h3. ❌ Rework Setup Failed\n\n' + err }); } catch (e) {}
            return { success: false, error: err };
        }

        // Step 2: Find existing PR
        var prSearchOptions = config.prSearchFn ? { prSearchFn: config.prSearchFn } : {};
        const pr = gh.findPRForTicket(scm, ticketKey, prSearchOptions);
        if (!pr) {
            // No OPEN dev PR does not necessarily mean rework has nothing to act
            // on — the ticket's "In Rework" status can be stale relative to a dev
            // PR that already merged (e.g. the ticket is actually mid test-
            // automation cycle and "In Rework" refers to that separate PR, not
            // this agent's dev PR). recover_merged_pr.json is supposed to catch
            // this earlier in the same SM pass, but a same-pass status change can
            // race it (observed on BNP-150: dev PR #114 had merged the day
            // before, the ticket re-entered "In Rework" via the test-automation
            // cycle, and pr_rework still fired and threw here instead of
            // recognizing there was nothing left for IT to rework).
            //
            // Distinguish "PR was merged, nothing to do" (quietly succeed, let
            // recovery/test-automation rules handle the ticket on the next SM
            // pass) from "no PR ever existed" (a real setup failure — surface it).
            var mergedPr = null;
            try {
                mergedPr = gh.findMergedPRForTicket(scm, ticketKey);
            } catch (e) {
                console.warn('Could not check for an already-merged PR:', e && e.toString ? e.toString() : String(e));
            }
            if (mergedPr) {
                console.log('No open PR for ' + ticketKey + ', but PR #' + mergedPr.number + ' already merged — nothing for pr_rework to do, skipping.');
                try { jira_remove_label({ key: ticketKey, label: 'sm_story_rework_triggered' }); } catch (e) {}
                try {
                    jira_post_comment({
                        key: ticketKey,
                        comment: 'h3. ℹ️ Rework Skipped — Dev PR Already Merged\n\n' +
                            'PR [#' + mergedPr.number + '|' + (mergedPr.html_url || '') + '] for this ticket is already merged. ' +
                            'The current status likely belongs to a later stage (e.g. test automation) — leaving it for the appropriate agent on the next cycle.'
                    });
                } catch (e) {}
                markCliIntentionallySkipped('dev_pr_already_merged');
                return { success: true, action: 'dev_pr_already_merged', prNumber: mergedPr.number };
            }
            failSetup(
                ticketKey,
                inputFolder,
                'No Pull Request found for ticket ' + ticketKey + '. Cannot start rework without an existing PR.'
            );
        }

        // Step 3: PR details
        const prDetails = gh.getPRDetails(scm, pr.number);
        if (!prDetails) {
            failSetup(ticketKey, inputFolder, 'Failed to fetch PR details for PR #' + pr.number);
        }

        // Step 4: Checkout PR branch
        const branchName = prDetails.head ? prDetails.head.ref : null;
        if (!branchName) {
            failSetup(ticketKey, inputFolder, 'Could not determine branch from PR details');
        }
        try {
            gitOps.checkoutPRBranch(branchName, config.workingDir, config.git.baseBranch);
        } catch (e) {
            failSetup(ticketKey, inputFolder, 'Failed to checkout branch: ' + e.toString());
        }

        const baseBranch = prDetails.base ? prDetails.base.ref : config.git.baseBranch;

        // Step 4.4: Optionally sync the PR's base branch with its own upstream — see
        // syncBaseBranchIfConfigured() docblock for the rationale.
        syncBaseBranchIfConfigured(baseBranch, customParams, config);

        // Step 4.5: Merge base branch and detect conflicts.
        // Always merges origin/{baseBranch} so the branch stays up to date.
        // If conflicts exist, writes merge_conflicts.md to the input folder.
        //
        // This MUST run before Step 4.6 (setup commands): setupCommands typically builds
        // and tests the repo (e.g. `mvn clean verify`), and the PR branch itself can be
        // arbitrarily stale relative to baseBranch — including fixes to the very tests
        // setupCommands runs (a flaky/broken test fixed on baseBranch stays broken on any
        // PR branch forked before that fix, until the PR branch is brought up to date).
        // Running the merge first means setup commands validate the code the CLI agent is
        // about to work on top of (merged, even if only staged/uncommitted), not a stale
        // pre-merge snapshot — this is the "auto-update the branch on every rework run"
        // behavior that should hold out of the box, not depend on someone remembering to
        // rebase the PR branch manually.
        const conflictFiles = gitOps.detectMergeConflicts(baseBranch, inputFolder, config.workingDir);

        // Step 4.6: Run project-specific prerequisite/setup commands (e.g. install
        // JDK/Maven, verify build credentials) before the CLI agent starts fixing code.
        try {
            var setupResult = setupCommands.runSetupCommands(customParams, config.workingDir);
            var setupWarnings = setupCommands.buildSetupWarningsMarkdown(setupResult);
            if (setupWarnings) {
                try {
                    file_write({ path: inputFolder + '/setup_warnings.md', content: setupWarnings });
                    console.log('⚠️ Wrote setup_warnings.md (non-fatal setup command failure(s))');
                } catch (writeErr) {
                    console.warn('Failed to write setup_warnings.md:', writeErr);
                }
            }
        } catch (e) {
            failSetup(ticketKey, inputFolder, 'Environment setup failed: ' + (e && e.toString ? e.toString() : String(e)));
        }

        // Step 4.7: Detect failed CI checks — writes ci_failures.md if any failed
        const headSha = prDetails.head ? prDetails.head.sha : null;
        const failedChecks = gh.detectFailedChecks(scm, headSha, inputFolder, config.scm && config.scm.jenkinsBasePath);

        // Step 5: Diff + discussions (human-readable + raw with IDs)
        const diff = gitOps.getPRDiff(baseBranch, branchName, config.workingDir);

        console.log('Fetching PR discussions...');
        const discussionData = gh.fetchDiscussionsAndRawData(scm, pr.number);

        // Step 6: Write all context files
        gitOps.writePRContext(inputFolder, prDetails, diff, discussionData.markdown, discussionData.rawThreads);

        // Step 7: Fetch question subtasks with answers
        try {
            fetchQuestionsToInput.action(actualParams);
        } catch (e) {
            console.warn('Failed to fetch questions (non-fatal):', e);
        }

        // Step 8: Jira comment
        try {
            var jiraComment = 'h3. 🔧 Automated Rework Started\n\n' +
                '*Pull Request*: [PR #' + prDetails.number + '|' + prDetails.html_url + ']\n' +
                '*Branch*: {code}' + branchName + '{code}\n\n';

            if (conflictFiles.length > 0) {
                jiraComment += '{panel:bgColor=#FFEBE6|borderColor=#DE350B}' +
                    '⚠️ *Merge conflicts detected* — ' + conflictFiles.length + ' file(s) must be resolved before rework can be applied:\n' +
                    conflictFiles.map(function(f) { return '* {code}' + f + '{code}'; }).join('\n') +
                    '{panel}\n\n';
            }

            if (failedChecks.length > 0) {
                jiraComment += '{panel:bgColor=#FFEBE6|borderColor=#DE350B}' +
                    '⚠️ *CI checks failing* — ' + failedChecks.length + ' check(s) must pass before merge:\n' +
                    failedChecks.map(function(c) { return '* {code}' + c.name + '{code}'; }).join('\n') +
                    '\nError logs: {code}ci_failures.md{code} (summary) and {code}ci_failures_full.log{code} (full logs).' +
                    '{panel}\n\n';
            }

            jiraComment += 'AI Teammate is fixing issues raised in the code review.\n\n' +
                '_Fix results will be posted shortly..._';

            jira_post_comment({ key: ticketKey, comment: jiraComment });
        } catch (e) {
            console.warn('Failed to post Jira comment:', e);
        }

        console.log('✅ Rework setup complete — branch:', branchName, '| PR #' + prDetails.number);

        // Enrich input with [BA]/[SA]/[VD] context from parent siblings
        try {
            fetchParentContextToInput.action(params);
        } catch (e) {
            console.warn('fetchParentContextToInput failed (non-fatal):', e);
        }

        return {
            success: true,
            prNumber: prDetails.number,
            prUrl: prDetails.html_url,
            branchName: branchName,
            owner: repoInfo.owner,
            repo: repoInfo.repo
        };

    } catch (error) {
        console.error('❌ Error in preCliReworkSetup:', error);
        try {
            const ticketKey = (params.inputFolderPath ||
                (params.jobParams && params.jobParams.inputFolderPath) || '').split('/').pop();
            if (ticketKey) {
                jira_post_comment({
                    key: ticketKey,
                    comment: 'h3. ❌ Rework Setup Error\n\n{code}' + truncateForComment(error.toString()) + '{code}'
                });
            }
        } catch (e) {
            console.error('Failed to post rework setup error comment:', e && e.toString ? e.toString() : String(e));
        }
        return { success: false, error: error.toString() };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action, syncBaseBranchIfConfigured, truncateForComment };
}
