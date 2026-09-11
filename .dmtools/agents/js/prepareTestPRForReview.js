/**
 * Prepare Test PR For Review Action (preJSAction for test-automation review agents)
 * Same as preparePRForReview.js but specifically targets test/{TICKET-KEY} branches,
 * not feature ai/{TICKET-KEY} branches.
 *
 * Runs as preJSAction so that returning `false` skips the whole agent when the PR is
 * already merged or has no changes.
 *
 * A Test Case ticket has no branch of its own — its automated test lives in its
 * parent Story's test/{STORY-KEY} PR alongside the other Test Cases for that Story
 * (e.g. tests/e2e/BNP-17.spec.ts, BNP-18.spec.ts, BNP-19.spec.ts all in
 * test/BNP-16). So for a Test Case ticket, resolve the branch/PR via its linked
 * Story rather than building test/{TICKET-KEY} from the Test Case's own key.
 */

var configLoader = require('./configLoader.js');
const gh = require('./common/githubHelpers.js');
const gitOps = require('./common/gitOps.js');
var prHelper = require('./common/pullRequest.js');
const { LABELS } = require('./config.js');

function findBranchKeyForTicket(ticketKey, jiraConfig) {
    try {
        const ticket = jira_get_ticket({ key: ticketKey });
        const issueType = ticket && ticket.fields && ticket.fields.issuetype && ticket.fields.issuetype.name;
        if (issueType !== jiraConfig.issueTypes.TEST_CASE) {
            return ticketKey;
        }

        const issueLinks = ticket.fields.issuelinks;
        if (Array.isArray(issueLinks)) {
            for (var i = 0; i < issueLinks.length; i++) {
                var other = issueLinks[i].outwardIssue || issueLinks[i].inwardIssue;
                if (other && other.fields && other.fields.issuetype &&
                    other.fields.issuetype.name === jiraConfig.issueTypes.STORY) {
                    console.log('Resolved parent Story', other.key, 'for Test Case', ticketKey);
                    return other.key;
                }
            }
        }

        const stories = jira_search_by_jql({
            jql: 'issue in linkedIssues("' + ticketKey + '") AND issuetype = "' + jiraConfig.issueTypes.STORY + '"',
            maxResults: 1
        }) || [];
        if (stories.length > 0) {
            console.log('Resolved parent Story', stories[0].key, 'for Test Case', ticketKey, 'via linkedIssues');
            return stories[0].key;
        }

        console.warn('No linked Story found for Test Case', ticketKey, '— falling back to its own key');
        return ticketKey;
    } catch (e) {
        console.warn('Failed to resolve branch key for', ticketKey, ':', e);
        return ticketKey;
    }
}

function getTicketKey(params) {
    if (params.ticket && params.ticket.key) {
        return params.ticket.key;
    }
    if (params.inputFolderPath) {
        return params.inputFolderPath.split('/').pop();
    }
    if (params.jobParams && params.jobParams.inputFolderPath) {
        return params.jobParams.inputFolderPath.split('/').pop();
    }
    throw new Error('Cannot determine ticket key from params.ticket.key or params.inputFolderPath');
}

function getInputFolder(params, ticketKey) {
    if (params.inputFolderPath) {
        return params.inputFolderPath;
    }
    return 'input/' + ticketKey;
}

function ensureInputFolder(inputFolder) {
    try {
        cli_execute_command({ command: 'bash -c "mkdir -p ' + inputFolder + '"' });
    } catch (e) {
        console.warn('Could not create input folder:', e);
    }
}

function findTestPRForTicket(scm, ticketKey) {
    try {
        const branchName = 'test/' + ticketKey;
        console.log('Searching for PR on branch:', branchName);

        const openPRs = scm.listPrs('open');
        const openMatch = openPRs.filter(function(pr) {
            return pr.head && pr.head.ref && pr.head.ref === branchName;
        });
        if (openMatch.length > 0) {
            console.log('Found open test PR #' + openMatch[0].number);
            return { pr: openMatch[0], merged: false };
        }

        const closedPRs = scm.listPrs('closed');
        const mergedMatch = closedPRs.filter(function(pr) {
            return pr.head && pr.head.ref && pr.head.ref === branchName && pr.merged_at;
        });
        if (mergedMatch.length > 0) {
            console.log('Found already-merged test PR #' + mergedMatch[0].number);
            return { pr: mergedMatch[0], merged: true };
        }

        console.warn('No PR found for test branch:', branchName);
        return null;
    } catch (e) {
        console.error('Failed to find test PR:', e);
        return null;
    }
}

