import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { IntegrationsStatusResponseDto } from '@bonapp/shared-types';
import { IntegrationsService } from './integrations.service';

@Controller('api/v1/admin/integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('status')
  getStatus(
    @Headers('x-tenant-id') tenantId: string,
  ): Promise<IntegrationsStatusResponseDto> {
    return this.integrationsService.getStatus(tenantId);
  }

  @Post(':provider/sync')
  @HttpCode(202)
  async sync(
    @Param('provider') provider: string,
    @Headers('x-tenant-id') tenantId: string,
  ): Promise<{ message: string }> {
    if (provider !== 'iiko' && provider !== 'r_keeper') {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }
    try {
      await this.integrationsService.syncMenu(tenantId, provider);
      return { message: 'Sync started' };
    } catch (err: any) {
      if (err.message === 'NotConfigured' || err.message === 'ConnectionFailed') {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
