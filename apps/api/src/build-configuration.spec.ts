import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('API build configuration', () => {
  it('generates the Prisma client before compiling TypeScript', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.prebuild).toBe('prisma generate');
  });
});
