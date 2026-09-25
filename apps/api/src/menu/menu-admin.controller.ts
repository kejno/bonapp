import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import type {
  CreateModifierGroupData,
  CreateModifierOptionData,
  UpdateModifierOptionData,
} from './menu-admin.service';
import { MenuAdminService } from './menu-admin.service';
import { MenuGateway } from './menu.gateway';

interface UpdateGroupBody {
  name?: string;
  minSelected?: number;
  maxSelected?: number | null;
  isRequired?: boolean;
}

function isValidCreateGroupBody(
  body: unknown,
): body is { name: string } & CreateModifierGroupData {
  if (typeof body !== 'object' || body === null) return false;
  const { name, isRequired, id } = body as Record<string, unknown>;
  return typeof name === 'string' && name.trim().length > 0 && (isRequired === undefined || typeof isRequired === 'boolean') && (id === undefined || (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)));
}

function isValidUpdateGroupBody(body: unknown): body is UpdateGroupBody {
  if (typeof body !== 'object' || body === null) return false;
  const { name, minSelected, maxSelected, isRequired } = body as Record<string, unknown>;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return false;
  if (minSelected !== undefined && typeof minSelected !== 'number') return false;
  if (maxSelected !== undefined && maxSelected !== null && typeof maxSelected !== 'number') return false;
  if (isRequired !== undefined && typeof isRequired !== 'boolean') return false;
  return name !== undefined || minSelected !== undefined || maxSelected !== undefined || isRequired !== undefined;
}

function isValidCreateOptionBody(
  body: unknown,
): body is { name: string } & CreateModifierOptionData {
  if (typeof body !== 'object' || body === null) return false;
  const { name, id } = body as Record<string, unknown>;
  return typeof name === 'string' && name.trim().length > 0 && (id === undefined || (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)));
}

function isValidUpdateOptionBody(body: unknown): body is UpdateModifierOptionData {
  if (typeof body !== 'object' || body === null) return false;
  const { name, extraPriceByn, isDefault } = body as Record<string, unknown>;
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return false;
  if (extraPriceByn !== undefined && typeof extraPriceByn !== 'number') return false;
  if (isDefault !== undefined && typeof isDefault !== 'boolean') return false;
  return name !== undefined || extraPriceByn !== undefined || isDefault !== undefined;
}

function isValidStopListBody(
  body: unknown,
): body is { isInStopList: boolean } {
  if (typeof body !== 'object' || body === null) return false;
  const { isInStopList } = body as Record<string, unknown>;
  return typeof isInStopList === 'boolean';
}

@Controller('admin/menu')
@UseGuards(AuthGuard, TenantContextGuard, AdminRoleGuard)
export class MenuAdminController {
  constructor(
    private readonly menuAdminService: MenuAdminService,
    private readonly menuGateway: MenuGateway,
  ) {}

  @Get('items/:itemId/modifier-groups')
  listModifierGroups(
    @Req() req: TenantRequest,
    @Param('itemId') itemId: string,
  ) {
    return this.menuAdminService.listModifierGroups(
      req.user!.tenantId!,
      itemId.trim(),
    );
  }

  @Post('items/:itemId/modifier-groups')
  createModifierGroup(
    @Req() req: TenantRequest,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    if (!isValidCreateGroupBody(body)) {
      throw new BadRequestException('name is required');
    }
    const rawBody = body as unknown as Record<string, unknown>;
    return this.menuAdminService.createModifierGroup(
      req.user!.tenantId!,
      itemId.trim(),
      {
        id: typeof rawBody['id'] === 'string' ? rawBody['id'] : undefined,
        name: body.name.trim(),
        minSelected: typeof rawBody['minSelected'] === 'number' ? rawBody['minSelected'] : undefined,
        maxSelected: typeof rawBody['maxSelected'] === 'number' ? rawBody['maxSelected'] : undefined,
        isRequired: typeof rawBody['isRequired'] === 'boolean' ? rawBody['isRequired'] : undefined,
      },
    );
  }

  @Put('modifier-groups/:id')
  updateModifierGroup(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!isValidUpdateGroupBody(body)) {
      throw new BadRequestException('at least one of name, minSelected, maxSelected is required');
    }
    const prismaData: Prisma.ModifierGroupUpdateInput = {};
    if (body.name !== undefined) prismaData.name = body.name.trim();
    if (body.minSelected !== undefined) prismaData.minSelection = body.minSelected;
    if (body.maxSelected !== undefined) prismaData.maxSelection = body.maxSelected;
    if (body.isRequired !== undefined) prismaData.isRequired = body.isRequired;
    return this.menuAdminService.updateModifierGroup(
      req.user!.tenantId!,
      id.trim(),
      prismaData,
    );
  }

  @Delete('modifier-groups/:id')
  deactivateModifierGroup(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    return this.menuAdminService.deactivateModifierGroup(
      req.user!.tenantId!,
      id.trim(),
    );
  }

  @Post('modifier-groups/:id/options')
  createModifierOption(
    @Req() req: TenantRequest,
    @Param('id') groupId: string,
    @Body() body: unknown,
  ) {
    if (!isValidCreateOptionBody(body)) {
      throw new BadRequestException('name is required');
    }
    const rawBody = body as unknown as Record<string, unknown>;
    return this.menuAdminService.createModifierOption(
      req.user!.tenantId!,
      groupId.trim(),
      {
        id: typeof rawBody['id'] === 'string' ? rawBody['id'] : undefined,
        name: body.name.trim(),
        extraPriceByn: typeof rawBody['extraPriceByn'] === 'number' ? rawBody['extraPriceByn'] : undefined,
        isDefault: typeof rawBody['isDefault'] === 'boolean' ? rawBody['isDefault'] : undefined,
      },
    );
  }

  @Put('modifier-options/:id')
  updateModifierOption(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!isValidUpdateOptionBody(body)) {
      throw new BadRequestException('at least one of name, extraPriceByn, isDefault is required');
    }
    const data: UpdateModifierOptionData = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.extraPriceByn !== undefined) data.extraPriceByn = body.extraPriceByn;
    if (body.isDefault !== undefined) data.isDefault = body.isDefault;
    return this.menuAdminService.updateModifierOption(
      req.user!.tenantId!,
      id.trim(),
      data,
    );
  }

  @Delete('modifier-options/:id')
  deactivateModifierOption(
    @Req() req: TenantRequest,
    @Param('id') id: string,
  ) {
    return this.menuAdminService.deactivateModifierOption(
      req.user!.tenantId!,
      id.trim(),
    );
  }

  @Patch('items/:itemId/stop-list')
  async updateItemStopList(
    @Req() req: TenantRequest,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    if (!isValidStopListBody(body)) {
      throw new BadRequestException('isInStopList is required');
    }
    const tenantId = req.user!.tenantId!;
    const trimmedItemId = itemId.trim();
    const result = await this.menuAdminService.updateItemStopList(
      tenantId,
      trimmedItemId,
      body.isInStopList,
    );
    this.menuGateway.emitStopListChanged(tenantId, trimmedItemId, body.isInStopList);
    return result;
  }
}
