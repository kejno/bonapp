import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuperadminController, SuperadminOnlyGuard } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';

@Module({ imports: [AuthModule], controllers: [SuperadminController], providers: [SuperadminService, SuperadminOnlyGuard] })
export class SuperadminModule {}
