import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const CI_WORKFLOW_PATH = path.join(
  __dirname,
  '../../../.github/workflows/ci.yml',
);

describe('BNP-328: Build artifacts available for download after successful CI', () => {
  let workflow: Record<string, any>;

  beforeAll(() => {
    const content = fs.readFileSync(CI_WORKFLOW_PATH, 'utf-8');
    workflow = yaml.load(content) as Record<string, any>;
  });

  it('build job exists', () => {
    expect(workflow.jobs).toHaveProperty('build');
  });

  it('build job has upload-artifact step', () => {
    const steps: any[] = workflow.jobs.build?.steps ?? [];
    const uploadStep = steps.find(
      (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'),
    );
    expect(uploadStep).toBeDefined();
  });

  it('upload-artifact step specifies artifact name and path', () => {
    const steps: any[] = workflow.jobs.build?.steps ?? [];
    const uploadStep = steps.find(
      (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'),
    );
    expect(uploadStep?.with?.name).toBeDefined();
    expect(uploadStep?.with?.path).toBeDefined();
  });

  it('upload-artifact covers apps dist output', () => {
    const steps: any[] = workflow.jobs.build?.steps ?? [];
    const uploadStep = steps.find(
      (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'),
    );
    const artifactPath: string = uploadStep?.with?.path ?? '';
    expect(artifactPath).toMatch(/dist/);
  });

  it('artifact upload fails if no files found (if-no-files-found: error)', () => {
    const steps: any[] = workflow.jobs.build?.steps ?? [];
    const uploadStep = steps.find(
      (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'),
    );
    expect(uploadStep?.with?.['if-no-files-found']).toBe('error');
  });
});
