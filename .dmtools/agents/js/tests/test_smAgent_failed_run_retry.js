const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rules = require('../../sm.json').params.jobParams.rules;
const rule = (file, description) => rules.find((r) =>
  r.configFile === file && r.description === description);
const generator = 'agents/test_cases_generator.json';
const developmentRetry = rule('agents/story_development.json',
  'In Development Stories with an interrupted development run → retry');
assert(developmentRetry);
assert(developmentRetry.jql.includes("status = 'In Development'"));
assert(developmentRetry.jql.includes("labels = 'sm_story_development_triggered'"));
assert(rules.indexOf(developmentRetry) < rules.findIndex((r) => r.configFile === 'agents/pr_review.json'));
const storyStart = rule(generator, 'Merged Stories → Ready For Testing + generate test cases');
const storyRetry = rule(generator, 'Ready For Testing Stories with unfinished test case generation → retry');
const storyAutomation = rule('agents/story_test_automation.json',
  'Ready For Testing Stories → automate linked test cases in bulk');
const storyReview = rules.find((r) => r.configFile === 'agents/pr_story_test_automation_review.json');
const bugReview = rules.find((r) => r.configFile === 'agents/pr_bug_test_automation_review.json');
const mergedRecovery = rules.find((r) => r.configFile === 'agents/recover_merged_pr.json');
const bugAutomation = rules.find((r) => r.configFile === 'agents/bug_test_automation.json');
assert(storyReview.jql.includes("'test_pr_finalized'"));
assert(bugReview.jql.includes("'test_pr_finalized'"));
assert(mergedRecovery.jql.includes("'test_pr_finalized'"));
assert(bugAutomation.skipIfLabels.includes('test_pr_finalized'));

assert(storyRetry);
assert.strictEqual(storyStart.targetStatus, 'Ready For Testing');
assert.strictEqual(storyStart.addLabel, 'sm_test_cases_triggered');
assert(storyRetry.jql.includes("labels = 'sm_test_cases_triggered'"));
assert(rules.indexOf(storyRetry) < rules.indexOf(storyAutomation));
assert(storyAutomation.skipIfLabels.includes('sm_test_cases_triggered'));

const bugGenerator = rule('agents/bug_test_cases_generator.json',
  'Ready For Testing Bugs → generate test cases');
const bugRetry = rule('agents/bug_merged.json',
  'Ready For Testing Bugs with unfinished merge summary → retry');
assert(bugGenerator);
assert(bugRetry);
assert(bugRetry.jql.includes("labels = 'sm_bug_merged_triggered'"));
assert(rules.indexOf(bugRetry) < rules.indexOf(bugGenerator));
assert(!bugGenerator.jql.includes('sm_bug_test_cases_triggered'));
assert(bugGenerator.skipIfLabels.includes('sm_bug_test_cases_triggered'));
assert(bugGenerator.skipIfLabels.includes('sm_bug_test_cases_done'));

const source = fs.readFileSync(path.join(__dirname, '..', 'smAgent.js'), 'utf8');
const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'ai-teammate.yml'), 'utf8');
assert(workflow.includes("startsWith(inputs.concurrency_key, 'test-pr-')"));
assert(workflow.includes("format('ai-teammate-agent-{0}', inputs.concurrency_key)"));
assert(workflow.includes('name: Team'));
assert(workflow.includes('inputs.agent_name || inputs.config_file'));
assert(workflow.includes("format(':{0}', inputs.display_key)"));
assert(workflow.includes("format(',lock:{0}', inputs.lock_display_key || inputs.concurrency_key)"));
assert(source.includes("lock_display_key: concurrencyKey.replace(/^test-pr-/, '')"));
const context = {
  module: { exports: {} },
  console,
  require: () => ({}),
  jira_get_ticket: () => ({
    fields: {
      issuelinks: [{ inwardIssue: {
        key: 'BNP-122',
        fields: { issuetype: { name: 'Story' } }
      } }]
    }
  }),
  jira_search_by_jql: () => []
};
vm.runInNewContext(source + '\nthis.hasActiveTargetWorkflowRun = hasActiveTargetWorkflowRun;' +
  '\nthis.resolveRuleConcurrencyKey = resolveRuleConcurrencyKey;', context);

