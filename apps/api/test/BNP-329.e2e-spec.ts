import { getCompletedWorkflowRuns, WorkflowRun } from './github-actions';

describe('BNP-329: CI автоматически запускается при push в main без создания PR', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    [run] = await getCompletedWorkflowRuns('push');
  });

  it('was triggered by a push to main', () => {
    expect(run.event).toBe('push');
    expect(run.headBranch).toBe('main');
  });

  it('completes the workflow and all required jobs successfully', () => {
    expect(run).toMatchObject({ status: 'completed', conclusion: 'success' });

    for (const jobName of ['Lint', 'Typecheck', 'Unit tests', 'Build']) {
      const job = run.jobs.find((candidate) =>
        candidate.name.startsWith(jobName),
      );
      expect(job).toMatchObject({ status: 'completed', conclusion: 'success' });
    }
  });
});
