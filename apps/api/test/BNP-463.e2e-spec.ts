import { createRegistrationTestApp, validRegistration } from './public-registration.fixture';

describe('BNP-463: повторная регистрация email', () => {
  it('возвращает 409 без создания tenant или выдачи второго токена', async () => {
    const { app, state, register } = await createRegistrationTestApp();

    try {
      await register(validRegistration()).expect(201);
      const response = await register(validRegistration({ name: 'Другое кафе' })).expect(409);

      expect((response.body as { accessToken?: string }).accessToken).toBeUndefined();
      expect(state.tenants).toHaveLength(1);
      expect(state.users).toHaveLength(1);
      expect(state.registrations).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
