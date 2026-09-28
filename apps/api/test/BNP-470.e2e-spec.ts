import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-470: редактирование и деактивация сотрудника', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('сохраняет изменения сотрудника и отображает неактивный статус', async () => {
    const staff = await fixture.createStaff('WAITER');
    await fixture.adminRequest().put(`/api/v1/admin/staff/${staff.id}`).send({
      full_name: 'Мария Изменённая', email: staff.email, phone: '+375297654321', role: 'MANAGER',
    }).expect(200);
    const updated = await fixture.prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(updated).toMatchObject({ fullName: 'Мария Изменённая', phone: '+375297654321', role: 'MANAGER' });

    await fixture.adminRequest().delete(`/api/v1/admin/staff/${staff.id}`).expect(200);
    const list = await fixture.adminRequest().get('/api/v1/admin/staff').expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: staff.id, isActive: false })]));
  });
});
