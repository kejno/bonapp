import {
  getCompletedWorkflowRuns,
  getWorkflowLogs,
  WorkflowRun,
} from './github-actions';

describe('BNP-330: Second CI run uses npm and Turborepo cache', () => {
  let latestRun: WorkflowRun;
  let previousRun: WorkflowRun;
  let logs: string;

  beforeAll(async () => {
    [latestRun, previousRun] = await getCompletedWorkflowRuns('push', 2);
    logs = await getWorkflowLogs(latestRun.databaseId);
  });

  const JOB_NAMES = ['Lint', 'Typecheck', 'Unit tests', 'Build'];
  const hasCacheHit = (jobName: string, cacheKey: string) =>
    logs
      .split('\n')
      .some(
        (line) =>
          line.startsWith(`${jobName} (Node`) &&
          line.includes(`Cache hit for: ${cacheKey}`),
      );

  it('compares two completed successful push runs', () => {
    expect(latestRun.conclusion).toBe('success');
    expect(previousRun.conclusion).toBe('success');
    expect(
      new Date(latestRun.updatedAt).getTime() -
        new Date(latestRun.createdAt).getTime(),
    ).toBeLessThan(
      new Date(previousRun.updatedAt).getTime() -
        new Date(previousRun.createdAt).getTime(),
    );
  });

  it.each(JOB_NAMES)(
    'job "%s" reports an npm cache hit in its real log',
    (jobName) => {
      expect(hasCacheHit(jobName, 'node-cache')).toBe(true);
    },
  );

  it.each(JOB_NAMES)(
    'job "%s" reports a Turborepo cache hit in its real log',
    (jobName) => {
      expect(hasCacheHit(jobName, 'turbo-')).toBe(true);
    },
  );
});
