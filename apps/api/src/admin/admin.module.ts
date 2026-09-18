import { Module } from '@nestjs/common';
import { IntegrationsModule } from './integrations/integrations.module';
import { TenantSettingsModule } from './tenant-settings/tenant-settings.module';

@Module({
  imports: [IntegrationsModule, TenantSettingsModule],
})
export class AdminModule {}
