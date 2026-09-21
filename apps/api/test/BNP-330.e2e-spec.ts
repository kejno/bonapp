import { getRunById, getWorkflowLogs, WorkflowRun } from './github-actions';

const FIRST_RUN_ID = process.env.CI_FIRST_PUSH_RUN_ID;
const SECOND_RUN_ID = process.env.CI_SECOND_PUSH_RUN_ID;
const FIRST_HEAD_SHA = process.env.CI_FIRST_PUSH_HEAD_SHA;
const SECOND_HEAD_SHA = process.env.CI_SECOND_PUSH_HEAD_SHA;
const ALL_INPUTS_PROVIDED = !!(
  FIRST_RUN_ID &&
  SECOND_RUN_ID &&
  FIRST_HEAD_SHA &&
  SECOND_HEAD_SHA
);

describe('BNP-330: Second CI run uses npm and Turborepo cache', () => {
  let firstRun: WorkflowRun;
  let secondRun: WorkflowRun;
  let secondRunLogs: string;

  beforeAll(async () => {
    if (!ALL_INPUTS_PROVIDED) return;
    [firstRun, secondRun] = await Promise.all([
      getRunById(FIRST_RUN_ID),
      getRunById(SECOND_RUN_ID),
    ]);
    secondRunLogs = await getWorkflowLogs(secondRun.databaseId);
  });

  const itBothRuns = ALL_INPUTS_PROVIDED ? it : it.skip;
  const JOB_NAMES = ['Lint', 'Typecheck', 'Unit tests', 'Build'];

  // setup-node outputs "Cache restored successfully" for its built-in npm cache;
  // actions/cache outputs "Cache hit for: node-cache-..."
  const hasNpmCacheHit = (jobName: string) =>
    secondRunLogs.split('\n').some(
      (line) =>
        line.startsWith(`${jobName} (Node`) &&
        (line.includes('Cache restored successfully') ||
          line.includes('Cache hit for: node-cache')),
    );

  const hasTurboCacheHit = (jobName: string) =>
    secondRunLogs.split('\n').some(
      (line) =>
        line.startsWith(`${jobName} (Node`) &&
        line.includes('Cache hit for: turbo-'),
    );

  itBothRuns(
    'both controlled runs are push-to-main events with same revision and correct order',
    () => {
      expect(firstRun.event).toBe('push');
      expect(firstRun.headBranch).toBe('main');
      expect(firstRun.conclusion).toBe('success');
      expect(firstRun.headSha).toBe(FIRST_HEAD_SHA);

      expect(secondRun.event).toBe('push');
      expect(secondRun.headBranch).toBe('main');
      expect(secondRun.conclusion).toBe('success');
      expect(secondRun.headSha).toBe(SECOND_HEAD_SHA);

      // both runs must be from the same revision — proves this is a cold→warm cache pair,
      // not two arbitrary runs from different commits with different dependency states
      expect(firstRun.headSha).toBe(secondRun.headSha);

      // first run must predate second run to confirm cold→warm cache order
      expect(new Date(firstRun.createdAt).getTime()).toBeLessThan(
        new Date(secondRun.createdAt).getTime(),
      );
    },
  );

  itBothRuns(
    'second run (with cache) completes faster than first run (cold cache)',
    () => {
      const firstDuration =
        new Date(firstRun.updatedAt).getTime() -
        new Date(firstRun.createdAt).getTime();
      const secondDuration =
        new Date(secondRun.updatedAt).getTime() -
        new Date(secondRun.createdAt).getTime();
      expect(secondDuration).toBeLessThan(firstDuration);
    },
  );

  itBothRuns.each(JOB_NAMES)(
    'job "%s" reports an npm cache hit in the second-run log',
    (jobName) => {
      expect(hasNpmCacheHit(jobName)).toBe(true);
    },
  );

  itBothRuns.each(JOB_NAMES)(
    'job "%s" reports a Turborepo cache hit in the second-run log',
    (jobName) => {
      expect(hasTurboCacheHit(jobName)).toBe(true);
    },
  );
});
