// Isolated logic check for smAgent.js's per-provider workflow budget.
// Loads the real file via vm so we can reach its non-exported helper
// functions directly, without mocking Jira/GitHub.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join(__dirname, '..', 'smAgent.js');
const src = fs.readFileSync(file, 'utf8');

// smAgent.js does NOT read AI_AGENT_PROVIDER from the OS environment — an
// earlier version tried java.lang.System.getenv (the same pattern
// configLoader.js's DEFAULT_TRACKER lookup uses) but a live SM run proved
// `java` itself is not defined in dmtools' JSRunner GraalJS context
// (ReferenceError, silently swallowed by the try/catch — the same failure
// class as `process is not defined` before THAT). It now reads
// jobParams.aiAgentProvider through the module-level configuredProviderList,
// set once by action(). Tests reach it via the exposed
// setConfiguredProviderList() helper below rather than an env/java stub.
const ctx = {
  require: (m) => {
    // Stub out real dependencies smAgent.js requires at module scope —
    // we only need the pure budget-math functions, never call action().
    return new Proxy({}, { get: () => () => ({}) });
  },
  module: { exports: {} },
  console,
  process,
};
vm.createContext(ctx);
// Expose every top-level function to the test by appending a return block —
// wrap the whole script's top level as an IIFE-like eval, then pull names
// off ctx via a trailing statement block.
const expose = `
;globalThis.__t = {
  buildWorkflowBudget, providerBudgetBucket, pickProviderWithBudget,
  resolveRuleProvider, defaultProviderList, parseProviderFromRunName,
  isWorkflowBudgetExhausted, parseProviderListValue,
  setConfiguredProviderList: function(v) { configuredProviderList = v; },
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

console.log('=== fair-share dispatch across one SM pass (the actual user-facing requirement) ===');
{
  // The scenario that motivated fair-share picking: with 3+ eligible tickets
  // in ONE pass and {claude-code: 2, codex: 1}, codex must get its dispatch
  // in THIS pass — not sit idle until claude-code's larger budget drains
  // first (which a plain "first provider with any room" rule would do,
  // since claude-code always has room until its very last slot).
  //
  // Mirrors processRule's real per-ticket loop: pick → dispatch (assumed to
  // succeed) → decrement that provider's bucket, then repeat for the next
  // ticket — exercising pickProviderWithBudget() the exact way
  // resolveRuleProvider() and the processRule decrement block call it.
  const budget = t.buildWorkflowBudget({ 'claude-code': 2, codex: 1 }, {});
  const providers = ['claude-code', 'codex'];
  const assignments = [];
  for (let i = 0; i < 3; i++) {
    const chosen = t.pickProviderWithBudget(providers, budget);
    assignments.push(chosen);
    if (chosen) {
      const bucket = t.providerBudgetBucket(budget, chosen);
      bucket.remaining -= 1;
    }
  }
  check('3 tickets against {claude-code:2, codex:1} → codex used within this SAME pass, not after claude-code exhausts',
    assignments.includes('codex'));
  check('exact fair-share assignment order is [claude-code, codex, claude-code]',
    JSON.stringify(assignments) === JSON.stringify(['claude-code', 'codex', 'claude-code']));
  check('both budgets fully (and only) consumed after 3 tickets',
    t.providerBudgetBucket(budget, 'claude-code').remaining === 0 &&
    t.providerBudgetBucket(budget, 'codex').remaining === 0);

  // A 4th ticket in the same pass: both exhausted → no provider left to pick.
  check('a 4th ticket with both exhausted → null (nothing left to assign)',
    t.pickProviderWithBudget(providers, budget) === null);
}

console.log('=== resolveRuleProvider ===');
{
  const budget = t.buildWorkflowBudget({ 'claude-code': 5, codex: 1 }, {});
  check('rule.provider takes priority over configured list',
    t.resolveRuleProvider({ provider: 'codex' }, budget) === 'codex');

  t.setConfiguredProviderList(['claude-code']);
  check('single-value list, no rule.provider → that single value',
    t.resolveRuleProvider({}, budget) === 'claude-code');

  t.setConfiguredProviderList(['codex', 'claude-code']);
  check('comma list, budget has room on first entry → first entry',
    t.resolveRuleProvider({}, t.buildWorkflowBudget({ 'claude-code': 5, codex: 5 }, {})) === 'codex');

  const tightBudget = t.buildWorkflowBudget({ codex: 0, 'claude-code': 5 }, {});
  // codex:0 is dropped by normalizePositiveInt (not > 0), so it never enters byProvider —
  // meaning it reads as "unlimited" via the unlisted-provider path, NOT exhausted.
  // Assert that documented behavior explicitly rather than assuming.
  check('a 0 cap is dropped, not treated as "always exhausted"',
    t.resolveRuleProvider({}, tightBudget) === 'codex');

  t.setConfiguredProviderList(null);
}

console.log('=== defaultProviderList / parseProviderListValue (jobParams.aiAgentProvider) ===');
{
  // This is the bug two earlier attempts hit in sequence on a live SM run:
  // first `process.env` (no `process` global under dmtools' GraalJS
  // JSRunner), then `java.lang.System.getenv` (no `java` global there
  // either — the try/catch silently swallowed BOTH ReferenceErrors, so
  // vm-based unit tests that stubbed process/java kept passing for the
  // wrong reason while the real SM run always fell back to the single-item
  // ['claude-code'] default and never reached pickProviderWithBudget() at
  // all). It now reads jobParams.aiAgentProvider, set once by action() into
  // configuredProviderList — not looked up per-call from any runtime global.
  t.setConfiguredProviderList(null);
  check('unset → default single-item list',
    JSON.stringify(t.defaultProviderList()) === JSON.stringify(['claude-code']));

  check('parseProviderListValue: empty/falsy → null', t.parseProviderListValue('') === null);
  check('parseProviderListValue: plain value → single-item list',
    JSON.stringify(t.parseProviderListValue('codex')) === JSON.stringify(['codex']));
  check('parseProviderListValue: comma list (with spaces) → trimmed multi-item list',
    JSON.stringify(t.parseProviderListValue('claude-code, codex')) === JSON.stringify(['claude-code', 'codex']));

  t.setConfiguredProviderList(['codex']);
  check('configured list is returned as-is once set',
    JSON.stringify(t.defaultProviderList()) === JSON.stringify(['codex']));

  t.setConfiguredProviderList(null);
}

console.log('=== parseProviderFromRunName ===');
{
  check('tagged run name', t.parseProviderFromRunName({ name: '[codex] AI Teammate (agents/po_refinement.json)' }) === 'codex');
  check('untagged legacy run name falls back to claude-code',
    t.parseProviderFromRunName({ name: 'AI Teammate (agents/po_refinement.json)' }) === 'claude-code');
  // Current ai-teammate.yml run-name shows the shortened "claude" label
  // (readability in the Actions run list) but the real provider value used
  // for budget lookups everywhere else is "claude-code" — the parser must
  // map it back, or providerBudgetBucket(budget, 'claude') would silently
  // miss the 'claude-code' bucket sm.json's maxTriggeredWorkflows configures.
  check('current "claude" display label maps back to the real provider value "claude-code"',
    t.parseProviderFromRunName({ name: '[claude] AI Teammate (x)' }) === 'claude-code');
  check('display_title used when name absent',
    t.parseProviderFromRunName({ display_title: '[claude] AI Teammate (x)' }) === 'claude-code');
  // A run dispatched before this label change still has the old literal
  // "claude-code" tag baked into its already-created run-name (GitHub does
  // not retroactively rewrite it) — must keep resolving correctly too.
  check('old literal "claude-code" tag (pre-label-change runs) still resolves correctly',
    t.parseProviderFromRunName({ name: '[claude-code] AI Teammate (x)' }) === 'claude-code');
}

console.log();
if (failures) {
  console.log(failures + ' check(s) FAILED');
  process.exit(1);
}
console.log('All budget logic checks passed');