function clearStaleReviewOutputs() {
    try {
        cli_execute_command({
            command: 'rm -f outputs/pr_review.json outputs/response.md outputs/pr_review_general.md && rm -rf outputs/pr_review_comments'
        });
        console.log('✅ Cleared stale review outputs');
    } catch (e) {
        console.warn('Could not clear stale review outputs:', e);
    }
}

function isNoCommitsError(error) {
    const msg = error && error.toString ? error.toString() : String(error);
    return msg.indexOf('No commits between') !== -1 ||
           msg.indexOf('no commits between') !== -1;
}

function getIssueType(params) {
    try {
        return params.ticket.fields.issuetype.name;
    } catch (e) {
        return null;
    }
}

function isWip(pr, ticket) {
    if (pr && (pr.draft || (pr.title && /^\s*(WIP|DRAFT)\b/i.test(pr.title)))) {
        return true;
    }
    if (ticket && ticket.labels) {
        const labels = Array.isArray(ticket.labels) ? ticket.labels : (ticket.labels.value || []);
        for (var i = 0; i < labels.length; i++) {
            if (/_(wip|draft)$/i.test(labels[i]) || /^(wip|draft)$/i.test(labels[i])) {
                return true;
            }
        }
    }
    return false;
}

function resolveFinalStatus(currentStatus, issueType, jiraConfig) {
    // Test Cases finish in Passed/Failed; Stories and Bugs stay in In Testing
    // so the done-check agents (checkStoryTestsPassed / checkBugTestsPassed)
    // can evaluate all linked Test Cases and move to Done / Bug To Fix / Ready For Testing.
    if (issueType === jiraConfig.issueTypes.TEST_CASE) {
        return currentStatus === jiraConfig.statuses.IN_REVIEW_FAILED
            ? jiraConfig.statuses.FAILED
            : jiraConfig.statuses.PASSED;
    }
    return jiraConfig.statuses.IN_TESTING;
}

function markTestPrMerged(ticketKey) {
    try {
        jira_add_label({ key: ticketKey, label: LABELS.TEST_PR_MERGED });
        console.log('Added label', LABELS.TEST_PR_MERGED, 'to', ticketKey);
    } catch (e) {
        console.warn('Could not add test_pr_merged label:', e);
    }
}

// Anti-cycle guard (see config.js comment on TEST_PR_FINALIZED): without this,
// the "In Testing Stories with an open test PR → review" SM rule matches on
// Jira status alone, ignores whether a PR/branch still exists, and re-triggers
// review on an already-finalized Story. The review agent then finds no PR and
// no branch (both correctly deleted here) and wrongly concludes the ticket
// needs full re-automation, bouncing it to In Rework. Observed on BNP-23.
// MUST be called only AFTER jira_move_to_status succeeds: adding it before a
// failing status move leaves the ticket finalized-but-not-moved (stuck in
// In Review - Passed), and the anti-cycle skip then blocks every retry,
// stranding it forever. Observed on BNP-31/32/33.
function markTestPrFinalized(ticketKey) {
    try {
        jira_add_label({ key: ticketKey, label: LABELS.TEST_PR_FINALIZED });
        console.log('Added label', LABELS.TEST_PR_FINALIZED, 'to', ticketKey);
    } catch (e) {
        console.warn('Could not add test_pr_finalized label:', e);
    }
}

function finalizeAlreadyMergedTestCase(ticketKey, branchName, issueType, jiraConfig) {
    try {
        markTestPrMerged(ticketKey);
        const ticket = jira_get_ticket({ key: ticketKey });
        const currentStatus = ticket && ticket.fields && ticket.fields.status
            ? ticket.fields.status.name
            : '';
        const finalStatus = resolveFinalStatus(currentStatus, issueType, jiraConfig);
        jira_move_to_status({ key: ticketKey, statusName: finalStatus });
        markTestPrFinalized(ticketKey);
        jira_post_comment({
            key: ticketKey,
            comment: 'h3. ✅ Test Code Already Merged\n\n' +
                'Branch {code}' + branchName + '{code} has no commits ahead of main, so the test code is already in main.\n\n' +
                'Moved ticket to *' + finalStatus + '* and removed the stale branch.'
        });
        console.log('✅ Branch has no commits ahead of main — moved', ticketKey, 'to', finalStatus);
        try {
            cli_execute_command({ command: 'git push origin --delete ' + branchName });
            console.log('✅ Deleted stale branch:', branchName);
        } catch (delErr) {
            console.warn('Could not delete stale branch', branchName + ':', delErr);
        }
    } catch (e) {
        console.warn('Failed to finalize already-merged test case:', e);
    }
}

