import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

export const TenantId = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ header(name: string): string | undefined }>();
    const tenantId = request.header('x-tenant-id');
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    return tenantId;
  },
);
