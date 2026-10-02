import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('Swagger endpoint coverage', () => {
  it('documents every controller and HTTP route', () => {
    const controllers = sourceFiles(__dirname)
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ source }) => /@Controller\(/.test(source) || /@Controller\(\)/.test(source));

    expect(controllers.length).toBeGreaterThan(0);
    for (const { path, source } of controllers) {
      expect(source).toMatch(/@ApiTags\(/);
      const routes = source.match(/@(Get|Post|Put|Patch|Delete)(?:\([^\n]*\))?/g) ?? [];
      const operations = source.match(/@ApiOperation\(/g) ?? [];
      expect({ file: path, operations: operations.length }).toEqual({ file: path, operations: routes.length });
    }
  });
});
