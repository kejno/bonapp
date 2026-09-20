import { getPullRequest, getRunById, WorkflowRun } from './github-actions';

const RUN_ID = process.env.CI_PULL_REQUEST_RUN_ID ?? process.env.CI_WORKFLOW_RUN_ID;
const PR_NUMBER = process.env.CI_PULL_REQUEST_NUMBER;
const ALL_INPUTS_PROVIDED = !!(RUN_ID && PR_NUMBER);

describe('BNP-326: CI pipeline passes for clean PR — all 4 jobs green, PR unblocked', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    if (!ALL_INPUTS_PROVIDED) return;
    run = await getRunById(RUN_ID!);
  });

  const itAll = ALL_INPUTS_PROVIDED ? it : it.skip;

  itAll('is a completed successful pull request workflow run', () => {
    expect(run.event).toBe('pull_request');
    expect(run.status).toBe('completed');
    expect(run.conclusion).toBe('success');
    if (process.env.GITHUB_SHA) {
      expect(run.headSha).toBe(process.env.GITHUB_SHA);
    }
  });

  itAll('completes lint, typecheck, test and build jobs successfully', () => {
    for (const jobName of ['Lint', 'Typecheck', 'Unit tests', 'Build']) {
      const job = run.jobs.find((candidate) =>
        candidate.name.startsWith(jobName),
      );
      expect(job).toMatchObject({ status: 'completed', conclusion: 'success' });
    }
  });

  itAll('PR is mergeable and not blocked by branch protection', async () => {
    const pr = await getPullRequest(PR_NUMBER!);
    expect(pr.number).toBe(Number(PR_NUMBER));
    expect(pr.mergeable).toBe(true);
    expect(pr.mergeableState).toBe('clean');
  });
});
