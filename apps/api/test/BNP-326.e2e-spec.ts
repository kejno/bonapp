import { getRunById, WorkflowRun } from './github-actions';

const RUN_ID = process.env.CI_PULL_REQUEST_RUN_ID ?? process.env.CI_WORKFLOW_RUN_ID;

describe('BNP-326: CI pipeline passes for clean PR — all 4 jobs green, PR unblocked', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    if (!RUN_ID) return;
    run = await getRunById(RUN_ID);
  });

  const itRun = RUN_ID ? it : it.skip;

  itRun('is a completed successful pull request workflow run', () => {
    expect(run.event).toBe('pull_request');
    expect(run.status).toBe('completed');
    expect(run.conclusion).toBe('success');
    if (process.env.GITHUB_SHA) {
      expect(run.headSha).toBe(process.env.GITHUB_SHA);
    }
  });

  itRun('completes lint, typecheck, test and build jobs successfully', () => {
    for (const jobName of ['Lint', 'Typecheck', 'Unit tests', 'Build']) {
      const job = run.jobs.find((candidate) =>
        candidate.name.startsWith(jobName),
      );
      expect(job).toMatchObject({ status: 'completed', conclusion: 'success' });
    }
  });
});
