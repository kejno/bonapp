// Isolated logic check for smAgent.js's per-provider workflow budget.
// Loads the real file via vm so we can reach its non-exported helper
// functions directly, without mocking Jira/GitHub.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join(__dirname, '..', 'smAgent.js');
const src = fs.readFileSync(file, 'utf8');

// smAgent.js reads AI_AGENT_PROVIDER via java.lang.System.getenv (GraalJS
// interop), not process.env — there is no `process` global in dmtools'
// actual JSRunner engine (that mismatch is exactly the bug this test caught:
// ReferenceError: process is not defined killed every SM rule after the
// first one that called resolveRuleProvider() in a real run). Stub `java`
// here so defaultProviderList()'s real code path — including its
// try/catch around the getenv call — is what gets exercised, with
// fakeJavaEnv as the mutable backing store the test cases below write to.
const fakeJavaEnv = {};
const ctx = {
  require: (m) => {
    // Stub out real dependencies smAgent.js requires at module scope —
    // we only need the pure budget-math functions, never call action().
    return new Proxy({}, { get: () => () => ({}) });
  },
  module: { exports: {} },
  console,
  process,
  java: {
    lang: {
      System: {
        getenv: (name) => (name in fakeJavaEnv ? fakeJavaEnv[name] : null),
      },
    },
  },
};
vm.createContext(ctx);
// Expose every top-level function to the test by appending a return block —
// wrap the whole script's top level as an IIFE-like eval, then pull names
// off ctx via a trailing statement block.
const expose = `
;globalThis.__t = {
  buildWorkflowBudget, providerBudgetBucket, pickProviderWithBudget,
  resolveRuleProvider, defaultProviderList, parseProviderFromRunName,
  isWorkflowBudgetExhausted
};
`;
vm.runInContext(src + expose, ctx, { filename: file });
const t = ctx.globalThis ? ctx.globalThis.__t : ctx.__t;

let failures = 0;
function check(label, cond) {
  if (cond) { console.log('  ok  ', label); }
  else { failures++; console.log('  FAIL', label); }
}

console.log('=== buildWorkflowBudget ===');
{
  const b1 = t.buildWorkflowBudget(2, {});
  check('plain number → combined budget, no perProviderCaps', b1.initial === 2 && !b1.perProviderCaps);

  const b2 = t.buildWorkflowBudget({ 'claude-code': 5, codex: 1 }, {});
  check('object → perProviderCaps true', b2.perProviderCaps === true);
  check('object → initial is SUM (6)', b2.initial === 6);
  check('object → claude-code bucket = 5', b2.byProvider['claude-code'].initial === 5);
  check('object → codex bucket = 1', b2.byProvider['codex'].initial === 1);

  const b3 = t.buildWorkflowBudget(undefined, {});
  check('undefined → null', b3 === null);
}

console.log('=== providerBudgetBucket aliasing (no per-provider caps) ===');
{
  const budget = t.buildWorkflowBudget(2, {});
  const bucketA = t.providerBudgetBucket(budget, 'claude-code');
  const bucketB = t.providerBudgetBucket(budget, 'codex');
  check('non-per-provider: both providers alias the SAME object', bucketA === budget && bucketB === budget);
  bucketA.remaining -= 1;
  check('decrementing one is visible on the other (shared pool)', bucketB.remaining === 1);
}

console.log('=== providerBudgetBucket independence (per-provider caps) ===');
{
  const budget = t.buildWorkflowBudget({ 'claude-code': 5, codex: 1 }, {});
  const claude = t.providerBudgetBucket(budget, 'claude-code');
  const codex = t.providerBudgetBucket(budget, 'codex');
  check('per-provider: buckets are DIFFERENT objects', claude !== codex);
  codex.remaining -= 1;
  check('draining codex does not touch claude-code', claude.remaining === 5);
  check('codex now exhausted', codex.remaining === 0);

  const unlisted = t.providerBudgetBucket(budget, 'some-other-provider');
  check('provider absent from the map gets an unlimited bucket', unlisted.remaining === Infinity);
}

