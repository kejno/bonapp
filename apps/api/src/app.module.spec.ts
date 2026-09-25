import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { HallsModule } from './halls/halls.module';

describe('AppModule', () => {
  it('registers the halls module and keeps its routes available', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];

    expect(imports).toContain(HallsModule);
  });
});
