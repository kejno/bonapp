import { BadRequestException } from '@nestjs/common';
import { TableStatus } from '@prisma/client';
jest.mock('puppeteer', () => ({}), { virtual: true });
jest.mock('qrcode', () => ({}), { virtual: true });
import type { TenantRequest } from '../auth/tenant-context.guard';
import { HallsService } from './halls.service';
import { TablesController } from './tables.controller';

describe('TablesController', () => {
  const service = {
    listTables: jest.fn(),
    createTable: jest.fn(),
    updateTable: jest.fn(),
    deleteTable: jest.fn(),
    bulkCreateTables: jest.fn(),
    updateTableStatus: jest.fn(),
  };
  const pdfService = { generate: jest.fn(), getJob: jest.fn(), getFile: jest.fn() };
  const controller = new TablesController(service as unknown as HallsService, pdfService as never);
  const req = { user: { tenantId: 'tenant-1' } } as TenantRequest;

  beforeEach(() => jest.clearAllMocks());

  describe('generateQrPdf', () => {
    it('streams a synchronous PDF for the authenticated tenant', async () => {
      const pdf = Buffer.from('%PDF');
      pdfService.generate.mockResolvedValue(pdf);
      const response = { set: jest.fn(), send: jest.fn() };
      const tableIds = ['75fe5e2c-3b7b-4d76-9c19-bd0c32850a0e', '84c022c4-3614-463b-a1f3-1d97c1c888f7'];
      await controller.generateQrPdf(req, { tableIds }, response as never);
      expect(pdfService.generate).toHaveBeenCalledWith('tenant-1', tableIds);
      expect(response.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
      expect(response.send).toHaveBeenCalledWith(pdf);
    });

    it('returns 202 for asynchronous jobs', async () => {
      pdfService.generate.mockResolvedValue({ jobId: 'job-1', statusUrl: '/status' });
      const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await controller.generateQrPdf(req, {}, response as never);
      expect(response.status).toHaveBeenCalledWith(202);
      expect(response.json).toHaveBeenCalledWith({ jobId: 'job-1', statusUrl: '/status' });
    });

    it('rejects invalid tableIds', async () => {
      await expect(controller.generateQrPdf(req, { tableIds: [1] }, {} as never)).rejects.toThrow(BadRequestException);
    });
  });

  describe('asynchronous PDF access', () => {
    it('scopes status and file access to the authenticated tenant', async () => {
      pdfService.getJob.mockResolvedValue({ status: 'ready' });
      pdfService.getFile.mockResolvedValue(Buffer.from('%PDF'));
      const response = { set: jest.fn(), send: jest.fn() };

      await controller.getQrPdfJob(req, 'job-1');
      await controller.downloadQrPdf(req, 'job-1', response as never);

      expect(pdfService.getJob).toHaveBeenCalledWith('job-1', 'tenant-1');
      expect(pdfService.getFile).toHaveBeenCalledWith('job-1', 'tenant-1');
    });
  });

  describe('list', () => {
    it('returns tables for the authenticated tenant', async () => {
      const tables = [{ id: 't1' }, { id: 't2' }];
      service.listTables.mockResolvedValue(tables);

      const result = await controller.list(req);

      expect(service.listTables).toHaveBeenCalledWith('tenant-1');
      expect(result).toBe(tables);
    });
  });

  describe('create', () => {
    it('creates a table using the authenticated tenant', async () => {
      const table = { id: 't1', tableNumber: 5 };
      service.createTable.mockResolvedValue(table);

      const result = await controller.create(req, { tableNumber: 5, areaId: 'a1' });

      expect(service.createTable).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ tableNumber: 5, areaId: 'a1' }),
      );
      expect(result).toBe(table);
    });

    it('trims the areaId before forwarding to the service', async () => {
      service.createTable.mockResolvedValue({ id: 't1' });

      await controller.create(req, { tableNumber: 1, areaId: '  area-x  ' });

      expect(service.createTable).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ areaId: 'area-x' }),
      );
    });

    it('ignores tenantId in the body and uses only the authenticated tenant', async () => {
      service.createTable.mockResolvedValue({ id: 't1' });

      await controller.create(req, { tableNumber: 5, areaId: 'a1', tenantId: 'evil-tenant' });

      expect(service.createTable).toHaveBeenCalledWith('tenant-1', expect.anything());
    });

    it.each([
      [{ areaId: 'a1' }],
      [{ tableNumber: 5 }],
      [{ tableNumber: -1, areaId: 'a1' }],
      [{ tableNumber: 1.5, areaId: 'a1' }],
      [{ tableNumber: 0, areaId: 'a1' }],
      [{ tableNumber: 5, areaId: '' }],
      [{ tableNumber: 5, areaId: 'a1', seatsCount: 0 }],
      [{ tableNumber: 5, areaId: 'a1', label: '' }],
      [{ tableNumber: 5, areaId: 'a1', label: '   ' }],
      [null],
    ])('throws BadRequestException for invalid create payload %p', (body) => {
      expect(() => controller.create(req, body)).toThrow(BadRequestException);
      expect(service.createTable).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a table with provided fields', async () => {
      const updated = { id: 't1', tableNumber: 7 };
      service.updateTable.mockResolvedValue(updated);

      const result = await controller.update(req, 't1', { tableNumber: 7 });

      expect(service.updateTable).toHaveBeenCalledWith(
        'tenant-1',
        't1',
        expect.objectContaining({ tableNumber: 7 }),
      );
      expect(result).toBe(updated);
    });

    it('trims label and areaId before forwarding', async () => {
      service.updateTable.mockResolvedValue({ id: 't1' });

      await controller.update(req, 't1', { label: '  Window  ', areaId: '  area-2  ' });

      expect(service.updateTable).toHaveBeenCalledWith(
        'tenant-1',
        't1',
        expect.objectContaining({ label: 'Window', areaId: 'area-2' }),
      );
    });

    it('forwards a null label so an existing label can be cleared', async () => {
      service.updateTable.mockResolvedValue({ id: 't1', label: null });

      await controller.update(req, 't1', { label: null });

      expect(service.updateTable).toHaveBeenCalledWith(
        'tenant-1',
        't1',
        expect.objectContaining({ label: null }),
      );
    });

    it.each([
      [{}],
      [{ tableNumber: 0 }],
      [{ tableNumber: -5 }],
      [{ seatsCount: -1 }],
      [{ areaId: '' }],
      [{ label: '   ' }],
      [{ label: 123 }],
    ])('throws BadRequestException for invalid update payload %p', (body) => {
      expect(() => controller.update(req, 't1', body)).toThrow(BadRequestException);
      expect(service.updateTable).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('delegates deletion to the service', async () => {
      service.deleteTable.mockResolvedValue(undefined);

      await controller.remove(req, 't1');

      expect(service.deleteTable).toHaveBeenCalledWith('tenant-1', 't1');
    });
  });

  describe('bulkCreate', () => {
    it('creates tables in bulk using the authenticated tenant', async () => {
      const tables = [{ id: 't1' }, { id: 't2' }];
      service.bulkCreateTables.mockResolvedValue(tables);

      const result = await controller.bulkCreate(req, {
        areaId: 'a1',
        startNumber: 1,
        count: 2,
      });

      expect(service.bulkCreateTables).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ areaId: 'a1', startNumber: 1, count: 2 }),
      );
      expect(result).toBe(tables);
    });

    it.each([
      [{ startNumber: 1, count: 5 }],
      [{ areaId: 'a1', count: 5 }],
      [{ areaId: 'a1', startNumber: 1 }],
      [{ areaId: 'a1', startNumber: 0, count: 5 }],
      [{ areaId: 'a1', startNumber: 1, count: 0 }],
      [{ areaId: 'a1', startNumber: 1, count: 101 }],
      [{ areaId: '', startNumber: 1, count: 5 }],
      [{ areaId: 'a1', startNumber: 1.5, count: 5 }],
    ])('throws BadRequestException for invalid bulk create payload %p', (body) => {
      expect(() => controller.bulkCreate(req, body)).toThrow(BadRequestException);
      expect(service.bulkCreateTables).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('updates the table status to OCCUPIED', async () => {
      const updated = { id: 't1', status: TableStatus.OCCUPIED };
      service.updateTableStatus.mockResolvedValue(updated);

      const result = await controller.updateStatus(req, 't1', { status: 'OCCUPIED' });

      expect(service.updateTableStatus).toHaveBeenCalledWith(
        'tenant-1',
        't1',
        TableStatus.OCCUPIED,
      );
      expect(result).toBe(updated);
    });

    it('accepts all allowed statuses', async () => {
      service.updateTableStatus.mockResolvedValue({ id: 't1' });

      for (const status of ['AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED']) {
        await controller.updateStatus(req, 't1', { status });
        expect(service.updateTableStatus).toHaveBeenCalledWith('tenant-1', 't1', status);
      }
    });

    it.each([
      [{}],
      [{ status: 'INVALID_STATUS' }],
      [{ status: 'RESERVED' }],
      [{ status: 'CLOSED' }],
      [{ status: 123 }],
      [null],
    ])('throws BadRequestException for invalid status payload %p', (body) => {
      expect(() => controller.updateStatus(req, 't1', body)).toThrow(BadRequestException);
      expect(service.updateTableStatus).not.toHaveBeenCalled();
    });
  });
});
