import { getRunById, WorkflowRun } from './github-actions';

const RUN_ID = process.env.CI_PUSH_RUN_ID ?? process.env.CI_WORKFLOW_RUN_ID;
const HEAD_SHA = process.env.CI_PUSH_HEAD_SHA;
const ALL_INPUTS_PROVIDED = !!(RUN_ID && HEAD_SHA);

describe('BNP-329: CI автоматически запускается при push в main без создания PR', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    if (!ALL_INPUTS_PROVIDED) return;
    run = await getRunById(RUN_ID);
  });

  const itAll = ALL_INPUTS_PROVIDED ? it : it.skip;

  itAll(
    'was triggered by a push to main and matches the controlled run',
    () => {
      expect(run.event).toBe('push');
      expect(run.headBranch).toBe('main');
      expect(run.headSha).toBe(HEAD_SHA);
    },
  );

  itAll('completes the workflow and all required jobs successfully', () => {
    expect(run).toMatchObject({ status: 'completed', conclusion: 'success' });

    for (const jobName of ['Lint', 'Typecheck', 'Unit tests', 'Build']) {
      const job = run.jobs.find((candidate) =>
        candidate.name.startsWith(jobName),
      );
      expect(job).toMatchObject({ status: 'completed', conclusion: 'success' });
    }
  });
});
