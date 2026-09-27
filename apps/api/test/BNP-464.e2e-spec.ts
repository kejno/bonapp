import { createRegistrationTestApp, validRegistration } from './public-registration.fixture';

describe('BNP-464: проверка email и телефона', () => {
  it.each([
    ['email', { email: 'invalid-email' }],
    ['телефон РБ', { phone: '+12025550123' }],
  ])('отклоняет регистрацию с некорректным полем: %s', async (_field, override) => {
    const { app, state, register } = await createRegistrationTestApp();

    try {
      await register(validRegistration(override)).expect(400);
      expect(state.tenants).toHaveLength(0);
      expect(state.users).toHaveLength(0);
      expect(state.registrations).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
