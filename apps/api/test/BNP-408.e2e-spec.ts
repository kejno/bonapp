import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-408: деактивация сотрудника', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('деактивирует сотрудника и возвращает неактивный статус в списке', async () => {
    const staff = await fixture.createStaff();
    await fixture.adminRequest().delete(`/api/v1/admin/staff/${staff.id}`).expect(200, { id: staff.id, is_active: false });
    const list = await fixture.adminRequest().get('/api/v1/admin/staff').expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: staff.id, isActive: false })]));
  });
});
