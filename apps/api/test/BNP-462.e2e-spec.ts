import { createRegistrationTestApp, validRegistration } from './public-registration.fixture';

describe('BNP-462: регистрация заведения на триал', () => {
  it('создает tenant и владельца на 14-дневный триал и возвращает токен для входа', async () => {
    const { app, state, register } = await createRegistrationTestApp();
    const startedAt = Date.now();

    try {
      const response = await register(validRegistration()).expect(201);
      const tenant = state.tenants[0];
      const user = state.users[0];

      const body = response.body as { tenantId: string; accessToken: string; user: Record<string, unknown> };
      expect(body.tenantId).toBe(tenant.id);
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.user).toMatchObject({ email: 'owner@example.com', role: 'OWNER', tenantId: tenant.id });
      expect(tenant).toMatchObject({ name: 'Кафе Минск', status: 'TRIAL', venueType: 'CAFE' });
      expect(user).toMatchObject({ email: 'owner@example.com', role: 'OWNER', tenantId: tenant.id });
      expect(tenant.trialEndsAt).toBeInstanceOf(Date);
      expect((tenant.trialEndsAt as Date).getTime()).toBeGreaterThanOrEqual(startedAt + 14 * 24 * 60 * 60 * 1000);
      expect((tenant.trialEndsAt as Date).getTime()).toBeLessThanOrEqual(Date.now() + 14 * 24 * 60 * 60 * 1000);
    } finally {
      await app.close();
    }
  });
});
