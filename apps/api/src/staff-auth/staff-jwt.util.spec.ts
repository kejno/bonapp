import { UnauthorizedException } from '@nestjs/common';
import { signToken, verifyToken, buildTokenPair } from './staff-jwt.util';

const SECRET = 'unit-test-secret';

describe('signToken / verifyToken', () => {
  it('round-trips a valid access token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(
      {
        sub: 'u1',
        userId: 'u1',
        tenantId: 't1',
        role: 'WAITER',
        type: 'access',
        jti: 'jti-1',
        exp: now + 900,
      },
      SECRET,
    );
    const payload = verifyToken(token, SECRET);
    expect(payload.userId).toBe('u1');
    expect(payload.tenantId).toBe('t1');
    expect(payload.role).toBe('WAITER');
    expect(payload.type).toBe('access');
  });

  it('throws UnauthorizedException for an expired token', () => {
    const token = signToken(
      {
        sub: 'u1',
        userId: 'u1',
        tenantId: 't1',
        role: 'WAITER',
        type: 'access',
        jti: 'jti-2',
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      SECRET,
    );
    expect(() => verifyToken(token, SECRET)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when signature is tampered', () => {
    const token = signToken(
      {
        sub: 'u1',
        userId: 'u1',
        tenantId: 't1',
        role: 'WAITER',
        type: 'access',
        jti: 'jti-3',
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      SECRET,
    );
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(() => verifyToken(tampered, SECRET)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for a completely invalid token string', () => {
    expect(() => verifyToken('not.a.valid.jwt', SECRET)).toThrow(
      UnauthorizedException,
    );
  });
});

describe('buildTokenPair', () => {
  it('produces distinct access and refresh tokens', () => {
    const { accessToken, refreshToken } = buildTokenPair(
      'u1',
      't1',
      'MANAGER',
      SECRET,
    );
    expect(accessToken).not.toBe(refreshToken);
  });

  it('access token has type=access', () => {
    const { accessToken } = buildTokenPair('u1', 't1', 'MANAGER', SECRET);
    const payload = verifyToken(accessToken, SECRET);
    expect(payload.type).toBe('access');
  });

  it('refresh token has type=refresh', () => {
    const { refreshToken } = buildTokenPair('u1', 't1', 'MANAGER', SECRET);
    const payload = verifyToken(refreshToken, SECRET);
    expect(payload.type).toBe('refresh');
  });

  it('produces different jtis for two calls (uniqueness of multiple pairs)', () => {
    const pair1 = buildTokenPair('u1', 't1', 'WAITER', SECRET);
    const pair2 = buildTokenPair('u1', 't1', 'WAITER', SECRET);
    const p1 = verifyToken(pair1.refreshToken, SECRET);
    const p2 = verifyToken(pair2.refreshToken, SECRET);
    expect(p1.jti).not.toBe(p2.jti);
  });
});
