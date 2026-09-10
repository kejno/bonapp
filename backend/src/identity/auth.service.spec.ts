import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service.js';
import { Tenant } from './entities/tenant.entity.js';
import { Role, User } from './entities/user.entity.js';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

const mockTenantRepo = () => ({
  findOne: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
});

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
  let tenantRepo: ReturnType<typeof mockTenantRepo>;
  let userRepo: ReturnType<typeof mockUserRepo>;
  let jwtService: ReturnType<typeof mockJwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(Tenant), useFactory: mockTenantRepo },
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
        { provide: JwtService, useFactory: mockJwtService },
      ],
    }).compile();

    service = module.get(AuthService);
    tenantRepo = module.get(getRepositoryToken(Tenant));
    userRepo = module.get(getRepositoryToken(User));
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateSlug', () => {
    it('converts name to kebab-case slug', () => {
      expect(service.generateSlug('My Cafe')).toBe('my-cafe');
    });

    it('strips special characters', () => {
      expect(service.generateSlug('Кафе! My#Café')).toBe('my-caf');
    });

    it('collapses multiple spaces and hyphens', () => {
      expect(service.generateSlug('My  Great  Cafe')).toBe('my-great-cafe');
    });

    it('trims leading and trailing hyphens', () => {
      expect(service.generateSlug('  cafe  ')).toBe('cafe');
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

    it('creates tenant and owner user, returns access token', async () => {
      tenantRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      tenantRepo.create.mockReturnValue(savedTenant);
      tenantRepo.save.mockResolvedValue(savedTenant);
      userRepo.create.mockReturnValue(savedUser);
      userRepo.save.mockResolvedValue(savedUser);
      jwtService.sign.mockReturnValue('jwt-token');

      const result = await service.register(dto);

      expect(tenantRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'my-cafe' } });
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: dto.email } });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10);
      expect(tenantRepo.save).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalled();
      expect(result).toEqual({ accessToken: 'jwt-token' });
    });

    it('throws ConflictException when slug already exists', async () => {
      tenantRepo.findOne.mockResolvedValue(savedTenant);

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws ConflictException when email already exists', async () => {
      tenantRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(savedUser);

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });

    it('assigns OWNER role to registered user', async () => {
      tenantRepo.findOne.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as never);
      tenantRepo.create.mockReturnValue(savedTenant);
      tenantRepo.save.mockResolvedValue(savedTenant);
      userRepo.create.mockReturnValue(savedUser);
      userRepo.save.mockResolvedValue(savedUser);
      jwtService.sign.mockReturnValue('jwt-token');

      await service.register(dto);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: Role.OWNER }),
      );
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
