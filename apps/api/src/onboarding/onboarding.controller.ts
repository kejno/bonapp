import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('admin/tenant/onboarding/step2')
@ApiTags('Администрирование')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @ApiOperation({ summary: 'Создать или выполнить admin/tenant/onboarding/step2 pos-check' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('pos-check')
  check(@Body() body: { posType: string; apiKey: string; appId?: string; clientSecret?: string; organizationId?: string; terminalGroupId?: string; url: string }) {
    return this.onboarding.checkPos(body);
  }

  @ApiOperation({ summary: 'Создать или выполнить admin/tenant/onboarding/step2 pos' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('pos')
  save(@Body() body: { posType: string; apiKey?: string; appId?: string; clientSecret?: string; organizationId?: string; terminalGroupId?: string; url?: string }) {
    return this.onboarding.savePos(body);
  }

  @ApiOperation({ summary: 'Создать или выполнить admin/tenant/onboarding/step2 import' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('import')
  importMenu() {
    return this.onboarding.startImport();
  }

  @ApiOperation({ summary: 'Создать или выполнить admin/tenant/onboarding/step2 import/retry' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('import/retry')
  retryImport() {
    return this.onboarding.retryImport();
  }

  @ApiOperation({ summary: 'Получить admin/tenant/onboarding/step2 import' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Get('import')
  importStatus() {
    return this.onboarding.getImportStatus();
  }
}
