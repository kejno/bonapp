import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('BNP-312: Vite dev servers — correct ports', () => {
  it('guest-web vite config file exists', () => {
    const configPath = path.join(REPO_ROOT, 'apps/guest-web/vite.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('guest-web vite config specifies port 5173', () => {
    const configPath = path.join(REPO_ROOT, 'apps/guest-web/vite.config.ts');
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toMatch(/port:\s*5173/);
  });

  it('admin-web vite config file exists', () => {
    const configPath = path.join(REPO_ROOT, 'apps/admin-web/vite.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('admin-web vite config specifies port 5174', () => {
    const configPath = path.join(REPO_ROOT, 'apps/admin-web/vite.config.ts');
    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toMatch(/port:\s*5174/);
  });
});
