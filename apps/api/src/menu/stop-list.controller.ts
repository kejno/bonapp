import {
  BadRequestException,
  Body,
  Controller,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import type { TenantRequest } from '../auth/tenant-context.guard';
import { MenuAdminService } from './menu-admin.service';

interface UpdateStopListRequest {
  itemId: string;
  isStopped: boolean;
}

@Controller('stop-list')
export class StopListController {
  constructor(private readonly menuAdminService: MenuAdminService) {}

  @Patch()
  @UseGuards(AuthGuard, TenantContextGuard)
  update(@Req() authenticatedRequest: TenantRequest, @Body() request: unknown) {
    if (!this.isValidRequest(request)) {
      throw new BadRequestException('itemId and isStopped are required');
    }
    return this.menuAdminService.updateStopList(
      authenticatedRequest.user!.tenantId!,
      request.itemId.trim(),
      request.isStopped,
    );
  }

  private isValidRequest(request: unknown): request is UpdateStopListRequest {
    if (typeof request !== 'object' || request === null) return false;
    const { itemId, isStopped } = request as Record<string, unknown>;
    return typeof itemId === 'string' && itemId.trim().length > 0 && typeof isStopped === 'boolean';
  }
}
