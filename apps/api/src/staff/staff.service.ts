import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { StaffMemberDto } from '@bonapp/shared-types';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<StaffMemberDto[]> {
    const members = await this.prisma.staffMember.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return members.map(this.toDto);
  }

  async create(tenantId: string, dto: CreateStaffDto): Promise<StaffMemberDto> {
    const passwordHash = await bcrypt.hash(dto.temporaryPassword, 10);
    const member = await this.prisma.staffMember.create({
      data: {
        tenantId,
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
        passwordHash,
        mustChangePassword: true,
      },
    });
    return this.toDto(member);
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto): Promise<StaffMemberDto> {
    await this.findOneOrThrow(tenantId, id);
    const member = await this.prisma.staffMember.update({
      where: { id },
      data: dto,
    });
    return this.toDto(member);
  }

  async deactivate(tenantId: string, id: string): Promise<StaffMemberDto> {
    await this.findOneOrThrow(tenantId, id);
    const member = await this.prisma.staffMember.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toDto(member);
  }

  private async findOneOrThrow(tenantId: string, id: string) {
    const member = await this.prisma.staffMember.findFirst({ where: { id, tenantId } });
    if (!member) throw new NotFoundException(`Staff member ${id} not found`);
    return member;
  }

  private toDto(member: {
    id: string;
    name: string;
    role: string;
    phone: string;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
  }): StaffMemberDto {
    return {
      id: member.id,
      name: member.name,
      role: member.role as StaffMemberDto['role'],
      phone: member.phone,
      isActive: member.isActive,
      lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
    };
  }
}
