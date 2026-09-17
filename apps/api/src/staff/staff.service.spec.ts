import { Test, TestingModule } from '@nestjs/testing';
import { StaffService } from './staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

const mockMember = {
  id: 'member-1',
  tenantId: 'tenant-1',
  name: 'Иван Иванов',
  role: 'WAITER' as const,
  phone: '+375291234567',
  isActive: true,
  lastLoginAt: null,
  passwordHash: 'hash',
  mustChangePassword: true,
  createdAt: new Date('2026-09-17'),
  updatedAt: new Date('2026-09-17'),
};

const mockPrisma = {
  staffMember: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('StaffService', () => {
  let service: StaffService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns all staff members for tenant', async () => {
      mockPrisma.staffMember.findMany.mockResolvedValue([mockMember]);
      const result = await service.findAll('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Иван Иванов');
      expect(result[0].role).toBe('WAITER');
      expect(mockPrisma.staffMember.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when no staff members', async () => {
      mockPrisma.staffMember.findMany.mockResolvedValue([]);
      const result = await service.findAll('tenant-1');
      expect(result).toEqual([]);
    });

    it('maps multiple members correctly', async () => {
      const second = { ...mockMember, id: 'member-2', name: 'Анна Кассир', role: 'CASHIER' as const };
      mockPrisma.staffMember.findMany.mockResolvedValue([mockMember, second]);
      const result = await service.findAll('tenant-1');
      expect(result).toHaveLength(2);
      expect(result[1].role).toBe('CASHIER');
    });
  });

  describe('create', () => {
    it('creates a staff member with hashed password', async () => {
      mockPrisma.staffMember.create.mockResolvedValue(mockMember);
      const result = await service.create('tenant-1', {
        name: 'Иван Иванов',
        role: 'WAITER',
        phone: '+375291234567',
        temporaryPassword: 'secret123',
      });
      expect(result.name).toBe('Иван Иванов');
      expect(mockPrisma.staffMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            name: 'Иван Иванов',
            role: 'WAITER',
            phone: '+375291234567',
            mustChangePassword: true,
          }),
        }),
      );
    });

    it('stores a bcrypt hash, not the plain password', async () => {
      mockPrisma.staffMember.create.mockResolvedValue(mockMember);
      await service.create('tenant-1', {
        name: 'Test',
        role: 'WAITER',
        phone: '+375',
        temporaryPassword: 'plaintext',
      });
      const callArg = mockPrisma.staffMember.create.mock.calls[0][0];
      expect(callArg.data.passwordHash).not.toBe('plaintext');
      expect(callArg.data.passwordHash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('update', () => {
    it('updates allowed fields', async () => {
      const updated = { ...mockMember, name: 'Новое Имя' };
      mockPrisma.staffMember.findFirst.mockResolvedValue(mockMember);
      mockPrisma.staffMember.update.mockResolvedValue(updated);
      const result = await service.update('tenant-1', 'member-1', { name: 'Новое Имя' });
      expect(result.name).toBe('Новое Имя');
    });

    it('throws NotFoundException when member not found', async () => {
      mockPrisma.staffMember.findFirst.mockResolvedValue(null);
      await expect(service.update('tenant-1', 'missing', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', async () => {
      const deactivated = { ...mockMember, isActive: false };
      mockPrisma.staffMember.findFirst.mockResolvedValue(mockMember);
      mockPrisma.staffMember.update.mockResolvedValue(deactivated);
      const result = await service.deactivate('tenant-1', 'member-1');
      expect(result.isActive).toBe(false);
      expect(mockPrisma.staffMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false },
        }),
      );
    });

    it('throws NotFoundException when member not found', async () => {
      mockPrisma.staffMember.findFirst.mockResolvedValue(null);
      await expect(service.deactivate('tenant-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });
});
