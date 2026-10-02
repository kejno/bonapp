import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('Swagger endpoint coverage', () => {
  function undocumentedRoutes(source: string): string[] {
    const file = ts.createSourceFile('controller.ts', source, ts.ScriptTarget.Latest, true);
    const missing: string[] = [];
    const decoratorName = (decorator: ts.Decorator): string => {
      const expression = decorator.expression;
      return ts.isCallExpression(expression) ? expression.expression.getText(file) : expression.getText(file);
    };
    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node)) {
        for (const member of node.members) {
          if (!ts.isMethodDeclaration(member)) continue;
          const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) ?? [] : [];
          const names = decorators.map(decoratorName);
          const route = names.find((name) => ['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(name));
          if (route && !names.includes('ApiOperation')) missing.push(`${member.name?.getText(file) ?? 'unknown'}:${route}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return missing;
  }

  it('associates documentation with each route instead of comparing file totals', () => {
    const mismatched = `@ApiTags('Тест') class Example {
      @ApiOperation({ summary: 'Лишняя операция' }) extra() {}
      @Get() undocumented() {}
    }`;
    expect(undocumentedRoutes(mismatched)).toEqual(['undocumented:Get']);
  });

  it('documents every controller and HTTP route', () => {
    const controllers = sourceFiles(__dirname)
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ source }) => /@Controller\(/.test(source) || /@Controller\(\)/.test(source));

    expect(controllers.length).toBeGreaterThan(0);
    for (const { path, source } of controllers) {
      expect(source).toMatch(/@ApiTags\(/);
      expect({ file: path, missing: undocumentedRoutes(source) }).toEqual({ file: path, missing: [] });
    }
  });
});
