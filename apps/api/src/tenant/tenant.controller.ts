import { BadRequestException, Body, Controller, Get, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ServiceMode } from '@prisma/client';
import { TenantService } from './tenant.service';
import { AuthGuard } from '../auth/auth.guard';
import { MenuGateway } from '../menu/menu.gateway';

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

interface AuthenticatedRequest extends Request { user: { tenantId: string } }

@Controller('admin/tenant')
@UseGuards(AuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService, private readonly menuGateway: MenuGateway) {}

  @Get('settings')
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.tenantService.getSettings(req.user.tenantId);
  }

  @Put('settings')
  async updateSettings(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    const { name, address, unp, legalName, logoUrl, brandColor, serviceMode } = body;
    if (typeof name !== 'string' || !name.trim() || typeof brandColor !== 'string' || !/^#[\da-f]{6}$/i.test(brandColor) || !Object.values(ServiceMode).includes(serviceMode as ServiceMode)) {
      throw new BadRequestException('Invalid tenant settings');
    }
    for (const value of [address, unp, legalName, logoUrl]) {
      if (value !== null && value !== undefined && typeof value !== 'string') throw new BadRequestException('Invalid tenant settings');
    }
    const updated = await this.tenantService.updateSettings(req.user.tenantId, {
      name: name.trim(), address: (address as string | null) ?? null, unp: (unp as string | null) ?? null,
      legalName: (legalName as string | null) ?? null, logoUrl: (logoUrl as string | null) ?? null,
      brandColor, serviceMode: serviceMode as ServiceMode,
    });
    this.menuGateway.emitServiceModeChanged(req.user.tenantId, updated.serviceMode);
    return updated;
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: MAX_LOGO_SIZE } }))
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ logoUrl: string }> {
    if (!file || file.size > MAX_LOGO_SIZE || !IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Logo must be JPEG, PNG, WebP or SVG and at most 2 MB');
    }
    const logoUrl = await this.tenantService.uploadLogo(req.user.tenantId, file);
    return { logoUrl };
  }
}
