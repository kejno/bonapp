import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_TIMEOUT_MS = 300_000;
const BUILD_ARTIFACTS = [
  'apps/api/dist',
  'apps/guest-web/dist',
  'apps/admin-web/dist',
  'packages/shared-types/dist',
];

describe('BNP-310: turbo run build — all packages build without errors', () => {
  it(
    'npm run build succeeds without errors and creates artifacts for every package',
    () => {
      const output = execFileSync('npm', ['run', 'build'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: BUILD_TIMEOUT_MS,
      });

      expect(output).not.toMatch(/\b(error|failed)\b/i);

      for (const artifact of BUILD_ARTIFACTS) {
        expect(fs.existsSync(path.join(REPO_ROOT, artifact))).toBe(true);
      }
    },
    BUILD_TIMEOUT_MS,
  );
});
