import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { StaffService } from './staff.service';

@Controller('admin')
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}
  @Get('staff') list() { return this.staff.list(); }
  @Post('staff') create(@Body() body: unknown) {
    if (!body || typeof body !== 'object') throw new BadRequestException();
    const value = body as Record<string, unknown>;
    if (typeof value['fullName'] !== 'string' || !value['fullName'].trim() || typeof value['email'] !== 'string' || !value['email'].includes('@') || typeof value['role'] !== 'string' || !Object.values(UserRole).includes(value['role'] as UserRole) || typeof value['temporaryPassword'] !== 'string') throw new BadRequestException('Invalid employee details');
    return this.staff.create({ fullName: value['fullName'], email: value['email'], phone: typeof value['phone'] === 'string' ? value['phone'] : undefined, role: value['role'] as UserRole, temporaryPassword: value['temporaryPassword'] });
  }
  @Patch('staff/:id') update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const data: { fullName?: string; email?: string; phone?: string | null; role?: UserRole } = {};
    if (typeof body['fullName'] === 'string') data.fullName = body['fullName'];
    if (typeof body['email'] === 'string') data.email = body['email'];
    if (typeof body['phone'] === 'string') data.phone = body['phone'];
    if (typeof body['role'] === 'string' && Object.values(UserRole).includes(body['role'] as UserRole)) data.role = body['role'] as UserRole;
    return this.staff.update(id, data);
  }
  @Patch('staff/:id/deactivate') deactivate(@Param('id') id: string) { return this.staff.deactivate(id); }
}
