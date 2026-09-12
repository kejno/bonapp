import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto, CreateOrderItemDto } from './create-order.dto.js';

const makeItem = (overrides = {}) => ({ menuItemId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', quantity: 1, ...overrides });

describe('CreateOrderItemDto', () => {
  describe('quantity', () => {
    it('accepts quantity=1 (minimum)', async () => {
      const dto = plainToInstance(CreateOrderItemDto, makeItem({ quantity: 1 }));
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'quantity')).toBeUndefined();
    });

    it('accepts quantity=999 (maximum boundary)', async () => {
      const dto = plainToInstance(CreateOrderItemDto, makeItem({ quantity: 999 }));
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'quantity')).toBeUndefined();
    });

    it('rejects quantity=1000 (exceeds maximum)', async () => {
      const dto = plainToInstance(CreateOrderItemDto, makeItem({ quantity: 1000 }));
      const errors = await validate(dto);
      const quantityErrors = errors.find((e) => e.property === 'quantity');
      expect(quantityErrors).toBeDefined();
      expect(Object.keys(quantityErrors!.constraints ?? {})).toContain('max');
    });

    it('rejects quantity=1000000 (potential abuse)', async () => {
      const dto = plainToInstance(CreateOrderItemDto, makeItem({ quantity: 1_000_000 }));
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'quantity')).toBeDefined();
    });

    it('rejects quantity=0 (below minimum)', async () => {
      const dto = plainToInstance(CreateOrderItemDto, makeItem({ quantity: 0 }));
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'quantity')).toBeDefined();
    });
  });
});

describe('CreateOrderDto', () => {
  const TENANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const TABLE_ID = 'b1ffcd00-0d1c-5fg9-cc7e-7cc0ce491b22';

  const makeDto = (overrides = {}) => ({
    tenantId: TENANT_ID,
    tableId: TABLE_ID,
    items: [makeItem()],
    ...overrides,
  });

  describe('items', () => {
    it('accepts items array with 1 element (minimum)', async () => {
      const dto = plainToInstance(CreateOrderDto, makeDto());
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'items')).toBeUndefined();
    });

    it('accepts items array with 50 elements (maximum boundary)', async () => {
      const dto = plainToInstance(CreateOrderDto, makeDto({ items: Array.from({ length: 50 }, () => makeItem()) }));
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'items')).toBeUndefined();
    });

    it('rejects items array with 51 elements (exceeds maximum)', async () => {
      const dto = plainToInstance(CreateOrderDto, makeDto({ items: Array.from({ length: 51 }, () => makeItem()) }));
      const errors = await validate(dto);
      const itemsErrors = errors.find((e) => e.property === 'items');
      expect(itemsErrors).toBeDefined();
      expect(Object.keys(itemsErrors!.constraints ?? {})).toContain('arrayMaxSize');
    });

    it('rejects empty items array', async () => {
      const dto = plainToInstance(CreateOrderDto, makeDto({ items: [] }));
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'items')).toBeDefined();
    });

    it('rejects 1000-element items array (potential DoS vector)', async () => {
      const dto = plainToInstance(CreateOrderDto, makeDto({ items: Array.from({ length: 1000 }, () => makeItem()) }));
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'items')).toBeDefined();
    });
  });
});
