import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthTestFixture, loginRequest } from './auth-test.fixture';

export class StaffTestFixture extends AuthTestFixture {
  authorization = '';

  async startAsOwner(): Promise<void> {
    await this.start();
    await this.prisma.user.update({
      where: { id: this.userId },
      data: { role: 'OWNER' },
    });
    const response = await loginRequest(this.app.getHttpServer()).send({
      tenantId: this.tenantId,
      email: this.userEmail,
      password: this.userPassword,
    }).expect(200);
    this.authorization = `Bearer ${(response.body as { accessToken: string }).accessToken}`;
  }

  async createStaff(role: 'CASHIER' | 'WAITER' | 'MANAGER' = 'CASHIER') {
    return this.prisma.user.create({
      data: {
        tenantId: this.tenantId,
        email: `staff-${randomUUID()}@example.test`,
        passwordHash: 'unused-test-hash',
        fullName: 'Тестовый сотрудник',
        role,
        pinHash: null,
        mustChangePassword: false,
      },
    });
  }

  adminRequest() {
    return request(this.app.getHttpServer()).set('Authorization', this.authorization);
  }
}
