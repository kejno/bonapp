import { execSync } from 'child_process';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_TIMEOUT_MS = 300_000;

describe('BNP-310: turbo run build — all packages build without errors', () => {
  it(
    'npm run build exits with code 0',
    () => {
      expect(() => {
        execSync('npm run build', {
          cwd: REPO_ROOT,
          stdio: 'pipe',
          timeout: BUILD_TIMEOUT_MS,
        });
      }).not.toThrow();
    },
    BUILD_TIMEOUT_MS,
  );
});
