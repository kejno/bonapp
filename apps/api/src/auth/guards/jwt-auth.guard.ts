import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  role: string;
  tenantId: string;
  type: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req);
    if (!token) throw new UnauthorizedException();
    req['user'] = this.validateAccessToken(token);
    return true;
  }

  protected validateAccessToken(token: string): JwtPayload {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (payload.type !== 'access') throw new UnauthorizedException();
      return payload;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

/** Sets req.user if a valid Bearer access token is present; never throws. */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  override canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req);
    if (token) {
      try {
        req['user'] = this.validateAccessToken(token);
      } catch {
        // ignored — optional
      }
    }
    return true;
  }
}

function extractBearerToken(req: Request): string | undefined {
  const [type, token] = req.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? token : undefined;
}
