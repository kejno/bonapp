import { MODULE_METADATA } from '@nestjs/common/constants';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthModule } from './auth.module';

describe('AuthModule', () => {
  it('does not import PrismaModule because PrismaService is global', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) ?? []) as unknown[];
    expect(imports).toContain(StaffAuthModule);
    expect(imports).not.toContain(PrismaModule);
  });
});
