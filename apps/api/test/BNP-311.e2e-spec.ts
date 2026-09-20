import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const LINT_TIMEOUT_MS = 300_000;

interface TurboTask {
  dependsOn?: string[];
  cache?: boolean;
  persistent?: boolean;
  outputs?: string[];
}

interface TurboConfig {
  $schema?: string;
  tasks: Record<string, TurboTask>;
}

describe('BNP-311: turbo.json pipelines — correct task dependencies', () => {
  let turboConfig: TurboConfig;

  beforeAll(() => {
    const turboJsonPath = path.join(REPO_ROOT, 'turbo.json');
    const content = fs.readFileSync(turboJsonPath, 'utf-8');
    turboConfig = JSON.parse(content) as TurboConfig;
  });

  it('turbo.json exists at repo root', () => {
    const turboJsonPath = path.join(REPO_ROOT, 'turbo.json');
    expect(fs.existsSync(turboJsonPath)).toBe(true);
  });

  it('build task is defined', () => {
    expect(turboConfig.tasks.build).toBeDefined();
  });

  it('build task has dependsOn ["^build"]', () => {
    expect(turboConfig.tasks.build.dependsOn).toEqual(['^build']);
  });

  it('dev task is defined', () => {
    expect(turboConfig.tasks.dev).toBeDefined();
  });

  it('dev task has cache: false', () => {
    expect(turboConfig.tasks.dev.cache).toBe(false);
  });

  it('dev task has persistent: true', () => {
    expect(turboConfig.tasks.dev.persistent).toBe(true);
  });

  it('test task is defined', () => {
    expect(turboConfig.tasks.test).toBeDefined();
  });

  it('test task has dependsOn ["^build"]', () => {
    expect(turboConfig.tasks.test.dependsOn).toEqual(['^build']);
  });

  it('lint task is defined', () => {
    expect(turboConfig.tasks.lint).toBeDefined();
  });

  it(
    'npm run lint succeeds for all workspaces',
    () => {
      expect(() => {
        execFileSync('npm', ['run', 'lint'], {
          cwd: REPO_ROOT,
          stdio: 'pipe',
          timeout: LINT_TIMEOUT_MS,
        });
      }).not.toThrow();
    },
    LINT_TIMEOUT_MS,
  );
});
