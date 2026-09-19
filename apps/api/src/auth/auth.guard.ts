import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

// TODO: Replace with real JWT validation — BNP-XXX (auth module)
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.headers.authorization) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
