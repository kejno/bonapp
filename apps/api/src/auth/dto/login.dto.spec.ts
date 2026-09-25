import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('rejects empty credentials and an invalid TOTP code', async () => {
    const dto = Object.assign(new LoginDto(), {
      login: '',
      password: '',
      totpCode: 'abc123',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['login', 'password', 'totpCode']),
    );
  });

  it('accepts credentials with no TOTP code or a six-digit TOTP code', async () => {
    const withoutTotp = Object.assign(new LoginDto(), {
      login: 'admin@example.com',
      password: 'password',
    });
    const withTotp = Object.assign(new LoginDto(), {
      login: '+375291234567',
      password: 'password',
      totpCode: '123456',
    });

    await expect(validate(withoutTotp)).resolves.toHaveLength(0);
    await expect(validate(withTotp)).resolves.toHaveLength(0);
  });

  it('rejects credentials that exceed the supported input length', async () => {
    const dto = Object.assign(new LoginDto(), {
      login: 'a'.repeat(255),
      password: 'a'.repeat(129),
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['login', 'password']),
    );
  });
});
