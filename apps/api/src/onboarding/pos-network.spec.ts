import { isPublicIpv4, isAllowedPosHost, selectPublicIpv4 } from './pos-network';

describe('POS network destination validation', () => {
  it.each(['127.0.0.1', '10.0.0.2', '169.254.169.254', '172.20.1.1', '192.168.1.2'])('rejects private address %s', (address) => {
    expect(isPublicIpv4(address)).toBe(false);
  });

  it('accepts a public IPv4 address', () => {
    expect(isPublicIpv4('8.8.8.8')).toBe(true);
  });

  it('allows only explicitly configured POS hosts', () => {
    expect(isAllowedPosHost('pos.example.com', 'pos.example.com,api.vendor.net')).toBe(true);
    expect(isAllowedPosHost('evil-pos.example.com', 'pos.example.com')).toBe(false);
    expect(isAllowedPosHost('pos.example.com.evil.test', 'pos.example.com')).toBe(false);
  });

  it('accepts a public IPv4 when DNS also returns IPv6', () => {
    expect(selectPublicIpv4([
      { address: '2001:db8::1', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ])).toBe('8.8.8.8');
  });

  it('rejects DNS results containing a private IPv4 alongside a public IPv4', () => {
    expect(() => selectPublicIpv4([
      { address: '8.8.8.8', family: 4 },
      { address: '192.168.1.2', family: 4 },
      { address: '2001:db8::1', family: 6 },
    ])).toThrow();
  });
});
