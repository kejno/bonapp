import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');

describe('local development infrastructure', () => {
  it('defines PostgreSQL 15 and Redis 7 with health checks and persistent volumes', () => {
    const compose = readFileSync(
      resolve(repositoryRoot, 'docker-compose.yml'),
      'utf8',
    );

    expect(compose).toMatch(/postgres:\s*\n\s*image: postgres:15/);
    expect(compose).toMatch(/redis:\s*\n\s*image: redis:7/);
    expect(compose).toMatch(/healthcheck:/);
    expect(compose).toContain('bonapp_pg_data');
    expect(compose).toContain('bonapp_redis_data');
  });

  it('provides API connection, JWT, and payment placeholders', () => {
    const environment = readFileSync(
      resolve(repositoryRoot, 'apps/api/.env.example'),
      'utf8',
    );

    expect(environment).toContain('DATABASE_URL=');
    expect(environment).toContain('REDIS_URL=');
    expect(environment).toContain('JWT_SECRET=');
    expect(environment).toContain('JWT_REFRESH_SECRET=');
    expect(environment).toContain('PAYMENT_PUBLIC_KEY=');
    expect(environment).toContain('PAYMENT_SECRET_KEY=');
  });
});
