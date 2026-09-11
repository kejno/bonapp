import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { In } from 'typeorm';
import { Order, OrderStatus } from '../order/entities/order.entity.js';
import { Tenant } from '../identity/entities/tenant.entity.js';
import { Table } from './entities/table.entity.js';
import { TableService } from './table.service.js';

const TENANT_ID = 'tenant-uuid';
const TABLE_ID = 'table-uuid';

const mockTable: Partial<Table> = {
  id: TABLE_ID,
  tenantId: TENANT_ID,
  name: 'Test Table',
  description: null,
};

const makeEm = (overrides: Record<string, unknown> = {}) => ({
  findOne: vi.fn().mockResolvedValue(mockTable),
  count: vi.fn().mockResolvedValue(0),
  remove: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockTableRepo = () => ({
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  manager: { transaction: vi.fn() },
});

const mockTenantRepo = () => ({
  findOne: vi.fn(),
});

const mockConfig = () => ({
  get: vi.fn().mockReturnValue('http://localhost:5173'),
});

describe('TableService.remove', () => {
  let service: TableService;
  let tableRepo: ReturnType<typeof mockTableRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TableService,
        { provide: getRepositoryToken(Table), useFactory: mockTableRepo },
        { provide: getRepositoryToken(Tenant), useFactory: mockTenantRepo },
        { provide: ConfigService, useFactory: mockConfig },
      ],
    }).compile();

    service = module.get(TableService);
    tableRepo = module.get(getRepositoryToken(Table));
  });

  afterEach(() => vi.clearAllMocks());

  it('acquires pessimistic_write lock before checking active orders', async () => {
    const em = makeEm();
    tableRepo.manager.transaction.mockImplementation(
      (fn: (em: typeof em) => Promise<void>) => fn(em),
    );

    await service.remove(TENANT_ID, TABLE_ID);

    expect(em.findOne).toHaveBeenCalledWith(Table, {
      where: { id: TABLE_ID },
      lock: { mode: 'pessimistic_write' },
    });
    expect(em.count).toHaveBeenCalledWith(Order, {
      where: { tableId: TABLE_ID, status: In([OrderStatus.NEW, OrderStatus.IN_PROGRESS]) },
    });
    expect(em.remove).toHaveBeenCalledWith(mockTable);
  });

  it('throws NotFoundException when table not found (inside transaction)', async () => {
    const em = makeEm({ findOne: vi.fn().mockResolvedValue(null) });
    tableRepo.manager.transaction.mockImplementation(
      (fn: (em: typeof em) => Promise<void>) => fn(em),
    );

    await expect(service.remove(TENANT_ID, TABLE_ID)).rejects.toThrow(NotFoundException);
    expect(em.count).not.toHaveBeenCalled();
    expect(em.remove).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when table belongs to a different tenant', async () => {
    const em = makeEm({
      findOne: vi.fn().mockResolvedValue({ ...mockTable, tenantId: 'other-tenant' }),
    });
    tableRepo.manager.transaction.mockImplementation(
      (fn: (em: typeof em) => Promise<void>) => fn(em),
    );

    await expect(service.remove(TENANT_ID, TABLE_ID)).rejects.toThrow(NotFoundException);
    expect(em.count).not.toHaveBeenCalled();
    expect(em.remove).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when table has active orders', async () => {
    const em = makeEm({ count: vi.fn().mockResolvedValue(1) });
    tableRepo.manager.transaction.mockImplementation(
      (fn: (em: typeof em) => Promise<void>) => fn(em),
    );

    await expect(service.remove(TENANT_ID, TABLE_ID)).rejects.toThrow(BadRequestException);
    expect(em.remove).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for multiple active orders (NEW + IN_PROGRESS)', async () => {
    const em = makeEm({ count: vi.fn().mockResolvedValue(3) });
    tableRepo.manager.transaction.mockImplementation(
      (fn: (em: typeof em) => Promise<void>) => fn(em),
    );

    await expect(service.remove(TENANT_ID, TABLE_ID)).rejects.toThrow(BadRequestException);
  });
});
