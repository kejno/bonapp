import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServiceMode } from '@prisma/client';
import { TenantService } from './tenant.service';
import { AuthGuard } from '../auth/auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TenantContextGuard } from '../auth/tenant-context.guard';
import { MenuGateway } from '../menu/menu.gateway';

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

interface AuthenticatedRequest extends Request {
  user: { tenantId: string };
}

interface TenantRequest extends Request {
  user: { tenantId: string };
}

@Controller('admin/tenant')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard, TenantContextGuard)
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly menuGateway: MenuGateway,
  ) {}

  @ApiOperation({ summary: 'Получить admin/tenant settings' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('settings')
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.tenantService.getSettings(req.user.tenantId);
  }

  @ApiOperation({ summary: 'Обновить admin/tenant settings' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Put('settings')
  @UseGuards(AdminRoleGuard)
  async updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const { name, address, unp, legalName, logoUrl, brandColor, serviceMode } =
      body;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof brandColor !== 'string' ||
      !/^#[\da-f]{6}$/i.test(brandColor) ||
      !Object.values(ServiceMode).includes(serviceMode as ServiceMode)
    ) {
      throw new BadRequestException('Invalid tenant settings');
    }
    for (const value of [address, unp, legalName, logoUrl]) {
      if (value !== null && value !== undefined && typeof value !== 'string')
        throw new BadRequestException('Invalid tenant settings');
    }
    const updated = await this.tenantService.updateSettings(req.user.tenantId, {
      name: name.trim(),
      address: (address as string | null) ?? null,
      unp: (unp as string | null) ?? null,
      legalName: (legalName as string | null) ?? null,
      logoUrl: (logoUrl as string | null) ?? null,
      brandColor,
      serviceMode: serviceMode as ServiceMode,
    });
    this.menuGateway.emitServiceModeChanged(
      req.user.tenantId,
      updated.serviceMode,
    );
    return updated;
  }

  @ApiOperation({ summary: 'Получить admin/tenant onboarding/step3/payments' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('onboarding/step3/payments')
  @UseGuards(AdminRoleGuard)
  getPaymentStatuses() {
    return this.tenantService.getPaymentGatewayStatuses();
  }

  @ApiOperation({ summary: 'Обновить admin/tenant onboarding/step3/payments' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Put('onboarding/step3/payments')
  @UseGuards(AdminRoleGuard)
  savePaymentCredentials(@Body() credentials: unknown) {
    return this.tenantService.savePaymentCredentials(credentials);
  }

  @ApiOperation({ summary: 'Получить admin/tenant onboarding/slug-availability' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('onboarding/slug-availability')
  async checkSlug(@Query('slug') slug: string, @Req() req: TenantRequest) {
    return { available: await this.tenantService.isSlugAvailable(slug, req.user.tenantId) };
  }

  @ApiOperation({ summary: 'Создать или выполнить admin/tenant onboarding/logo-upload' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('onboarding/logo-upload')
  async createLogoUpload(@Body() body: { contentType: string }, @Req() req: TenantRequest) {
    return this.tenantService.createLogoUpload(req.user.tenantId, body.contentType);
  }

  @ApiOperation({ summary: 'Обновить admin/tenant onboarding/step1' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Put('onboarding/step1')
  async saveOnboardingStep1(@Body() body: {
    name: string; slug: string; legalName: string; unp: string; address: string;
    brandColor: string; logoUrl?: string;
  }, @Req() req: TenantRequest) {
    return this.tenantService.saveOnboardingStep1(req.user.tenantId, body);
  }

  @ApiOperation({ summary: 'Создать или выполнить admin/tenant logo' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('logo')
  @UseInterceptors(
    FileInterceptor('logo', { limits: { fileSize: MAX_LOGO_SIZE } }),
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ logoUrl: string }> {
    if (
      !file ||
      file.size > MAX_LOGO_SIZE ||
      !IMAGE_TYPES.includes(file.mimetype)
    ) {
      throw new BadRequestException(
        'Logo must be JPEG, PNG, WebP or SVG and at most 2 MB',
      );
    }
    const logoUrl = await this.tenantService.uploadLogo(
      req.user.tenantId,
      file,
    );
    return { logoUrl };
  }
}
