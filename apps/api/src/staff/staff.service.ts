import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const STAFF_ROLES = new Set<UserRole>([
  UserRole.CASHIER,
  UserRole.WAITER,
  UserRole.MANAGER,
]);
const STAFF_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;
export interface StaffInput {
  full_name: string;
  email: string;
  phone?: string | null;
  role: string;
  pin_code: string;
  is_active?: boolean;
}

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.forTenant(tenantId).user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      select: STAFF_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  listKitchenStaff(tenantId: string) {
    return this.prisma.forTenant(tenantId).user.findMany({
      where: { role: UserRole.CHEF },
      select: { id: true, fullName: true, kitchenDepartments: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateKitchenDepartments(
    tenantId: string,
    id: string,
    kitchenDepartments: string[],
  ) {
    const allowedDepartments = new Set(['HOT', 'COLD', 'BAR']);
    if (
      !Array.isArray(kitchenDepartments) ||
      kitchenDepartments.some((department) => !allowedDepartments.has(department))
    ) {
      throw new BadRequestException('kitchenDepartments must contain HOT, COLD or BAR');
    }
    const user = this.prisma.forTenant(tenantId).user;
    const chef = await user.findFirst({
      where: { id, role: UserRole.CHEF },
      select: { id: true },
    });
    if (!chef) throw new NotFoundException('Chef not found');
    return user.update({
      where: { id },
      data: { kitchenDepartments },
      select: { id: true, kitchenDepartments: true },
    });
  }

  async create(tenantId: string, input: StaffInput) {
    this.validate(input);
    const user = await this.prisma.forTenant(tenantId).user.create({
      data: {
        tenantId,
        fullName: input.full_name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        role: input.role as UserRole,
        pinHash: await hash(input.pin_code, 10),
        passwordHash: await hash(randomBytes(32).toString('hex'), 10),
        isActive: input.is_active ?? true,
      },
      select: STAFF_SELECT,
    });
    return user;
  }

  async update(tenantId: string, id: string, input: Partial<StaffInput>) {
    const data: Record<string, unknown> = {};
    if (input.full_name !== undefined) {
      if (typeof input.full_name !== 'string' || !input.full_name.trim())
        throw new BadRequestException('full_name is required');
      data['fullName'] = input.full_name.trim();
    }
    if (input.email !== undefined) {
      if (
        typeof input.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
      )
        throw new BadRequestException('email must be valid');
      data['email'] = input.email.trim().toLowerCase();
    }
    if (input.phone !== undefined) {
      if (input.phone !== null && typeof input.phone !== 'string')
        throw new BadRequestException('phone must be a string');
      data['phone'] = input.phone?.trim() || null;
    }
    if (input.role !== undefined) {
      this.validateRole(input.role);
      data['role'] = input.role;
    }
    if (input.is_active !== undefined) {
      if (typeof input.is_active !== 'boolean')
        throw new BadRequestException('is_active must be a boolean');
      data['isActive'] = input.is_active;
    }
    if (input.pin_code !== undefined) {
      if (!/^\d{4}$/.test(input.pin_code))
        throw new BadRequestException('pin_code must contain exactly 4 digits');
      data['pinHash'] = await hash(input.pin_code, 10);
    }
    if (Object.keys(data).length === 0)
      throw new BadRequestException('At least one field is required');
    const exists = await this.prisma.forTenant(tenantId).user.findFirst({
      where: { id, role: { in: [...STAFF_ROLES] } },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Staff member not found');
    return this.prisma
      .forTenant(tenantId)
      .user.update({ where: { id }, data, select: STAFF_SELECT });
  }

  async deactivate(tenantId: string, id: string) {
    const result = await this.prisma.forTenant(tenantId).user.updateMany({
      where: { id, role: { in: [...STAFF_ROLES] } },
      data: { isActive: false },
    });
    if (!result.count) throw new NotFoundException('Staff member not found');
    return { id, is_active: false };
  }

  async resetPin(tenantId: string, id: string) {
    const user = await this.prisma.forTenant(tenantId).user.findFirst({
      where: { id, role: { in: [...STAFF_ROLES] } },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Staff member not found');
    const newPin = randomInt(0, 10000).toString().padStart(4, '0');
    await this.prisma.forTenant(tenantId).user.update({
      where: { id },
      data: { pinHash: await hash(newPin, 10) },
    });
    return { new_pin: newPin };
  }

  private validate(input: StaffInput) {
    if (typeof input.full_name !== 'string' || !input.full_name.trim())
      throw new BadRequestException('full_name is required');
    if (
      typeof input.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    )
      throw new BadRequestException('email must be valid');
    if (
      input.phone !== undefined &&
      input.phone !== null &&
      typeof input.phone !== 'string'
    )
      throw new BadRequestException('phone must be a string');
    if (input.is_active !== undefined && typeof input.is_active !== 'boolean')
      throw new BadRequestException('is_active must be a boolean');
    if (typeof input.pin_code !== 'string' || !/^\d{4}$/.test(input.pin_code))
      throw new BadRequestException('pin_code must contain exactly 4 digits');
    this.validateRole(input.role);
  }
  private validateRole(role: string) {
    if (!STAFF_ROLES.has(role as UserRole))
      throw new BadRequestException('role must be CASHIER, WAITER or MANAGER');
  }
}
