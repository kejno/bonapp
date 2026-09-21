import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflow = readFileSync(
  join(process.cwd(), '..', '..', '.github', 'workflows', 'ci.yml'),
  'utf8',
);

describe('CI workflow', () => {
  it('applies migrations and runs tenant-isolation E2E against PostgreSQL as an application role', () => {
    expect(workflow).toMatch(/e2e:/);
    expect(workflow).toMatch(/postgres:/);
    expect(workflow).toContain(
      'prisma migrate deploy --schema apps/api/prisma/schema.prisma',
    );
    expect(workflow).toContain('CREATE ROLE bonapp_app LOGIN');
    expect(workflow).toContain('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bonapp_app');
    expect(workflow).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO bonapp_app',
    );
    expect(workflow).toContain('bonapp_app:bonapp_app');
    expect(workflow).toContain('tenant-isolation.e2e-spec.ts');
  });
});
