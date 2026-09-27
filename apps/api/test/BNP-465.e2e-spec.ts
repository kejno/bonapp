import { createRegistrationTestApp, validRegistration } from './public-registration.fixture';

describe('BNP-465: уникальность slug', () => {
  it('назначает уникальный slug заведениям с одинаковым названием', async () => {
    const { app, state, register } = await createRegistrationTestApp();

    try {
      await register(validRegistration()).expect(201);
      await register(validRegistration({ email: 'second@example.com' })).expect(201);

      expect(state.tenants).toHaveLength(2);
      expect(state.tenants.map((tenant) => tenant.slug)).toEqual(['kafe-minsk', 'kafe-minsk-2']);
      expect(new Set(state.tenants.map((tenant) => tenant.id)).size).toBe(2);
    } finally {
      await app.close();
    }
  });
});
