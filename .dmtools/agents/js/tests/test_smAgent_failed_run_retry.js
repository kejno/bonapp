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
const context = {
  module: { exports: {} },
  console,
  require: () => ({})
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
  fields: { parent: { key: 'BNP-122' } }
}), 'test-pr-BNP-122');

const active = (run) => ({ listWorkflowRuns: (status) =>
  status === 'in_progress' ? { workflow_runs: [run] } : { workflow_runs: [] } });
const configFile = 'agents/test_cases_generator.json';
const ticket = 'BNP-123';
assert(context.hasActiveTargetWorkflowRun(active({
  name: 'AI Teammate',
  display_title: '[claude] AI Teammate (agents/test_cases_generator.json · BNP-123)'
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

console.log('SM failed-run retry checks passed');
