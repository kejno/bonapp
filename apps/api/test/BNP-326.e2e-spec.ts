import { getCompletedWorkflowRuns, WorkflowRun } from './github-actions';

describe('BNP-326: CI pipeline passes for clean PR — all 4 jobs green, PR unblocked', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    [run] = await getCompletedWorkflowRuns('pull_request');
  });

  it('is a completed successful pull request workflow run', () => {
    expect(run.event).toBe('pull_request');
    expect(run.status).toBe('completed');
    expect(run.conclusion).toBe('success');
  });

  it('completes lint, typecheck, test and build jobs successfully', () => {
    for (const jobName of ['Lint', 'Typecheck', 'Unit tests', 'Build']) {
      const job = run.jobs.find((candidate) =>
        candidate.name.startsWith(jobName),
      );
      expect(job).toMatchObject({ status: 'completed', conclusion: 'success' });
    }
  });
});
