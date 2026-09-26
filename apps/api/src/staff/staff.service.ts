import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';

const STAFF_ROLES = new Set<UserRole>([UserRole.WAITER, UserRole.CASHIER, UserRole.MANAGER, UserRole.ADMIN]);

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService, private readonly tenant: TenantContextService) {}

  list() { return this.prisma.db.user.findMany({ orderBy: { fullName: 'asc' }, select: { id: true, fullName: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true } }); }

  async create(input: { fullName: string; email: string; phone?: string; role: UserRole; temporaryPassword: string }) {
    this.validateRole(input.role);
    if (input.temporaryPassword.length < 8) throw new ConflictException('Temporary password must contain at least 8 characters');
    const tenantId = this.tenant.getTenantId()!;
    const passwordHash = await hash(input.temporaryPassword, 10);
    return this.prisma.transactionForTenant(tenantId, (tx) => tx.user.create({ data: { tenantId, fullName: input.fullName.trim(), email: input.email.trim().toLowerCase(), phone: input.phone?.trim() || null, role: input.role, passwordHash, mustChangePassword: true }, select: { id: true, fullName: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true } }));
  }

  async update(id: string, input: { fullName?: string; email?: string; phone?: string | null; role?: UserRole }) {
    if (input.role) this.validateRole(input.role);
    const result = await this.prisma.db.user.updateMany({ where: { id }, data: { ...(input.fullName ? { fullName: input.fullName.trim() } : {}), ...(input.email ? { email: input.email.trim().toLowerCase() } : {}), ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}), ...(input.role ? { role: input.role } : {}) } });
    if (!result.count) throw new NotFoundException('Employee not found');
    return this.prisma.db.user.findFirst({ where: { id }, select: { id: true, fullName: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true } });
  }

  async deactivate(id: string) {
    const result = await this.prisma.db.user.updateMany({ where: { id }, data: { isActive: false, sessionVersion: { increment: 1 } } });
    if (!result.count) throw new NotFoundException('Employee not found');
    return { success: true };
  }

  async currentShift() {
    const shift = await this.prisma.db.staffShift.findFirst({ where: { closedAt: null }, include: { cashier: { select: { fullName: true } } }, orderBy: { openedAt: 'desc' } });
    if (!shift) return null;
    const summary = await this.prisma.db.order.aggregate({ where: { tenantId: this.tenant.getTenantId()!, status: 'PAID', paidAt: { gte: shift.openedAt } }, _sum: { totalAmountByn: true }, _count: { _all: true } });
    return { ...shift, ordersCount: summary._count._all, revenue: summary._sum.totalAmountByn?.toString() ?? '0.00' };
  }

  async openShift(cashierId: string) {
    if (await this.prisma.db.staffShift.findFirst({ where: { closedAt: null } })) throw new ConflictException('A shift is already open');
    const tenantId = this.tenant.getTenantId()!;
    return this.prisma.transactionForTenant(tenantId, (tx) => tx.staffShift.create({ data: { tenantId, cashierId }, include: { cashier: { select: { fullName: true } } } }));
  }

  async closeShift() {
    const shift = await this.prisma.db.staffShift.findFirst({ where: { closedAt: null } });
    if (!shift) throw new NotFoundException('No open shift');
    return this.prisma.db.staffShift.update({ where: { id: shift.id }, data: { closedAt: new Date() } });
  }

  private validateRole(role: UserRole) { if (!STAFF_ROLES.has(role)) throw new ConflictException('Unsupported staff role'); }
}
