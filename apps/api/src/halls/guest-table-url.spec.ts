import { createGuestTableUrl } from './guest-table-url';

describe('createGuestTableUrl', () => {
  it('includes the stable qr token instead of the internal table id', () => {
    const url = new URL(createGuestTableUrl('https://guest.example/menu', 'stable-qr-token'));

    expect(url.searchParams.get('qr_token')).toBe('stable-qr-token');
    expect(url.searchParams.has('table')).toBe(false);
  });
});
