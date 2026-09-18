import {
  Body,
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { WaiterCallReason } from '@bonapp/shared-types';
import { TableSessionTokenService } from './table-session-token.service';
import { WaiterCallService } from './waiter-call.service';

interface CallWaiterBody {
  reason: WaiterCallReason;
}

@Controller('api/v1/guest')
export class WaiterCallController {
  constructor(
    private readonly tokenService: TableSessionTokenService,
    private readonly waiterCallService: WaiterCallService,
  ) {}

  @Post('call-waiter')
  async callWaiter(
    @Body() body: CallWaiterBody,
    @Headers('authorization') authorization?: string,
    @Headers('cookie') cookie?: string,
  ): Promise<void> {
    const token = this.extractToken(authorization, cookie);
    await this.waiterCallService.callWaiter(
      this.tokenService.verify(token),
      body.reason,
    );
  }

  private extractToken(authorization?: string, cookie?: string): string {
    const bearerToken = authorization?.match(/^Bearer (.+)$/i)?.[1];
    const cookieToken = cookie
      ?.split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('table_session='))
      ?.slice('table_session='.length);
    const token = bearerToken ?? cookieToken;
    if (!token) {
      throw new UnauthorizedException('Table session token is required');
    }
    return decodeURIComponent(token);
  }
}
