import {
  downloadArtifactFiles,
  getRunArtifacts,
  getRunById,
  WorkflowRun,
} from './github-actions';

const RUN_ID = process.env.CI_PUSH_RUN_ID ?? process.env.CI_WORKFLOW_RUN_ID;
const HEAD_SHA = process.env.CI_PUSH_HEAD_SHA;
const ALL_INPUTS_PROVIDED = !!(RUN_ID && HEAD_SHA);

describe('BNP-328: Build artifacts available for download after successful CI', () => {
  let run: WorkflowRun;

  beforeAll(async () => {
    if (!ALL_INPUTS_PROVIDED) return;
    run = await getRunById(RUN_ID);
  });

  const itRun = ALL_INPUTS_PROVIDED ? it : it.skip;

  itRun(
    'uses a completed successful push-to-main CI run for the controlled revision',
    () => {
      expect(run.event).toBe('push');
      expect(run.headBranch).toBe('main');
      expect(run.conclusion).toBe('success');
      expect(run.headSha).toBe(HEAD_SHA);
    },
  );

  itRun('downloads a non-expired build artifact containing dist/ files', async () => {
    const artifacts = await getRunArtifacts(run.databaseId);
    const artifact = artifacts.find(
      (candidate) => candidate.name.startsWith('build-') && !candidate.expired,
    );

    expect(artifact).toBeDefined();

    const files = await downloadArtifactFiles(run.databaseId, artifact!.name);
    expect(files.length).toBeGreaterThan(0);

    const distFiles = files.filter((f) =>
      f.split('/').includes('dist') || f.split('\\').includes('dist'),
    );
    expect(distFiles.length).toBeGreaterThan(0);
  });
});
