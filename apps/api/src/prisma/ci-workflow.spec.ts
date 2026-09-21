import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflow = readFileSync(
  join(process.cwd(), '..', '..', '.github', 'workflows', 'ci.yml'),
  'utf8',
);

describe('CI workflow', () => {
  it('applies migrations and runs the isolated order integrity E2E test against PostgreSQL', () => {
    expect(workflow).toMatch(/e2e:/);
    expect(workflow).toMatch(/postgres:/);
    expect(workflow).toContain(
      'prisma migrate deploy --schema apps/api/prisma/schema.prisma',
    );
    expect(workflow).toContain(
      'npm --workspace @bonapp/api run test:e2e -- order-tenant-integrity.e2e-spec.ts',
    );
    expect(workflow).toContain(
      'npm --workspace @bonapp/api run test:e2e -- menu-tenant-integrity.e2e-spec.ts',
    );
  });
});
