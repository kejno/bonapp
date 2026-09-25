import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('application bootstrap', () => {
  it('enables global DTO validation', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(source).toMatch(
      /app\.useGlobalPipes\(new ValidationPipe\(\{ whitelist: true, transform: true \}\)\)/,
    );
  });
});
