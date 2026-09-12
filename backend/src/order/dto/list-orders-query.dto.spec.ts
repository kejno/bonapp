import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListOrdersQueryDto } from './list-orders-query.dto.js';

describe('ListOrdersQueryDto', () => {
  describe('limit', () => {
    it('accepts valid limit within bounds', async () => {
      const dto = plainToInstance(ListOrdersQueryDto, { limit: '50' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'limit')).toBeUndefined();
    });

    it('rejects limit exceeding 100', async () => {
      const dto = plainToInstance(ListOrdersQueryDto, { limit: '101' });
      const errors = await validate(dto);
      const limitErrors = errors.find((e) => e.property === 'limit');
      expect(limitErrors).toBeDefined();
      expect(Object.keys(limitErrors!.constraints ?? {})).toContain('max');
    });

    it('rejects limit=1000000 (potential DoS vector)', async () => {
      const dto = plainToInstance(ListOrdersQueryDto, { limit: '1000000' });
      const errors = await validate(dto);
      const limitErrors = errors.find((e) => e.property === 'limit');
      expect(limitErrors).toBeDefined();
    });

    it('accepts limit=100 (boundary value)', async () => {
      const dto = plainToInstance(ListOrdersQueryDto, { limit: '100' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'limit')).toBeUndefined();
    });

    it('rejects limit=0 (below minimum)', async () => {
      const dto = plainToInstance(ListOrdersQueryDto, { limit: '0' });
      const errors = await validate(dto);
      const limitErrors = errors.find((e) => e.property === 'limit');
      expect(limitErrors).toBeDefined();
    });
  });
});
