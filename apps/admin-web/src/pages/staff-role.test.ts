import { describe, expect, it } from 'vitest';
import { STAFF_ROLES } from './staff-role';

describe('staff role descriptions', () => {
  it('documents the four supported roles', () => {
    expect(STAFF_ROLES.map(({ role }) => role)).toEqual(['WAITER', 'CASHIER', 'MANAGER', 'ADMIN']);
    expect(STAFF_ROLES.find(({ role }) => role === 'WAITER')?.description).toContain('свои столы');
    expect(STAFF_ROLES.find(({ role }) => role === 'ADMIN')?.description).toContain('настройки');
  });
});
