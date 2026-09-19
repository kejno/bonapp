// A failed Jira query in any stage must not prevent later development,
// review, and merge rules from running in the same SM pass.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'smAgent.js'), 'utf8');
const searched = [];
const config = { repository: { owner: 'test', repo: 'test' }, jira: { project: 'BNP' } };
const context = {
  module: { exports: {} },
  console,
  require(id) {
    if (id === './configLoader.js') return {
      loadProjectConfig: () => config,
      interpolateJql: (jql) => jql
    };
    if (id === './common/buildEncodedConfig.js') return {
      resolveConfigFile: (rule) => rule.configFile
    };
    return {};
  },
  file_read: () => JSON.stringify({ params: { postJSAction: 'unused.js' } }),
  jira_search_by_jql({ jql }) {
    searched.push(jql);
    if (jql === 'broken') throw new Error('simulated Jira failure');
    return [];
  }
};
vm.runInNewContext(source, context);

const result = context.module.exports.action({ jobParams: { rules: [
  { description: 'Blocked check', jql: 'broken', configFile: 'blocked.json', localExecution: true },
  { description: 'Development', jql: 'development', configFile: 'development.json', localExecution: true },
  { description: 'PR review', jql: 'review', configFile: 'review.json', localExecution: true },
  { description: 'Merge', jql: 'merge', configFile: 'merge.json', localExecution: true }
] } });

assert.deepStrictEqual(searched, ['broken', 'development', 'review', 'merge']);
assert.strictEqual(result.success, false);
assert.strictEqual(result.ruleErrors.length, 1);
assert.strictEqual(result.ruleErrors[0].rule, 'Blocked check');
console.log('SM rule isolation checks passed');
