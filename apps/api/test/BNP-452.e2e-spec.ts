import { StaffTestFixture } from './staff-test.fixture';

describe('BNP-452: открытие смены из welcome', () => {
  const fixture = new StaffTestFixture();

  beforeAll(async () => fixture.startAsOwner(), 120_000);
  afterAll(async () => fixture.stop());

  it('открывает смену для текущего пользователя через welcome endpoint', async () => {
    const response = await fixture.adminRequest().post('/api/v1/admin/shifts/open').expect(201);
    const shift = response.body as { id: string; cashierId: string; status: string };
    expect(shift).toMatchObject({ cashierId: fixture.userId, status: 'OPEN' });
    await expect(fixture.prisma.shift.findUniqueOrThrow({ where: { id: shift.id } }))
      .resolves.toMatchObject({ cashierId: fixture.userId, status: 'OPEN' });
  });
});
