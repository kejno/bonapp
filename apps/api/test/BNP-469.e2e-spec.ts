import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-469: добавление сотрудника', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('добавляет сотрудника с ролью и контактами в таблицу', async () => {
    const email = `created-${Date.now()}@example.test`;
    const response = await fixture.adminRequest().post('/api/v1/admin/staff').send({
      full_name: 'Иван Новый', email, phone: '+375291234567', role: 'WAITER', pin_code: '1234',
    }).expect(201);
    const created = response.body as { id: string; fullName: string; email: string; phone: string; role: string };
    expect(created).toMatchObject({ fullName: 'Иван Новый', email, phone: '+375291234567', role: 'WAITER' });

    const list = await fixture.adminRequest().get('/api/v1/admin/staff').expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, role: 'WAITER' })]));
  });
});
