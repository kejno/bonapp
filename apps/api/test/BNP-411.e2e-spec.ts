import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-411: редактирование сотрудника', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('сохраняет обновлённые данные сотрудника через API', async () => {
    const staff = await fixture.createStaff('WAITER');
    const response = await fixture.adminRequest().put(`/api/v1/admin/staff/${staff.id}`).send({
      full_name: 'Мария Обновлённая', email: 'updated@example.test', phone: '+375297654321', role: 'MANAGER', is_active: false,
    }).expect(200);
    expect(response.body).toMatchObject({ id: staff.id, fullName: 'Мария Обновлённая', email: 'updated@example.test', phone: '+375297654321', role: 'MANAGER', isActive: false });

    const stored = await fixture.prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(stored).toMatchObject({ fullName: 'Мария Обновлённая', email: 'updated@example.test', phone: '+375297654321', role: 'MANAGER', isActive: false });
  });
});