console.log('=== pickProviderWithBudget ===');
{
  const budget = t.buildWorkflowBudget({ 'claude-code': 5, codex: 1 }, {});
  check('first listed provider wins when both have budget',
    t.pickProviderWithBudget(['claude-code', 'codex'], budget) === 'claude-code');

  // Exhaust codex, leave claude-code fresh — reversed order should now pick codex... no,
  // it should SKIP codex (exhausted) and fall through to claude-code.
  const codexBucket = t.providerBudgetBucket(budget, 'codex');
  codexBucket.remaining = 0;
  check('exhausted first-listed provider is skipped in favor of the next',
    t.pickProviderWithBudget(['codex', 'claude-code'], budget) === 'claude-code');

  const budget2 = t.buildWorkflowBudget({ codex: 1 }, {});
  const codexBucket2 = t.providerBudgetBucket(budget2, 'codex');
  codexBucket2.remaining = 0;
  check('every listed provider exhausted → null', t.pickProviderWithBudget(['codex'], budget2) === null);

  check('no budget object at all → first provider (unbounded)', t.pickProviderWithBudget(['codex', 'claude-code'], null) === 'codex');
}

console.log('=== resolveRuleProvider ===');
{
  const budget = t.buildWorkflowBudget({ 'claude-code': 5, codex: 1 }, {});
  check('rule.provider takes priority over env list',
    t.resolveRuleProvider({ provider: 'codex' }, budget) === 'codex');

  fakeJavaEnv.AI_AGENT_PROVIDER = 'claude-code';
  check('single-value env, no rule.provider → that single value',
    t.resolveRuleProvider({}, budget) === 'claude-code');

  fakeJavaEnv.AI_AGENT_PROVIDER = 'codex,claude-code';
  check('comma list, budget has room on first entry → first entry',
    t.resolveRuleProvider({}, t.buildWorkflowBudget({ 'claude-code': 5, codex: 5 }, {})) === 'codex');

  const tightBudget = t.buildWorkflowBudget({ codex: 0, 'claude-code': 5 }, {});
  // codex:0 is dropped by normalizePositiveInt (not > 0), so it never enters byProvider —
  // meaning it reads as "unlimited" via the unlisted-provider path, NOT exhausted.
  // Assert that documented behavior explicitly rather than assuming.
  check('a 0 cap is dropped, not treated as "always exhausted"',
    t.resolveRuleProvider({}, tightBudget) === 'codex');

  delete fakeJavaEnv.AI_AGENT_PROVIDER;
}

console.log('=== defaultProviderList (java.lang.System.getenv interop) ===');
{
  // This is the exact bug a live SM run hit: smAgent.js used `process.env`,
  // which does not exist under dmtools' GraalJS JSRunner — every rule after
  // the first one to call resolveRuleProvider() failed with "process is not
  // defined" and the whole cycle stopped dispatching. Assert the real
  // interop path (java.lang.System.getenv, wrapped in try/catch, coerced
  // through String()) end to end rather than only the pure list-math.
  delete fakeJavaEnv.AI_AGENT_PROVIDER;
  check('getenv returns null (unset) → default single-item list',
    JSON.stringify(t.defaultProviderList()) === JSON.stringify(['claude-code']));

  fakeJavaEnv.AI_AGENT_PROVIDER = 'codex';
  check('getenv returns a plain value → single-item list',
    JSON.stringify(t.defaultProviderList()) === JSON.stringify(['codex']));

  fakeJavaEnv.AI_AGENT_PROVIDER = 'claude-code, codex';
  check('getenv returns a comma list (with spaces) → trimmed multi-item list',
    JSON.stringify(t.defaultProviderList()) === JSON.stringify(['claude-code', 'codex']));

  delete fakeJavaEnv.AI_AGENT_PROVIDER;
}

console.log('=== parseProviderFromRunName ===');
{
  check('tagged run name', t.parseProviderFromRunName({ name: '[codex] AI Teammate (agents/po_refinement.json)' }) === 'codex');
  check('untagged legacy run name falls back to claude-code',
    t.parseProviderFromRunName({ name: 'AI Teammate (agents/po_refinement.json)' }) === 'claude-code');
  check('display_title used when name absent',
    t.parseProviderFromRunName({ display_title: '[claude-code] AI Teammate (x)' }) === 'claude-code');
}

console.log();
if (failures) {
  console.log(failures + ' check(s) FAILED');
  process.exit(1);
}
console.log('All budget logic checks passed');
