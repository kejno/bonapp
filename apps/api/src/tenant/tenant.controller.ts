import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantService } from './tenant.service';

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 MB

@Controller('admin/tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

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
