import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

describe('BNP-561: frontend API defaults match the backend port', () => {
  const repoRoot = resolve(__dirname, '../../..');
  const apiEnv = readFileSync(resolve(repoRoot, 'apps/api/.env.example'), 'utf8');
  const guestEnv = readFileSync(resolve(repoRoot, 'apps/guest-web/.env.example'), 'utf8');
  const adminEnv = readFileSync(resolve(repoRoot, 'apps/admin-web/.env.example'), 'utf8');

  it('documents the same API URL for the API and both web apps', () => {
    expect(apiEnv).toMatch(/^PORT=3000$/m);
    expect(guestEnv).toMatch(/^VITE_API_URL=http:\/\/localhost:3000\/api\/v1$/m);
    expect(adminEnv).toMatch(/^VITE_API_URL=http:\/\/localhost:3000\/api\/v1$/m);
  });

  it('uses the documented API URL when VITE_API_URL is not set', () => {
    for (const app of ['guest-web', 'admin-web']) {
      const files = readFiles(resolve(repoRoot, `apps/${app}/src`));
      expect(files.length).toBeGreaterThan(0);
      expect(files.join('\n')).toContain("'http://localhost:3000/api/v1'");
    }
  });
});

function readFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name: string) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory()
      ? readFiles(path)
      : path.endsWith('.ts') || path.endsWith('.tsx')
        ? [readFileSync(path, 'utf8')]
        : [];
  });
}
