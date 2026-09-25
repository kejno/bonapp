import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('application bootstrap', () => {
  it('enables global DTO validation', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(source).toMatch(
      /app\.useGlobalPipes\(new ValidationPipe\(\{ whitelist: true, transform: true \}\)\)/,
    );
  });

  it('trusts only explicitly configured proxy addresses when resolving client IP addresses', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(source).toContain("app.set('trust proxy', process.env.TRUSTED_PROXY_ADDRESSES || false)");
  });
});
