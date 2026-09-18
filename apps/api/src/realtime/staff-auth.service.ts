import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type StaffIdentity = {
  id: string;
  tenantId: string;
  role: string;
};

type JwtPayload = StaffIdentity & { exp?: number };

@Injectable()
export class StaffAuthService {
  authenticate(token: string | undefined): StaffIdentity {
    if (!token) {
      throw new UnauthorizedException('Missing staff token');
    }

    const [header, payload, signature] = token.split('.');
    const secret = process.env.JWT_SECRET;
    if (
      !header ||
      !payload ||
      !signature ||
      !secret ||
      !this.hasValidSignature(token, secret)
    ) {
      throw new UnauthorizedException('Invalid staff token');
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as JwtPayload;
      if (
        !decoded.id ||
        !decoded.tenantId ||
        !decoded.role ||
        (decoded.exp && decoded.exp <= Date.now() / 1000)
      ) {
        throw new UnauthorizedException('Invalid staff token');
      }
      return { id: decoded.id, tenantId: decoded.tenantId, role: decoded.role };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid staff token');
    }
  }

  private hasValidSignature(token: string, secret: string): boolean {
    const [header, payload, signature] = token.split('.');
    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return (
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  }
}
