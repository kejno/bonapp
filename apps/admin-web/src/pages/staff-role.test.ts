import { describe, expect, it } from 'vitest';
import { STAFF_ROLES } from './staff-role';

describe('staff role descriptions', () => {
  it('documents the roles supported by the staff API', () => {
    expect(STAFF_ROLES.map(({ role }) => role)).toEqual(['WAITER', 'CASHIER', 'MANAGER']);
    expect(STAFF_ROLES.find(({ role }) => role === 'WAITER')?.description).toContain('свои столы');
  });
});
