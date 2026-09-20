import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

describe('BNP-325: local start guide', () => {
  afterAll(() => {
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it('documents the required startup sequence and starts its first step', () => {
    const readme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8');

    expect(readme).toContain('docker compose up -d');
    expect(readme).toContain('npx prisma migrate dev');
    expect(readme).toContain('npm run dev');
    expect(() => compose('up', '-d')).not.toThrow();
  });
});
