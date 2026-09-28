import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-472: обязательные поля сотрудника', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('не сохраняет сотрудника с отсутствующими обязательными данными', async () => {
    await fixture.adminRequest().post('/api/v1/admin/staff').send({
      full_name: '', email: '', role: '', pin_code: '',
    }).expect(400);
    const list = await fixture.adminRequest().get('/api/v1/admin/staff').expect(200);
    expect(list.body).toHaveLength(0);
  });
});
