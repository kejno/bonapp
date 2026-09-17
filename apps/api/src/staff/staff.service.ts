import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { randomBytes, scryptSync } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type CreateStaffDto = {
  full_name: string;
  email: string;
  phone: string;
  role: StaffRole;
  pin_code: string;
  is_active?: boolean;
};

export type UpdateStaffDto = Partial<Omit<CreateStaffDto, 'pin_code'>>;

type PublicStaff = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const publicStaffSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const staff = await this.prisma.staff.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: publicStaffSelect,
    });
    return staff.map((member) => this.toResponse(member));
  }

  async create(tenantId: string, dto: CreateStaffDto) {
    this.validate(dto, true);
    const staff = await this.prisma.staff.create({
      data: {
        tenantId,
        fullName: dto.full_name,
        email: dto.email,
        phone: dto.phone,
        role: dto.role,
        pinHash: this.hashPin(dto.pin_code),
        isActive: dto.is_active ?? true,
      },
      select: publicStaffSelect,
    });
    return this.toResponse(staff);
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto) {
    this.validate(dto, false);
    await this.requireStaff(tenantId, id);
    const data = {
      ...(dto.full_name !== undefined && { fullName: dto.full_name }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.role !== undefined && { role: dto.role }),
      ...(dto.is_active !== undefined && { isActive: dto.is_active }),
    };
    const staff = await this.prisma.staff.update({
      where: { id },
      data,
      select: publicStaffSelect,
    });
    return this.toResponse(staff);
  }

  async deactivate(tenantId: string, id: string) {
    return this.update(tenantId, id, { is_active: false });
  }

  async resetPin(tenantId: string, id: string) {
    await this.requireStaff(tenantId, id);
    const newPin = String(Math.floor(Math.random() * 9000) + 1000);
    await this.prisma.staff.update({
      where: { id },
      data: { pinHash: this.hashPin(newPin) },
    });
    return { new_pin: newPin };
  }

  private async requireStaff(tenantId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, tenantId },
    });
    if (!staff) throw new NotFoundException('Staff member not found');
    return staff;
  }

  private validate(dto: CreateStaffDto | UpdateStaffDto, requirePin: boolean) {
    if (
      dto.role !== undefined &&
      !Object.values(StaffRole).includes(dto.role)
    ) {
      throw new BadRequestException('Invalid staff role');
    }
    if (dto.email !== undefined && !/^\S+@\S+\.\S+$/.test(dto.email)) {
      throw new BadRequestException('Invalid email');
    }
    const pin = 'pin_code' in dto ? dto.pin_code : undefined;
    if (requirePin && (!pin || !/^\d{4}$/.test(pin))) {
      throw new BadRequestException(
        'PIN code must contain exactly four digits',
      );
    }
  }

  private hashPin(pin: string) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(pin, salt, 64).toString('hex')}`;
  }

  private toResponse(staff: PublicStaff) {
    return {
      id: staff.id,
      full_name: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      is_active: staff.isActive,
      created_at: staff.createdAt,
      updated_at: staff.updatedAt,
    };
  }
}
