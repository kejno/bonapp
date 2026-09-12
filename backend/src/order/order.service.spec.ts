import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MenuItem } from '../menu/entities/menu-item.entity.js';
import { Table } from '../table/entities/table.entity.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import { OrderService } from './order.service.js';

const TENANT = 'tenant-uuid';
const TABLE_ID = 'table-uuid';
const ITEM_ID = 'item-uuid';
const ORDER_ID = 'order-uuid';

const makeQb = (overrides: Record<string, unknown> = {}) => ({
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  addOrderBy: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  take: vi.fn().mockReturnThis(),
  getManyAndCount: vi.fn().mockResolvedValue([[], 0]),
  ...overrides,
});

const mockOrderRepo = () => ({
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  createQueryBuilder: vi.fn(),
});

const mockTableRepo = () => ({
  findOne: vi.fn(),
});

const mockMenuItemRepo = () => ({
  find: vi.fn(),
});

describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: ReturnType<typeof mockOrderRepo>;
  let tableRepo: ReturnType<typeof mockTableRepo>;
  let menuItemRepo: ReturnType<typeof mockMenuItemRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useFactory: mockOrderRepo },
        { provide: getRepositoryToken(Table), useFactory: mockTableRepo },
        { provide: getRepositoryToken(MenuItem), useFactory: mockMenuItemRepo },
      ],
    }).compile();

    service = module.get(OrderService);
    orderRepo = module.get(getRepositoryToken(Order));
    tableRepo = module.get(getRepositoryToken(Table));
    menuItemRepo = module.get(getRepositoryToken(MenuItem));
  });

  afterEach(() => vi.clearAllMocks());

  describe('createPublic', () => {
    const mockTable = { id: TABLE_ID, tenantId: TENANT, name: 'Зал 1' };
    const mockMenuItem = { id: ITEM_ID, tenantId: TENANT, name: 'Burger', price: 9.99, isAvailable: true };
    const dto = { tenantId: TENANT, tableId: TABLE_ID, items: [{ menuItemId: ITEM_ID, quantity: 2 }] };

    it('returns orderId and status NEW on successful creation', async () => {
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([mockMenuItem]);
      const saved = { id: ORDER_ID, status: OrderStatus.NEW };
      orderRepo.create.mockReturnValue(saved);
      orderRepo.save.mockResolvedValue(saved);

      const result = await service.createPublic(dto);

      expect(result).toEqual({ orderId: ORDER_ID, status: OrderStatus.NEW });
    });

    it('calculates totalAmount from DB price, ignoring any client value', async () => {
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([mockMenuItem]);
      orderRepo.create.mockImplementation((data) => data);
      orderRepo.save.mockImplementation((data) => Promise.resolve({ ...data, id: ORDER_ID }));

      await service.createPublic(dto);

      expect(orderRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: 9.99 * 2 }),
      );
    });

    it('snapshots name and price from DB into items JSONB', async () => {
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([mockMenuItem]);
      orderRepo.create.mockImplementation((data) => data);
      orderRepo.save.mockImplementation((data) => Promise.resolve({ ...data, id: ORDER_ID }));

      await service.createPublic(dto);

      expect(orderRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ menuItemId: ITEM_ID, name: 'Burger', price: 9.99, quantity: 2 }],
        }),
      );
    });

    it('snapshots tableName from table.name at order creation', async () => {
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([mockMenuItem]);
      orderRepo.create.mockImplementation((data) => data);
      orderRepo.save.mockImplementation((data) => Promise.resolve({ ...data, id: ORDER_ID }));

      await service.createPublic(dto);

      expect(orderRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tableName: 'Зал 1' }),
      );
    });

    it('calculates correct totalAmount for multiple distinct items', async () => {
      const item2 = { id: 'item2-uuid', tenantId: TENANT, name: 'Fries', price: 3.5, isAvailable: true };
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([mockMenuItem, item2]);
      orderRepo.create.mockImplementation((data) => data);
      orderRepo.save.mockImplementation((data) => Promise.resolve({ ...data, id: ORDER_ID }));

      const multiDto = {
        tenantId: TENANT,
        tableId: TABLE_ID,
        items: [
          { menuItemId: ITEM_ID, quantity: 1 },
          { menuItemId: 'item2-uuid', quantity: 2 },
        ],
      };

      await service.createPublic(multiDto);

      const expected = 9.99 * 1 + 3.5 * 2;
      expect(orderRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: expected }),
      );
    });

    it('throws NotFoundException when table does not belong to tenant', async () => {
      tableRepo.findOne.mockResolvedValue(null);

      await expect(service.createPublic(dto)).rejects.toThrow(NotFoundException);
      expect(menuItemRepo.find).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when a menu item does not exist for tenant', async () => {
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([]);

      await expect(service.createPublic(dto)).rejects.toThrow(NotFoundException);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when a menu item is unavailable', async () => {
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([{ ...mockMenuItem, isAvailable: false }]);

      await expect(service.createPublic(dto)).rejects.toThrow(UnprocessableEntityException);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException listing only the missing item ids', async () => {
      const missingId = 'missing-uuid';
      tableRepo.findOne.mockResolvedValue(mockTable);
      menuItemRepo.find.mockResolvedValue([mockMenuItem]);

      const dtoWithMissing = {
        tenantId: TENANT,
        tableId: TABLE_ID,
        items: [
          { menuItemId: ITEM_ID, quantity: 1 },
          { menuItemId: missingId, quantity: 1 },
        ],
      };

      await expect(service.createPublic(dtoWithMissing)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns paginated result with default page=1 and limit=20', async () => {
      const orders = [{ id: ORDER_ID, tenantId: TENANT }] as Order[];
      const qb = makeQb({ getManyAndCount: vi.fn().mockResolvedValue([orders, 1]) });
      orderRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(TENANT, {});

      expect(result.data).toEqual(orders);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('applies offset based on page and limit', async () => {
      const qb = makeQb();
      orderRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(TENANT, { page: 3, limit: 10 });

      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('applies status filter when provided', async () => {
      const qb = makeQb();
      orderRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(TENANT, { status: OrderStatus.NEW });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'order.status = :status',
        { status: OrderStatus.NEW },
      );
    });

    it('applies tableId filter when provided', async () => {
      const qb = makeQb();
      orderRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(TENANT, { tableId: TABLE_ID });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'order.tableId = :tableId',
        { tableId: TABLE_ID },
      );
    });

    it('does not apply optional filters when absent', async () => {
      const qb = makeQb();
      orderRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(TENANT, {});

      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('adds secondary sort by id DESC for stable pagination', async () => {
      const qb = makeQb();
      orderRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(TENANT, {});

      expect(qb.addOrderBy).toHaveBeenCalledWith('order.id', 'DESC');
    });

    it('returns multiple orders correctly', async () => {
      const orders = [
        { id: 'o1', tenantId: TENANT },
        { id: 'o2', tenantId: TENANT },
      ] as Order[];
      const qb = makeQb({ getManyAndCount: vi.fn().mockResolvedValue([orders, 2]) });
      orderRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll(TENANT, {});

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('findOne', () => {
    it('returns the order when found', async () => {
      const order = { id: ORDER_ID, tenantId: TENANT } as Order;
      orderRepo.findOne.mockResolvedValue(order);

      const result = await service.findOne(TENANT, ORDER_ID);

      expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { id: ORDER_ID, tenantId: TENANT } });
      expect(result).toEqual(order);
    });

    it('throws NotFoundException when order not found for this tenant', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(TENANT, ORDER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    const makeOrder = (status: OrderStatus) =>
      ({ id: ORDER_ID, tenantId: TENANT, status }) as Order;

    it('transitions NEW → IN_PROGRESS', async () => {
      const order = makeOrder(OrderStatus.NEW);
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.IN_PROGRESS });

      const result = await service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.IN_PROGRESS });

      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
    });

    it('transitions NEW → CANCELLED', async () => {
      const order = makeOrder(OrderStatus.NEW);
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED });

      const result = await service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.CANCELLED });

      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('transitions IN_PROGRESS → DONE', async () => {
      const order = makeOrder(OrderStatus.IN_PROGRESS);
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.DONE });

      const result = await service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.DONE });

      expect(result.status).toBe(OrderStatus.DONE);
    });

    it('transitions IN_PROGRESS → CANCELLED', async () => {
      const order = makeOrder(OrderStatus.IN_PROGRESS);
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED });

      const result = await service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.CANCELLED });

      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('throws BadRequestException for NEW → DONE (invalid transition)', async () => {
      const order = makeOrder(OrderStatus.NEW);
      orderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.DONE }),
      ).rejects.toThrow(BadRequestException);
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for DONE → CANCELLED (terminal state)', async () => {
      const order = makeOrder(OrderStatus.DONE);
      orderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.CANCELLED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CANCELLED → IN_PROGRESS (terminal state)', async () => {
      const order = makeOrder(OrderStatus.CANCELLED);
      orderRepo.findOne.mockResolvedValue(order);

      await expect(
        service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.IN_PROGRESS }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when order does not belong to tenant', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(TENANT, ORDER_ID, { status: OrderStatus.IN_PROGRESS }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
