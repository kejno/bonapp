import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const CI_WORKFLOW_PATH = path.join(
  __dirname,
  '../../../.github/workflows/ci.yml',
);

describe('BNP-329: CI автоматически запускается при push в main без создания PR', () => {
  let workflow: Record<string, any>;

  beforeAll(() => {
    const content = fs.readFileSync(CI_WORKFLOW_PATH, 'utf-8');
    workflow = yaml.load(content) as Record<string, any>;
  });

  it('workflow file is valid', () => {
    expect(workflow).toBeDefined();
  });

  it('triggers on push event', () => {
    expect(workflow.on?.push).toBeDefined();
  });

  it('push trigger targets the main branch', () => {
    const branches: string[] = workflow.on?.push?.branches ?? [];
    expect(branches).toContain('main');
  });

  it('push trigger is independent from pull_request (both present)', () => {
    expect(workflow.on?.push).toBeDefined();
    expect(workflow.on?.pull_request).toBeDefined();
  });
});
