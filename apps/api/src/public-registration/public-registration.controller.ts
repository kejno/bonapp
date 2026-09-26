import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SkipTenantGuard } from '../tenant/tenant.constants';
import { PublicRegistrationService, RegistrationInput } from './public-registration.service';

@Controller('public/tenants')
@SkipTenantGuard()
export class PublicRegistrationController {
  constructor(private readonly registrations: PublicRegistrationService) {}

  @Post('register')
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
