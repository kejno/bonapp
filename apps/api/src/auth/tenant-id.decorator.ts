import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

interface AuthenticatedRequest {
  user?: { tenantId?: string };
}

export const TenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException(
        'Authenticated tenant context is required',
      );
    }

    return tenantId;
  },
);
