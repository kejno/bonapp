import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trustedProxySetting } from './trusted-proxies';

describe('application bootstrap', () => {
  it('enables global DTO validation', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(source).toMatch(
      /app\.useGlobalPipes\(new ValidationPipe\(\{ whitelist: true, transform: true \}\)\)/,
    );
  });

  it('trusts only explicitly configured proxy addresses when resolving client IP addresses', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(source).toContain('trustedProxySetting(process.env.TRUSTED_PROXY_ADDRESSES)');
  });

  it('enables CORS only for explicitly configured origins', () => {
    const source = readFileSync(join(__dirname, 'main.ts'), 'utf8');

    expect(source).toContain("process.env.CORS_ORIGIN?.split(',')");
    expect(source).toContain(
      'origin: allowedOrigins?.length ? allowedOrigins : false',
    );
    expect(source).toContain('credentials: true');
  });
});

describe('trustedProxySetting', () => {
  it('does not trust forwarded addresses when no proxy is configured', () => {
    expect(trustedProxySetting(undefined)).toBe(false);
  });

  it('trusts only explicitly configured proxy addresses or subnets', () => {
    expect(trustedProxySetting('10.0.0.10, 2001:db8::/32')).toEqual([
      '10.0.0.10',
      '2001:db8::/32',
    ]);
  });
});
