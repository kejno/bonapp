import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const CI_WORKFLOW_PATH = path.join(
  __dirname,
  '../../../.github/workflows/ci.yml',
);

describe('BNP-330: Second CI run uses npm and Turborepo cache', () => {
  let workflow: Record<string, any>;

  beforeAll(() => {
    const content = fs.readFileSync(CI_WORKFLOW_PATH, 'utf-8');
    workflow = yaml.load(content) as Record<string, any>;
  });

  const JOB_NAMES = ['lint', 'typecheck', 'test', 'build'];

  it.each(JOB_NAMES)(
    'job "%s" caches npm dependencies via actions/setup-node',
    (jobName) => {
      const steps: any[] = workflow.jobs[jobName]?.steps ?? [];
      const setupNode = steps.find(
        (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/setup-node'),
      );
      expect(setupNode).toBeDefined();
      expect(setupNode?.with?.cache).toBe('npm');
    },
  );

  it.each(JOB_NAMES)(
    'job "%s" caches Turborepo output via actions/cache',
    (jobName) => {
      const steps: any[] = workflow.jobs[jobName]?.steps ?? [];
      const turboCache = steps.find(
        (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/cache'),
      );
      expect(turboCache).toBeDefined();
      expect(turboCache?.with?.path).toContain('turbo');
    },
  );

  it.each(JOB_NAMES)(
    'job "%s" Turborepo cache key includes package-lock.json hash for determinism',
    (jobName) => {
      const steps: any[] = workflow.jobs[jobName]?.steps ?? [];
      const turboCache = steps.find(
        (s: any) => typeof s.uses === 'string' && s.uses.startsWith('actions/cache'),
      );
      const cacheKey: string = turboCache?.with?.key ?? '';
      expect(cacheKey).toContain('hashFiles');
      expect(cacheKey).toContain('package-lock.json');
    },
  );
});
