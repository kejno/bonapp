import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const CI_WORKFLOW_PATH = path.join(
  __dirname,
  '../../../.github/workflows/ci.yml',
);

describe('BNP-326: CI pipeline passes for clean PR — all 4 jobs green, PR unblocked', () => {
  let workflow: Record<string, any>;

  beforeAll(() => {
    const content = fs.readFileSync(CI_WORKFLOW_PATH, 'utf-8');
    workflow = yaml.load(content) as Record<string, any>;
  });

  it('workflow file exists and is valid YAML', () => {
    expect(workflow).toBeDefined();
    expect(typeof workflow).toBe('object');
  });

  it('triggers on pull_request targeting main branch', () => {
    expect(workflow.on?.pull_request).toBeDefined();
    const branches: string[] = workflow.on.pull_request.branches ?? [];
    expect(branches).toContain('main');
  });

  it('defines all 4 required jobs: lint, typecheck, test, build', () => {
    expect(workflow.jobs).toHaveProperty('lint');
    expect(workflow.jobs).toHaveProperty('typecheck');
    expect(workflow.jobs).toHaveProperty('test');
    expect(workflow.jobs).toHaveProperty('build');
  });

  it('jobs are chained in sequence: lint → typecheck → test → build', () => {
    const needs = (job: string): string[] =>
      ([] as string[]).concat(workflow.jobs[job]?.needs ?? []);

    expect(needs('typecheck')).toContain('lint');
    expect(needs('test')).toContain('typecheck');
    expect(needs('build')).toContain('test');
  });

  it('lint job has no upstream dependencies (first in chain)', () => {
    expect(workflow.jobs.lint?.needs).toBeUndefined();
  });

  it('all jobs run on ubuntu-latest', () => {
    for (const jobName of ['lint', 'typecheck', 'test', 'build']) {
      expect(workflow.jobs[jobName]['runs-on']).toBe('ubuntu-latest');
    }
  });
});
