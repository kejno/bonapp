import { decodeTenantName } from './AdminLayout';

describe('decodeTenantName', () => {
  it('extracts tenantName from a valid base64url JWT payload', () => {
    const payload = JSON.stringify({ tenantName: 'My Cafe', sub: 'user-1' });
    const b64url = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(decodeTenantName(`header.${b64url}.sig`)).toBe('My Cafe');
  });

  it('handles base64url payload where - replaces + (would throw with plain atob)', () => {
    // Bytes 0xFB at position 33 (mod 3 = 0) guarantee base64 char 0 = '+' = 62 (0xFB >> 2)
    // Real JWTs always use base64url (RFC 7515), so this edge case is always present
    const padChars = String.fromCharCode(0xfb, 0xe0);
    const raw = `{"tenantName":"Test Cafe","_xx":"${padChars}"}`;
    const b64 = btoa(raw);
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(b64url).toContain('-');
    // Old code: atob(b64url) throws on '-' → returns ''. New code: fix chars → returns correct name.
    expect(decodeTenantName(`header.${b64url}.sig`)).toBe('Test Cafe');
  });

  it('returns empty string when tenantName field is absent', () => {
    const b64url = btoa(JSON.stringify({ sub: 'user-1' })).replace(/=/g, '');
    expect(decodeTenantName(`header.${b64url}.sig`)).toBe('');
  });

  it('returns empty string for malformed token', () => {
    expect(decodeTenantName('not-a-jwt')).toBe('');
    expect(decodeTenantName('')).toBe('');
  });
});
