import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const LINT_TIMEOUT_MS = 300_000;

interface TsConfig {
  extends?: string;
  compilerOptions?: {
    strict?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

describe('BNP-313: TypeScript strict mode + ESLint/Prettier configs across workspaces', () => {
  describe('root tsconfig.json', () => {
    let rootTsConfig: TsConfig;

    beforeAll(() => {
      const tsconfigPath = path.join(REPO_ROOT, 'tsconfig.json');
      rootTsConfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8')) as TsConfig;
    });

    it('root tsconfig.json exists', () => {
      expect(fs.existsSync(path.join(REPO_ROOT, 'tsconfig.json'))).toBe(true);
    });

    it('root tsconfig has strict: true in compilerOptions', () => {
      expect(rootTsConfig.compilerOptions?.strict).toBe(true);
    });
  });

  describe('workspace tsconfigs extend root', () => {
    // tsconfig files may contain JSONC comments; extract "extends" via regex
    function getExtendsValue(filePath: string): string | undefined {
      const content = fs.readFileSync(filePath, 'utf-8');
      const match = content.match(/"extends"\s*:\s*"([^"]+)"/);
      return match?.[1];
    }

    it('apps/api/tsconfig.json extends root tsconfig', () => {
      const tsconfigPath = path.join(REPO_ROOT, 'apps/api/tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      expect(getExtendsValue(tsconfigPath)).toBe('../../tsconfig.json');
    });

    it('apps/guest-web/tsconfig.json extends root tsconfig', () => {
      const tsconfigPath = path.join(REPO_ROOT, 'apps/guest-web/tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      expect(getExtendsValue(tsconfigPath)).toBe('../../tsconfig.json');
    });

    it('apps/admin-web/tsconfig.json extends root tsconfig', () => {
      const tsconfigPath = path.join(REPO_ROOT, 'apps/admin-web/tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      expect(getExtendsValue(tsconfigPath)).toBe('../../tsconfig.json');
    });

    it('packages/shared-types/tsconfig.json extends root tsconfig', () => {
      const tsconfigPath = path.join(REPO_ROOT, 'packages/shared-types/tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      expect(getExtendsValue(tsconfigPath)).toBe('../../tsconfig.json');
    });
  });

  describe('ESLint config', () => {
    it('eslint.config.js exists at repo root', () => {
      const eslintPath = path.join(REPO_ROOT, 'eslint.config.js');
      expect(fs.existsSync(eslintPath)).toBe(true);
    });

    it('eslint.config.js includes typescript-eslint', () => {
      const eslintPath = path.join(REPO_ROOT, 'eslint.config.js');
      const content = fs.readFileSync(eslintPath, 'utf-8');
      expect(content).toMatch(/typescript-eslint/);
    });

    it('eslint.config.js includes prettier config', () => {
      const eslintPath = path.join(REPO_ROOT, 'eslint.config.js');
      const content = fs.readFileSync(eslintPath, 'utf-8');
      expect(content).toMatch(/prettier/);
    });
  });

  describe('.prettierrc config', () => {
    it('.prettierrc exists at repo root', () => {
      const prettierPath = path.join(REPO_ROOT, '.prettierrc');
      expect(fs.existsSync(prettierPath)).toBe(true);
    });

    it('.prettierrc is valid JSON', () => {
      const prettierPath = path.join(REPO_ROOT, '.prettierrc');
      expect(() => {
        JSON.parse(fs.readFileSync(prettierPath, 'utf-8'));
      }).not.toThrow();
    });
  });

  it(
    'npm run lint succeeds with the root ESLint configuration in every workspace',
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