function action(params) {
    try {
        const ticketKey = getTicketKey(params);
        const inputFolder = getInputFolder(params, ticketKey);
        const issueType = getIssueType(params);
        var config = configLoader.loadProjectConfig(params.jobParams || params);
        var jiraConfig = config.jira;
        var scm = configLoader.createScm(config);

        console.log('=== Preparing test PR for review:', ticketKey, '===');

        // Anti-cycle guard: the SM rule that triggers this agent matches on Jira
        // status alone (see sm.json's "In Testing Stories with an open test PR"
        // rule), so it re-fires on a Story/TC whose test PR was already finalized
        // and whose branch was already deleted. Without this check, finding no PR
        // and no branch here gets misread as "needs re-automation" and the ticket
        // is wrongly bounced to In Rework (observed on BNP-23). Fetch fresh
        // rather than trusting params.ticket, which may be a stale JQL-search
        // snapshot taken before a previous run added this label.
        try {
            const freshTicket = jira_get_ticket({ key: ticketKey });
            const ticketLabels = (freshTicket && freshTicket.fields && freshTicket.fields.labels) || [];
            if (ticketLabels.indexOf(LABELS.TEST_PR_FINALIZED) !== -1) {
                console.log('Ticket already has', LABELS.TEST_PR_FINALIZED, '— test PR review already finalized, skipping');
                return false;
            }
        } catch (e) {
            console.warn('Could not check finalized label (continuing):', e);
        }

        ensureInputFolder(inputFolder);
        clearStaleReviewOutputs();

        // Step 1: GitHub repo info
        var repoInfo = scm.getRemoteRepoInfo();
        if (!repoInfo) {
            const err = 'Could not determine repository from git remote';
            try { jira_post_comment({ key: ticketKey, comment: 'h3. ⚠️ Test PR Review Setup Failed\n\n' + err + '\n\n_Review cancelled._' }); } catch (e) {}
            return false;
        }

        // Step 2: Find PR on test/{KEY} branch specifically — resolved via the
        // linked Story when ticketKey is a Test Case (see findBranchKeyForTicket).
        const branchKey = findBranchKeyForTicket(ticketKey, jiraConfig);
        var found = findTestPRForTicket(scm, branchKey);
        if (!found) {
            // No open/merged PR — check if the test branch exists on remote
            const branchName = 'test/' + branchKey;
            console.log('No PR found. Checking if branch exists on remote:', branchName);
            var branchExists = false;
            try {
                const lsOutput = cli_execute_command({ command: 'git ls-remote --heads origin ' + branchName }) || '';
                branchExists = lsOutput.indexOf('refs/heads/' + branchName) !== -1;
            } catch (e) {
                console.warn('Could not check remote branch:', e);
            }

            if (!branchExists) {
                // No branch at all — needs re-automation from scratch
                const err = 'No test PR and no remote branch found for test/' + ticketKey + '. Ticket needs re-automation.';
                try {
                    jira_post_comment({ key: ticketKey, comment: 'h3. ⚠️ Test PR Review Setup Failed\n\n' + err + '\n\n_Moving to In Rework so it can be re-automated._' });
                    jira_move_to_status({ key: ticketKey, statusName: jiraConfig.statuses.IN_REWORK });
                } catch (e) {}
                return false;
            }

            // Branch exists — create a new PR/MR so review can proceed
            console.log('Branch exists but no PR — creating PR for review...');
            try {
                const ticket = jira_get_ticket({ key: ticketKey });
                const summary = ticket && ticket.fields ? (ticket.fields.summary || ticketKey) : ticketKey;
                const prTitle = configLoader.formatTemplate(config.formats.prTitle.testAutomation, {ticketKey: ticketKey, ticketSummary: summary});

                const prResult = prHelper.createPullRequest({
                    scm: scm,
                    title: prTitle,
                    branchName: branchName,
                    baseBranch: config.git.baseBranch,
                    bodyContent: 'Auto-created PR for test automation review.\n\nTicket: ' + ticketKey
                });
                if (!prResult || !prResult.success) {
                    throw new Error((prResult && prResult.error) || 'Failed to create PR/MR');
                }

                console.log('✅ Created new PR/MR for review:', prResult.prUrl || '(URL unknown)');
                // Re-fetch so downstream code gets a consistent PR shape from the SCM.
                found = findTestPRForTicket(scm, branchKey);
                if (!found) {
                    throw new Error('PR was created but could not be found immediately after creation');
                }
            } catch (createErr) {
                if (isNoCommitsError(createErr)) {
                    console.log('Branch ' + branchName + ' has no commits ahead of main — test code is already merged.');
                    finalizeAlreadyMergedTestCase(ticketKey, branchName, issueType, jiraConfig);
                    return false;
                }
                const err = 'Branch ' + branchName + ' exists but could not create PR: ' + createErr.toString();
                try { jira_post_comment({ key: ticketKey, comment: 'h3. ⚠️ Test PR Review Setup Failed\n\n' + err + '\n\n_Review cancelled._' }); } catch (e) {}
                return false;
            }
        }

        // If PR is already merged — move ticket to final status without re-reviewing
        if (found.merged) {
            const pr = found.pr;
            markTestPrMerged(ticketKey);
            try {
                const ticket = jira_get_ticket({ key: ticketKey });
                const currentStatus = ticket && ticket.fields && ticket.fields.status
                    ? ticket.fields.status.name : '';
                const finalStatus = resolveFinalStatus(currentStatus, issueType, jiraConfig);
                jira_move_to_status({ key: ticketKey, statusName: finalStatus });
                markTestPrFinalized(ticketKey);
                jira_post_comment({
                    key: ticketKey,
                    comment: 'h3. ✅ Test PR Already Merged\n\n' +
                        'PR [#' + pr.number + '|' + pr.html_url + '] for branch {code}test/' + ticketKey + '{code} was already merged.\n\n' +
                        'Skipping re-review — moved ticket to *' + finalStatus + '*.'
                });
                console.log('✅ PR already merged — moved', ticketKey, 'to', finalStatus);
            } catch (e) {
                console.warn('Failed to handle already-merged PR:', e);
            }
            return false;
        }

        const pr = found.pr;

        // Skip WIP / draft PRs
        if (isWip(pr, params.ticket)) {
            console.log('PR #' + pr.number + ' is WIP/draft — skipping review for', ticketKey);
            try {
                jira_post_comment({
                    key: ticketKey,
                    comment: 'h3. ⏸️ Test PR Review Skipped\n\nPR [#' + pr.number + '|' + (pr.html_url || '') + '] is WIP/draft. Review will run once it is ready.'
                });
            } catch (e) {}
            return false;
        }

        // Step 3: PR details
        const prDetails = gh.getPRDetails(scm, pr.number);
        if (!prDetails) {
            try { jira_post_comment({ key: ticketKey, comment: 'h3. ⚠️ Test PR Review Setup Failed\n\nCould not fetch details for PR #' + pr.number + '.\n\n_Review cancelled._' }); } catch (e) {}
            return false;
        }

        const branchName = prDetails.head ? prDetails.head.ref : null;

        // If the PR has no actual changes, the test code is already in main. Finalize and skip review.
        var changedFiles = prDetails.changed_files;
        if (typeof changedFiles === 'number' && changedFiles === 0) {
            console.log('PR #' + pr.number + ' has 0 changed files — test code is already in main');
            finalizeAlreadyMergedTestCase(ticketKey, branchName || ('test/' + branchKey), issueType, jiraConfig);
            return false;
        }

        // Step 4: Checkout test branch
        try {
            if (branchName) {
                gitOps.checkoutPRBranch(branchName, config.workingDir, config.git.baseBranch);
            }
        } catch (e) {
            console.warn('Could not checkout test branch:', e);
        }

        // Step 5: Diff + discussions
        const baseBranch = prDetails.base ? prDetails.base.ref : config.git.baseBranch;
        const diff = gitOps.getPRDiff(baseBranch, branchName || (prDetails.head && prDetails.head.ref));

        console.log('Fetching PR discussions...');
        const discussionData = gh.fetchDiscussionsAndRawData(scm, pr.number);

        // Step 6: Write context files
        gitOps.writePRContext(inputFolder, prDetails, diff, discussionData.markdown, discussionData.rawThreads);

        // Step 7: Jira comment
        try {
            jira_post_comment({
                key: ticketKey,
                comment: 'h3. 🧪 Automated Test PR Review Started\n\n' +
                    '*Pull Request*: [PR #' + prDetails.number + '|' + prDetails.html_url + ']\n' +
                    '*Branch*: {code}' + (branchName || 'unknown') + '{code}\n' +
                    '*Files Changed*: ' + (prDetails.changed_files || 0) + '\n\n' +
                    '_Test code review results will be posted shortly..._'
            });
        } catch (e) {
            console.warn('Failed to post Jira comment:', e);
        }

        console.log('✅ Test PR review setup complete — PR #' + prDetails.number);

        return {
            success: true,
            prNumber: prDetails.number,
            prUrl: prDetails.html_url,
            branchName: branchName,
            owner: repoInfo.owner,
            repo: repoInfo.repo
        };

    } catch (error) {
        console.error('❌ Error in prepareTestPRForReview:', error);
        try {
            const ticketKey = getTicketKey(params);
            jira_post_comment({
                key: ticketKey,
                comment: 'h3. ❌ Test PR Review Setup Error\n\n{code}' + error.toString() + '{code}'
            });
        } catch (e) {}
        return false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action };
}
