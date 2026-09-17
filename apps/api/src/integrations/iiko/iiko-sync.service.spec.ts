import { Test } from '@nestjs/testing';
import { IikoSyncService } from './iiko-sync.service';
import { IikoAuthService } from './iiko-auth.service';
import { IikoNomenclatureService } from './iiko-nomenclature.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IikoNomenclatureResponse } from './iiko.types';

const TENANT_ID = 'tenant-abc';

const BASE_NOMENCLATURE: IikoNomenclatureResponse = {
  correlationId: 'corr-1',
  groups: [
    { id: 'grp-1', name: 'Burgers', isDeleted: false, parentGroup: null },
  ],
  products: [
    {
      id: 'prod-1',
      name: 'Classic Burger',
      price: 9.99,
      groupId: 'grp-1',
      imageLinks: ['https://cdn.example.com/burger.jpg'],
      isDeleted: false,
    },
  ],
};

function buildMockPrisma() {
  const tx = {
    menuCategory: {
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'cat-id-1', ...create })),
    },
    menuItem: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return {
    posIntegrationConfig: {
      findUnique: jest.fn().mockResolvedValue({
        config: { login: 'user', password_encrypted: 'enc', concept_id: 'cpt-1' },
      }),
    },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    _tx: tx,
  };
}

describe('IikoSyncService', () => {
  let service: IikoSyncService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAuth: { getToken: jest.Mock };
  let mockNomenclature: { fetchNomenclature: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAuth = { getToken: jest.fn().mockResolvedValue('mock-token') };
    mockNomenclature = {
      fetchNomenclature: jest.fn().mockResolvedValue(BASE_NOMENCLATURE),
    };

    const module = await Test.createTestingModule({
      providers: [
        IikoSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IikoAuthService, useValue: mockAuth },
        { provide: IikoNomenclatureService, useValue: mockNomenclature },
      ],
    }).compile();

    service = module.get(IikoSyncService);
  });

  it('upserts a category and a menu item from iiko response', async () => {
    await service.syncForTenant(TENANT_ID);

    expect(mockPrisma._tx.menuCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_posCategoryId: { tenantId: TENANT_ID, posCategoryId: 'grp-1' } },
        create: expect.objectContaining({ tenantId: TENANT_ID, name: 'Burgers', posCategoryId: 'grp-1' }),
        update: { name: 'Burgers' },
      }),
    );

    expect(mockPrisma._tx.menuItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_posItemId: { tenantId: TENANT_ID, posItemId: 'prod-1' } },
        create: expect.objectContaining({
          tenantId: TENANT_ID,
          name: 'Classic Burger',
          posItemId: 'prod-1',
          isActive: true,
        }),
        update: expect.objectContaining({
          name: 'Classic Burger',
          isActive: true,
        }),
      }),
    );
  });

  it('does not duplicate items — calls upsert once per product, not create+create', async () => {
    const twoProductNomenclature: IikoNomenclatureResponse = {
      ...BASE_NOMENCLATURE,
      products: [
        {
          id: 'prod-1',
          name: 'Classic Burger',
          price: 9.99,
          groupId: 'grp-1',
          imageLinks: [],
          isDeleted: false,
        },
        {
          id: 'prod-2',
          name: 'Cheese Burger',
          price: 11.5,
          groupId: 'grp-1',
          imageLinks: [],
          isDeleted: false,
        },
      ],
    };

    mockNomenclature.fetchNomenclature.mockResolvedValue(twoProductNomenclature);

    await service.syncForTenant(TENANT_ID);

    expect(mockPrisma._tx.menuItem.upsert).toHaveBeenCalledTimes(2);
    const calls = mockPrisma._tx.menuItem.upsert.mock.calls;
    const calledIds = calls.map((c) => c[0].where.tenantId_posItemId.posItemId);
    expect(calledIds).toEqual(['prod-1', 'prod-2']);
  });

  it('soft-deletes items missing from iiko response', async () => {
    await service.syncForTenant(TENANT_ID);

    expect(mockPrisma._tx.menuItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_ID }),
        data: { isActive: false },
      }),
    );
  });

  it('skips deleted iiko groups and products', async () => {
    const nomenclatureWithDeleted: IikoNomenclatureResponse = {
      correlationId: 'corr-x',
      groups: [
        { id: 'grp-1', name: 'Burgers', isDeleted: false, parentGroup: null },
        { id: 'grp-deleted', name: 'Hidden', isDeleted: true, parentGroup: null },
      ],
      products: [
        {
          id: 'prod-1',
          name: 'Classic Burger',
          price: 9.99,
          groupId: 'grp-1',
          imageLinks: [],
          isDeleted: false,
        },
        {
          id: 'prod-deleted',
          name: 'Off Menu',
          price: 1.0,
          groupId: 'grp-1',
          imageLinks: [],
          isDeleted: true,
        },
      ],
    };

    mockNomenclature.fetchNomenclature.mockResolvedValue(nomenclatureWithDeleted);

    await service.syncForTenant(TENANT_ID);

    expect(mockPrisma._tx.menuCategory.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.menuCategory.upsert.mock.calls[0][0].create.posCategoryId).toBe('grp-1');

    expect(mockPrisma._tx.menuItem.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma._tx.menuItem.upsert.mock.calls[0][0].create.posItemId).toBe('prod-1');
  });

  it('throws when no iiko integration config exists for tenant', async () => {
    mockPrisma.posIntegrationConfig.findUnique.mockResolvedValue(null);

    await expect(service.syncForTenant(TENANT_ID)).rejects.toThrow(
      `No iiko integration configured for tenant ${TENANT_ID}`,
    );
  });

  it('maps product to the correct category from groups', async () => {
    mockPrisma._tx.menuCategory.upsert.mockImplementation(({ where }) =>
      Promise.resolve({ id: `cat-${where.tenantId_posCategoryId.posCategoryId}` }),
    );

    await service.syncForTenant(TENANT_ID);

    const upsertCall = mockPrisma._tx.menuItem.upsert.mock.calls[0][0];
    expect(upsertCall.create.categoryId).toBe('cat-grp-1');
  });
});
