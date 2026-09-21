import { compare } from 'bcryptjs';
import { createSeedOwnerPasswordHash } from './seed-password';

describe('createSeedOwnerPasswordHash', () => {
  it('rejects an empty password instead of producing an unusable hash', async () => {
    await expect(createSeedOwnerPasswordHash('')).rejects.toThrow(
      'SEED_OWNER_PASSWORD must be set for the seed owner',
    );
  });

  it('creates a bcrypt hash for the configured seed owner password', async () => {
    const passwordHash = await createSeedOwnerPasswordHash('test-owner-password');

    expect(passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(compare('test-owner-password', passwordHash)).resolves.toBe(
      true,
    );
    await expect(compare('another-password', passwordHash)).resolves.toBe(
      false,
    );
  });
});
