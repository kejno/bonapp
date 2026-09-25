import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface QrTokenRequest extends Request {
  tenantId: string;
  tableId: string;
}

@Injectable()
export class GuestSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const qrToken = request.headers['x-qr-token'] as string | undefined;

    if (!qrToken) {
      throw new UnauthorizedException('X-QR-Token header is required');
    }

    const table = await this.prisma.findTableByQrToken(qrToken);
    if (!table) {
      throw new UnauthorizedException('Invalid QR token');
    }

    const req = request as QrTokenRequest;
    req.tenantId = table.tenantId;
    req.tableId = table.id;

    return true;
  }
}
