import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { MediaService } from './media.service';

@Controller('api/v1/admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Post('presign') createPresign(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { mime_type?: unknown; size?: unknown },
  ) {
    if (!tenantId)
      throw new BadRequestException('x-tenant-id header is required');
    return this.media.createPresign(tenantId, body.mime_type, body.size);
  }
}
