import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PinLoginDto } from './dto/pin-login.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';
import {
  JwtAuthGuard,
  JwtPayload,
  OptionalJwtAuthGuard,
} from './guards/jwt-auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  pinLogin(@Body() dto: PinLoginDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '0.0.0.0';
    return this.authService.pinLogin(dto, ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  setup2fa(@Req() req: Request) {
    const user = (req as Request & { user: JwtPayload }).user;
    return this.authService.setup2fa(user.sub);
  }

  /**
   * Dual-purpose endpoint:
   * - { challenge, code } (no Bearer) → complete 2FA login after password step
   * - { code } + Bearer access token → confirm TOTP setup, sets totp_enabled=true
   */
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  async verify2fa(@Body() dto: TotpVerifyDto, @Req() req: Request) {
    if (dto.challenge) {
      return this.authService.verify2fa(dto);
    }
    const user = (req as Request & { user?: JwtPayload }).user;
    if (!user) throw new UnauthorizedException();
    return this.authService.verify2fa(dto, user.sub);
  }
}
