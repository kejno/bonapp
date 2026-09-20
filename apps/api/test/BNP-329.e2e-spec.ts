import { getCompletedWorkflowRuns, WorkflowRun } from './github-actions';

const RUN_ID = process.env.CI_PUSH_RUN_ID ?? process.env.CI_WORKFLOW_RUN_ID;

describe('BNP-329: CI автоматически запускается при push в main без создания PR', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    if (!RUN_ID) return;
    [run] = await getCompletedWorkflowRuns('push');
  });

  const itRun = RUN_ID ? it : it.skip;

  itRun(
    'was triggered by a push to main and matches the controlled run',
    () => {
      expect(run.event).toBe('push');
      expect(run.headBranch).toBe('main');
      if (process.env.GITHUB_SHA) {
        expect(run.headSha).toBe(process.env.GITHUB_SHA);
      }
    },
  );

  itRun('completes the workflow and all required jobs successfully', () => {
    expect(run).toMatchObject({ status: 'completed', conclusion: 'success' });

    for (const jobName of ['Lint', 'Typecheck', 'Unit tests', 'Build']) {
      const job = run.jobs.find((candidate) =>
        candidate.name.startsWith(jobName),
      );
      expect(job).toMatchObject({ status: 'completed', conclusion: 'success' });
    }
  });
});
