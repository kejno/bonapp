/**
 * Prepare PR for Review Action (preCliJSAction for pr_review agent)
 * 1. Finds PR associated with the ticket
 * 2. Checks out the PR branch
 * 3. Writes input folder: pr_info.md, pr_diff.txt, pr_discussions.md, pr_discussions_raw.json
 * 4. Posts "Review Started" comment to Jira
 */

var configLoader = require('./configLoader.js');
const gh = require('./common/githubHelpers.js');
const gitOps = require('./common/gitOps.js');
const fetchParentContextToInput = require('./fetchParentContextToInput.js');

var REVIEWED_SHA_MARKER_RE = /<!--\s*pr_review:reviewed_sha=([0-9a-f]{7,40})\s*-->/;

/**
 * Finds the head SHA our own review last ran against, by scanning general PR
 * comments for the hidden marker postPRReviewComments.js embeds on every
 * posted review. Returns null on the PR's first review (no marker yet) — the
 * caller then falls back to the full base...head diff.
 */
function findLastReviewedSha(scm, prNumber) {
    try {
        var comments = scm.getPrComments(prNumber) || [];
        for (var i = comments.length - 1; i >= 0; i--) {
            var body = comments[i] && comments[i].body;
            if (!body) continue;
            var match = REVIEWED_SHA_MARKER_RE.exec(body);
            if (match) return match[1];
        }
    } catch (e) {
        console.warn('Could not scan PR comments for last-reviewed SHA marker:', e.message || e);
    }
    return null;
}

