import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Get,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantService } from './tenant.service';
import { AuthGuard } from '../auth/auth.guard';

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB

interface TenantRequest extends Request { user: { tenantId: string } }

@Controller('admin/tenant')
@UseGuards(AuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('onboarding/slug-availability')
  async checkSlug(@Query('slug') slug: string, @Req() req: TenantRequest) {
    return { available: await this.tenantService.isSlugAvailable(slug, req.user.tenantId) };
  }

  @Post('onboarding/logo-upload')
  async createLogoUpload(@Body() body: { contentType: string }, @Req() req: TenantRequest) {
    return this.tenantService.createLogoUpload(req.user.tenantId, body.contentType);
  }

  @Put('onboarding/step1')
  async saveOnboardingStep1(@Body() body: {
    name: string; slug: string; legalName: string; unp: string; address: string;
    brandColor: string; logoUrl?: string;
  }, @Req() req: TenantRequest) {
    return this.tenantService.saveOnboardingStep1(req.user.tenantId, body);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('logo'))
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_LOGO_SIZE }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('tenantId') tenantId: string,
  ): Promise<{ logoUrl: string }> {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const logoUrl = await this.tenantService.uploadLogo(tenantId, file);
    return { logoUrl };
  }
}
