import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TableSession {
  tenantId: string;
  tableId: string;
}

interface SignedTableSession extends TableSession {
  exp: number;
}

@Injectable()
export class TableSessionTokenService {
  sign(session: TableSession, expiresInSeconds = 60 * 60 * 24): string {
    const payload = Buffer.from(
      JSON.stringify({
        ...session,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      }),
    ).toString('base64url');
    return `${payload}.${this.createSignature(payload)}`;
  }

  verify(token: string): TableSession {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !this.hasValidSignature(payload, signature)) {
      throw new UnauthorizedException('Invalid table session token');
    }

    try {
      const session = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as SignedTableSession;
      if (
        !session.tenantId ||
        !session.tableId ||
        !Number.isInteger(session.exp) ||
        session.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new UnauthorizedException('Expired table session token');
      }
      return { tenantId: session.tenantId, tableId: session.tableId };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid table session token');
    }
  }

  private createSignature(payload: string): string {
    return createHmac(
      'sha256',
      process.env.TABLE_SESSION_SECRET ?? 'development-table-session-secret',
    )
      .update(payload)
      .digest('base64url');
  }

  private hasValidSignature(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.createSignature(payload));
    const received = Buffer.from(signature);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
}
