import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-407: создание сотрудника', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('создаёт сотрудника и возвращает его в списке без PIN-кода', async () => {
    const email = `created-${Date.now()}@example.test`;
    const response = await fixture.adminRequest()
      .post('/api/v1/admin/staff')
      .send({ full_name: 'Анна Тестова', email, phone: '+375291234567', role: 'CASHIER', pin_code: '1234' })
      .expect(201);
    const created = response.body as { id: string; fullName: string; email: string; phone: string; role: string; isActive: boolean; pinHash?: string };

    expect(created).toMatchObject({ fullName: 'Анна Тестова', email, phone: '+375291234567', role: 'CASHIER', isActive: true });
    expect(created).not.toHaveProperty('pinHash');
    const listResponse = await fixture.adminRequest().get('/api/v1/admin/staff').expect(200);
    const list = listResponse.body as Array<{ id: string; fullName: string; email: string }>;
    expect(list).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, fullName: 'Анна Тестова', email })]));
    expect(JSON.stringify(list)).not.toContain('pinHash');
  });
});