function action(params) {
    try {
        const inputFolder = params.inputFolderPath;
        const ticketKey = inputFolder.split('/').pop();
        var config = configLoader.loadProjectConfig(params.jobParams || params);
        var scm = configLoader.createScm(config);

        console.log('=== Preparing PR for review:', ticketKey, '===');
        console.log('Input folder:', inputFolder);
        console.log('Configured repository:', config.repository && config.repository.owner && config.repository.repo
            ? config.repository.owner + '/' + config.repository.repo
            : '(fallback to git remote)');
        console.log('Configured working directory:', config.workingDir || '(not set)');
        console.log('Configured base branch:', config.git && config.git.baseBranch ? config.git.baseBranch : '(not set)');

        // Step 1: GitHub repo info — prefer targetRepository from config over git remote
        var repoInfo = null;
        if (config.repository && config.repository.owner && config.repository.repo) {
            repoInfo = { owner: config.repository.owner, repo: config.repository.repo };
            console.log('Using targetRepository from config:', repoInfo.owner + '/' + repoInfo.repo);
        } else {
            console.log('Target repository not configured, resolving from git remote...');
            repoInfo = scm.getRemoteRepoInfo();
        }
        if (!repoInfo) {
            const err = 'Could not determine GitHub repository from git remote';
            console.error('PR review setup failed at repository resolution:', err);
            try { jira_post_comment({ key: ticketKey, comment: 'h3. ⚠️ PR Review Setup Failed\n\n' + err + '\n\n_Review cancelled — no PR to review._' }); } catch (e) {}
            return false;
        }
        console.log('Resolved repository:', repoInfo.owner + '/' + repoInfo.repo);

        // Step 2: Find PR
        console.log('Searching for open PR associated with ticket:', ticketKey);
        var prSearchOptions = config.prSearchFn ? { prSearchFn: config.prSearchFn } : {};
        const pr = gh.findPRForTicket(scm, ticketKey, prSearchOptions);
        if (!pr) {
            console.warn('No open PR found for ticket:', ticketKey);
            try {
                jira_post_comment({
                    key: ticketKey,
                    comment: 'h3. ⚠️ PR Review Setup Failed\n\n' +
                        'Could not find an open Pull Request associated with *' + ticketKey + '*.\n\n' +
                        'Please ensure:\n' +
                        '* A PR has been created with the ticket key in the title or branch name\n' +
                        '* The PR is open and accessible\n\n' +
                        '_Review cancelled — no PR to review._'
                });
            } catch (e) {}
            return false;
        }
        console.log('Found PR candidate #' + pr.number + ' with title: ' + (pr.title || '(no title)'));
        console.log('PR head branch:', pr.head && pr.head.ref ? pr.head.ref : '(missing)');

        // Step 3: PR details
        console.log('Fetching details for PR #' + pr.number + '...');
        const prDetails = gh.getPRDetails(scm, pr.number);
        if (!prDetails) {
            console.error('Failed to fetch PR details for PR #' + pr.number);
            try {
                jira_post_comment({
                    key: ticketKey,
                    comment: 'h3. ⚠️ PR Review Setup Failed\n\nCould not fetch details for PR #' + pr.number + '.\n\n_Review cancelled._'
                });
            } catch (e) {}
            return false;
        }
        console.log('Loaded PR details for #' + prDetails.number +
            ' | head=' + (prDetails.head && prDetails.head.ref ? prDetails.head.ref : '(missing)') +
            ' | base=' + (prDetails.base && prDetails.base.ref ? prDetails.base.ref : '(missing)') +
            ' | changed_files=' + (prDetails.changed_files || 0));

        // Step 4: Checkout PR branch
        const branchName = prDetails.head ? prDetails.head.ref : null;
        try {
            if (branchName) {
                console.log('Checking out PR branch:', branchName, 'workingDir:', config.workingDir || '(default)');
                gitOps.checkoutPRBranch(branchName, config.workingDir, config.git.baseBranch);
                console.log('Checkout completed for branch:', branchName);
            } else {
                console.warn('PR details did not include a head branch; checkout skipped');
            }
        } catch (e) {
            console.warn('Could not checkout PR branch:', e);
        }

        // Step 5: Diff + discussions (human-readable + raw with IDs)
        const baseBranch = prDetails.base ? prDetails.base.ref : config.git.baseBranch;
        console.log('Generating PR diff with base branch:', baseBranch, 'and head branch:', branchName || '(missing)');
        const diff = gitOps.getPRDiff(baseBranch, branchName || (prDetails.head && prDetails.head.ref), config.workingDir);
        console.log('Loaded PR diff characters:', diff ? diff.length : 0);

        console.log('Fetching PR discussions...');
        const discussionData = gh.fetchDiscussionsAndRawData(scm, pr.number);
        console.log('Fetched PR discussions markdown characters:', discussionData && discussionData.markdown ? discussionData.markdown.length : 0);
        console.log('Fetched PR discussion threads:', discussionData && discussionData.rawThreads ? discussionData.rawThreads.length : 0);

        // Step 6: Write all context files
        console.log('Writing PR context files to:', inputFolder);
        gitOps.writePRContext(inputFolder, prDetails, diff, discussionData.markdown, discussionData.rawThreads);
        console.log('PR context files written successfully');

        // Step 6.4: Incremental diff since our last review round (rework loop scoping).
        // First review on a PR has no marker yet — lastReviewedSha stays null and the
        // agent instructions fall back to reviewing the full pr_diff.txt.
        var lastReviewedSha = findLastReviewedSha(scm, pr.number);
        var isRereview = !!lastReviewedSha;
        console.log(isRereview
            ? 'Found last-reviewed SHA marker: ' + lastReviewedSha + ' — computing incremental diff'
            : 'No last-reviewed SHA marker found — this is the first review round');

        if (isRereview) {
            var incrementalDiff = gitOps.getIncrementalDiff(lastReviewedSha, branchName || (prDetails.head && prDetails.head.ref), config.workingDir);
            if (incrementalDiff !== null) {
                var incrementalNote = incrementalDiff === ''
                    ? '# Incremental Diff Since Last Review\n\nNo new commits since the last reviewed commit (' + lastReviewedSha + ').\n'
                    : gitOps.trimLargeTextForInput(incrementalDiff, 'Incremental Diff Since Last Review', 12000);
                gitOps.writeInputFile(inputFolder + '/incremental_diff.txt', incrementalNote, 'incremental_diff.txt');
            } else {
                console.warn('Incremental diff unavailable (SHA unreachable) — agent will fall back to full pr_diff.txt');
            }
        }

        try {
            var roundNote = isRereview
                ? '\n- **Review round**: re-review after rework — last reviewed commit `' + lastReviewedSha + '`. See `incremental_diff.txt` for what actually changed since then.\n'
                : '\n- **Review round**: first review on this PR.\n';
            file_write({ path: inputFolder + '/pr_info.md', content: file_read({ path: inputFolder + '/pr_info.md' }) + roundNote });
        } catch (e) {
            console.warn('Could not append review-round note to pr_info.md:', e);
        }

        // Step 6.5: Detect failed CI checks
        var headSha = prDetails.head ? prDetails.head.sha : null;
        console.log('Detecting failed checks for head SHA:', headSha || '(missing)');
        var failedChecks = gh.detectFailedChecks(scm, headSha, inputFolder, config.scm && config.scm.jenkinsBasePath);
        console.log('Detected failed checks:', failedChecks.length);

        // Step 7: Jira comment
        try {
            var jiraComment = 'h3. 🔍 Automated PR Review Started\n\n' +
                '*Pull Request*: [PR #' + prDetails.number + '|' + prDetails.html_url + ']\n' +
                '*Branch*: {code}' + (branchName || 'unknown') + '{code}\n' +
                '*Files Changed*: ' + (prDetails.changed_files || 0) + '\n\n';

            if (failedChecks.length > 0) {
                jiraComment += '{panel:bgColor=#FFEBE6|borderColor=#DE350B}' +
                    '⚠️ *CI checks failing* — ' + failedChecks.length + ' check(s) did not pass:\n' +
                    failedChecks.map(function(c) { return '* {code}' + c.name + '{code}'; }).join('\n') +
                    '\nError logs: {code}ci_failures.md{code} (summary) and {code}ci_failures_full.log{code} (full logs).' +
                    '{panel}\n\n';
            }

            jiraComment += 'AI Code Reviewer is analyzing the pull request for:\n' +
                '* 🔒 Security vulnerabilities\n' +
                '* 🏗️ Code quality & OOP principles\n' +
                '* ✅ Task alignment with requirements\n' +
                '* 🧪 Testing adequacy\n\n' +
                '_Review results will be posted shortly..._';

            jira_post_comment({ key: ticketKey, comment: jiraComment });
            console.log('Posted "review started" comment to Jira ticket:', ticketKey);
        } catch (e) {
            console.warn('Failed to post review started comment:', e);
        }

        console.log('✅ PR review setup completed — PR #' + prDetails.number);

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
        console.error('❌ Error in preparePRForReview:', error);
        try {
            const ticketKey = params.inputFolderPath.split('/').pop();
            jira_post_comment({
                key: ticketKey,
                comment: 'h3. ❌ PR Review Setup Error\n\n{code}' + error.toString() + '{code}'
            });
        } catch (e) {}
        return false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { action, findLastReviewedSha };
}
