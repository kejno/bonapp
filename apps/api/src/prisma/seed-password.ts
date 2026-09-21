import { hash } from 'bcryptjs';

const BCRYPT_COST = 12;

export async function createSeedOwnerPasswordHash(
  password: string,
): Promise<string> {
  if (!password) {
    throw new Error('SEED_OWNER_PASSWORD must be set for the seed owner');
  }

  return hash(password, BCRYPT_COST);
}
