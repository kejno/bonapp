import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

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
});
