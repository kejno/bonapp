import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../src/auth/auth.guard';
import { TenantContextGuard } from '../src/auth/tenant-context.guard';
import { HallsService } from '../src/halls/halls.service';
import { TableQrPdfService } from '../src/halls/table-qr-pdf.service';
import { TablesController } from '../src/halls/tables.controller';

describe('BNP-395: unauthorized PDF generation', () => {
  let app: INestApplication;
  const generate = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [
        { provide: HallsService, useValue: {} },
        { provide: TableQrPdfService, useValue: { generate } },
      ],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: (context: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
        context.switchToHttp().getRequest().user = { tenantId: 'tenant-1', role: 'WAITER' };
        return true;
      } })
      .overrideGuard(TenantContextGuard).useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());

  it('denies a request from an authenticated staff member without administrator rights', async () => {
    await request(app.getHttpServer() as never)
      .post('/api/v1/admin/tables/generate-qr-pdf')
      .send({})
      .expect(403);
    expect(generate).not.toHaveBeenCalled();
  });
});
