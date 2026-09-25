import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuthModule } from './auth.module';

describe('AuthModule', () => {
  it('does not import PrismaModule because PrismaService is global', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule) ?? []).toEqual(
      [],
    );
  });
});
