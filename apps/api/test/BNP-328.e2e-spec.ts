import {
  downloadArtifact,
  getCompletedWorkflowRuns,
  getRunArtifacts,
  WorkflowRun,
} from './github-actions';

describe('BNP-328: Build artifacts available for download after successful CI', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    [run] = await getCompletedWorkflowRuns('push');
  });

  it('uses a completed successful CI run', () => {
    expect(run.conclusion).toBe('success');
  });

  it('downloads a non-expired build artifact', async () => {
    const artifacts = await getRunArtifacts(run.databaseId);
    const artifact = artifacts.find(
      (candidate) => candidate.name.startsWith('build-') && !candidate.expired,
    );

    expect(artifact).toBeDefined();
    expect(
      await downloadArtifact(run.databaseId, artifact!.name),
    ).toBeGreaterThan(0);
  });
});
