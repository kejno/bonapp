import { createRegistrationTestApp, validRegistration } from './public-registration.fixture';

describe('BNP-465: уникальность slug', () => {
  it('назначает уникальный slug заведениям с одинаковым названием', async () => {
    const { app, state, register } = await createRegistrationTestApp();

    try {
      await register(validRegistration()).expect(201);
      await register(validRegistration({ email: 'second@example.com', phone: '+375291234568' })).expect(201);

      expect(state.tenants).toHaveLength(2);
      expect(state.tenants.map((tenant) => tenant.slug)).toEqual(['kafe-minsk', 'kafe-minsk-2']);
      expect(new Set(state.tenants.map((tenant) => tenant.id)).size).toBe(2);
      expect(state.tenants.map((tenant) => tenant.name)).toEqual(['Кафе Минск', 'Кафе Минск']);
      expect(state.users.map((user) => user.email)).toEqual(['owner@example.com', 'second@example.com']);
      expect(state.users.map((user) => user.phone)).toEqual(['+375291234567', '+375291234568']);
    } finally {
      await app.close();
    }
  });
});
