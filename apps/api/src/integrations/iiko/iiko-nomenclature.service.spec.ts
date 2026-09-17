import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IikoNomenclatureService } from './iiko-nomenclature.service';
import { IikoNomenclatureResponse } from './iiko.types';

const MOCK_RESPONSE: IikoNomenclatureResponse = {
  correlationId: 'corr-1',
  groups: [
    { id: 'grp-1', name: 'Burgers', isDeleted: false, parentGroup: null },
    { id: 'grp-2', name: 'Deleted Group', isDeleted: true, parentGroup: null },
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

describe('IikoNomenclatureService', () => {
  let service: IikoNomenclatureService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        IikoNomenclatureService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: string) =>
              key === 'IIKO_API_BASE_URL' ? 'https://mock-iiko.test' : def,
          },
        },
      ],
    }).compile();

    service = module.get(IikoNomenclatureService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches nomenclature with token as query param', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => MOCK_RESPONSE,
    } as Response);

    const result = await service.fetchNomenclature('concept-123', 'my-token');

    expect(result).toEqual(MOCK_RESPONSE);
    expect(fetch).toHaveBeenCalledWith(
      'https://mock-iiko.test/api/0/nomenclature/concept-123?access_token=my-token',
    );
  });

  it('throws when iiko API returns non-ok response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(service.fetchNomenclature('concept-123', 'my-token')).rejects.toThrow(
      'iiko nomenclature fetch failed with status 503',
    );
  });
});
