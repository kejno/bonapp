import { PrismaClient } from '@prisma/client';
import { createSeedOwnerPasswordHash } from '../src/prisma/seed-password';

const prisma = new PrismaClient();

const SEED_TENANT_ID = 'e1a7f3b0-0001-4000-a000-000000000001';

async function main() {
  const passwordHash = await createSeedOwnerPasswordHash(
    process.env.SEED_OWNER_PASSWORD ?? '',
  );

  const tenant = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      SEED_TENANT_ID,
    );

    const seededTenant = await tx.tenant.upsert({
      where: { id: SEED_TENANT_ID },
      create: {
        id: SEED_TENANT_ID,
        slug: 'le-bistro-gourmand',
        name: 'Le Bistro Gourmand',
      },
      update: {
        name: 'Le Bistro Gourmand',
      },
    });

    await tx.user.upsert({
      where: {
        tenantId_email: {
          tenantId: seededTenant.id,
          email: 'admin@lebistro.by',
        },
      },
      create: {
        tenantId: seededTenant.id,
        email: 'admin@lebistro.by',
        passwordHash,
        fullName: 'Le Bistro Gourmand Owner',
        role: 'OWNER',
      },
      update: {
        tenantId: seededTenant.id,
        passwordHash,
        role: 'OWNER',
      },
    });

    return seededTenant;
  });

  console.log(
    `Seed complete: tenant "${tenant.name}" (${tenant.id}), user admin@lebistro.by (OWNER)`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
