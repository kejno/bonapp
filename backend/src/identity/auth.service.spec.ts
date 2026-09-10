import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service.js';
import { Tenant } from './entities/tenant.entity.js';
import { Role, User } from './entities/user.entity.js';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

const mockUserRepo = () => ({
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
});

const mockJwtService = () => ({
  sign: vi.fn(),
});

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let jwtService: ReturnType<typeof mockJwtService>;
  let em: { findOne: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let dataSource: { transaction: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    em = { findOne: vi.fn(), create: vi.fn(), save: vi.fn() };
    dataSource = {
      transaction: vi.fn().mockImplementation(async (fn: (em: any) => Promise<any>) => fn(em)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: JwtService, useFactory: mockJwtService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(AuthService);
    userRepo = module.get(getRepositoryToken(User));
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSlug', () => {
    it('converts name to kebab-case slug', () => {
      expect((service as any).generateSlug('My Cafe')).toBe('my-cafe');
    });

    it('strips special characters', () => {
      expect((service as any).generateSlug('Кафе! My#Café')).toBe('my-caf');
    });

    it('collapses multiple spaces and hyphens', () => {
      expect((service as any).generateSlug('My  Great  Cafe')).toBe('my-great-cafe');
    });

    it('trims leading and trailing hyphens', () => {
      expect((service as any).generateSlug('  cafe  ')).toBe('cafe');
    });

    it('returns empty string for purely Cyrillic input', () => {
      expect((service as any).generateSlug('Кафе Петра')).toBe('');
    });
  });

  describe('register', () => {
    const dto = { name: 'My Cafe', email: 'owner@test.com', password: 'secret123' };
    const savedTenant = { id: 'tenant-uuid', name: 'My Cafe', slug: 'my-cafe' };
    const savedUser: User = {
      id: 'user-uuid',
      tenantId: 'tenant-uuid',
      email: 'owner@test.com',
      passwordHash: 'hashed',
      role: Role.OWNER,
    };

    it('creates tenant and owner user inside a transaction, returns access token', async () => {
      em.findOne.mockResolvedValueOnce(null); // no existing tenant
      em.findOne.mockResolvedValueOnce(null); // no existing user
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      em.create.mockReturnValueOnce(savedTenant);
      em.save.mockResolvedValueOnce(savedTenant);
      em.create.mockReturnValueOnce(savedUser);
      em.save.mockResolvedValueOnce(savedUser);
      jwtService.sign.mockReturnValue('jwt-token');

      const result = await service.register(dto);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(em.findOne).toHaveBeenCalledWith(Tenant, { where: { slug: 'my-cafe' } });
      expect(em.findOne).toHaveBeenCalledWith(User, { where: { email: dto.email } });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10);
      expect(em.save).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ accessToken: 'jwt-token' });
    });

    it('throws ConflictException when slug already exists', async () => {
      em.findOne.mockResolvedValueOnce(savedTenant); // tenant found

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(em.findOne).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when email already exists', async () => {
      em.findOne.mockResolvedValueOnce(null); // no tenant
      em.findOne.mockResolvedValueOnce(savedUser); // user found

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('assigns OWNER role to registered user', async () => {
      em.findOne.mockResolvedValueOnce(null);
      em.findOne.mockResolvedValueOnce(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      em.create.mockReturnValueOnce(savedTenant);
      em.save.mockResolvedValueOnce(savedTenant);
      em.create.mockReturnValueOnce(savedUser);
      em.save.mockResolvedValueOnce(savedUser);
      jwtService.sign.mockReturnValue('jwt-token');

      await service.register(dto);

      expect(em.create).toHaveBeenCalledWith(User, expect.objectContaining({ role: Role.OWNER }));
    });

    it('throws BadRequestException when venue name produces an empty slug (Cyrillic only)', async () => {
      const cyrillicDto = { name: 'Кафе Петра', email: 'owner@test.com', password: 'secret123' };

      await expect(service.register(cyrillicDto)).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'owner@test.com', password: 'secret123' };
    const user: User = {
      id: 'user-uuid',
      tenantId: 'tenant-uuid',
      email: 'owner@test.com',
      passwordHash: 'hashed',
      role: Role.OWNER,
    };

    it('returns access token on valid credentials', async () => {
      userRepo.findOne.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login(dto);

      expect(result).toEqual({ accessToken: 'jwt-token' });
    });

    it('throws UnauthorizedException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when password does not match', async () => {
      userRepo.findOne.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('includes userId, tenantId, and role in JWT payload', async () => {
      userRepo.findOne.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      jwtService.sign.mockReturnValue('jwt-token');

      await service.login(dto);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
      });
    });
  });
});
