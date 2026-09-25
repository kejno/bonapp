import { BadRequestException } from '@nestjs/common';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';

describe('StaffAuthController', () => {
  const service = {} as StaffAuthService;
  const controller = new StaffAuthController(service);

  it.each(['refresh', 'logout', 'changePassword'] as const)(
    '%s rejects a null request body with 400',
    async (method) => {
      const action =
        method === 'refresh'
          ? controller.refresh(null)
          : method === 'logout'
            ? controller.logout(null)
            : controller.changePassword(null, {} as never);

      await expect(action).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
