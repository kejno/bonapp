import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { PublicRegistrationService, RegistrationInput } from './public-registration.service';

@Controller('public/tenants')
@ApiTags('Публичные операции')
@SkipTenantGuard()
export class PublicRegistrationController {
  constructor(private readonly registrations: PublicRegistrationService) {}

  @ApiOperation({ summary: 'Создать или выполнить public/tenants register' })

  @ApiResponse({ status: 200, description: 'Операция выполнена успешно' })
  @ApiResponse({ status: 400, description: 'Некорректные параметры запроса' })
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: unknown) {
    if (!body || typeof body !== 'object') throw new BadRequestException('Некорректные данные регистрации');
    const value = body as Record<string, unknown>;
    if (typeof value.name !== 'string' || typeof value.email !== 'string' || typeof value.phone !== 'string' || typeof value.venueType !== 'string') {
      throw new BadRequestException('Заполните все поля регистрации');
    }
    return this.registrations.register(value as unknown as RegistrationInput);
  }
}