const testReviewRule = rule('agents/pr_test_automation_review.json',
  'In Review Test Cases → trigger pr_test_automation_review');
const testReworkRule = rule('agents/pr_test_automation_rework.json',
  'In Rework Test Cases → trigger pr_test_automation_rework');
assert.strictEqual(context.resolveRuleConcurrencyKey(testReviewRule, 'BNP-329', {
  fields: { parent: { key: 'BNP-122' } }
}), 'test-pr-BNP-122');
assert.strictEqual(context.resolveRuleConcurrencyKey(testReworkRule, 'BNP-330', {
  fields: {}
}), 'test-pr-BNP-122');
assert(testReviewRule.skipIfLabels.includes('ai_pr_reviewed'));

const active = (run) => ({ listWorkflowRuns: (status) =>
  status === 'in_progress' ? { workflow_runs: [run] } : { workflow_runs: [] } });
const configFile = 'agents/test_cases_generator.json';
const ticket = 'BNP-123';
assert(context.hasActiveTargetWorkflowRun(active({
  name: 'AI Teammate',
  display_title: '[claude] Team (test_cases_generator · BNP-123)'
}), 'ai-teammate.yml', configFile, ticket));
assert(context.hasActiveTargetWorkflowRun(active({
  name: 'agents/test_cases_generator.json : BNP-123'
}), 'ai-teammate.yml', configFile, ticket));
assert(!context.hasActiveTargetWorkflowRun(active({
  display_title: '[claude] AI Teammate (agents/test_cases_generator.json · BNP-124)'
}), 'ai-teammate.yml', configFile, ticket));
assert(context.hasActiveTargetWorkflowRun(active({
  display_title: '[codex-2] AI Teammate (agents/pr_test_automation_review.json · BNP-329 · lock:test-pr-BNP-122)'
}), 'ai-teammate.yml', 'agents/pr_test_automation_rework.json', 'test-pr-BNP-122'));
assert(context.hasActiveTargetWorkflowRun(active({
  display_title: '[claude] Team (pr_test_automation_rework:BNP-313,lock:BNP-121)'
}), 'ai-teammate.yml', 'agents/pr_test_automation_review.json', 'test-pr-BNP-121'));

const reworkConfig = require('../../pr_test_automation_rework.json');
const qualityGates = reworkConfig.params.customParams.feedbackLoop.qualityGates.gates;
assert.deepStrictEqual(qualityGates.map((gate) => gate.name), ['lint', 'typecheck', 'test', 'build']);

const jiraActions = [];
global.jira_add_label = (args) => jiraActions.push({ action: 'add', ...args });
global.jira_remove_label = (args) => jiraActions.push({ action: 'remove', ...args });
global.jira_move_to_status = (args) => jiraActions.push({ action: 'move', ...args });
const reviewPostAction = require('../postTestReviewComments.js');
const normalize = (value) => String(value || '').toUpperCase() === 'APPROVE' ? 'APPROVE' : 'BLOCK';
const coordinator = reviewPostAction.applySharedPrVerdicts({
  perTestCase: {
    'BNP-326': 'BLOCK',
    'BNP-328': 'BLOCK',
    'BNP-329': 'APPROVE',
    'BNP-330': 'APPROVE'
  }
}, 'BNP-329', { statuses: { IN_REWORK: 'In Rework' } }, normalize);
assert.strictEqual(coordinator, 'BNP-326');
assert(jiraActions.some((entry) => entry.action === 'move' && entry.key === 'BNP-326'));
assert(!jiraActions.some((entry) => entry.action === 'move' && entry.key === 'BNP-328'));
assert(jiraActions.some((entry) => entry.action === 'add' && entry.key === 'BNP-328'));
assert(jiraActions.some((entry) => entry.action === 'add' && entry.key === 'BNP-330'));
delete global.jira_add_label;
delete global.jira_remove_label;
delete global.jira_move_to_status;

console.log('SM failed-run retry checks passed');
