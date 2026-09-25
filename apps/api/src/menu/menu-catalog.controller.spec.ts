import { BadRequestException } from '@nestjs/common';
import { MenuCatalogController } from './menu-catalog.controller';
import { MenuCatalogService } from './menu-catalog.service';

describe('MenuCatalogController', () => {
  const updateCategory = jest.fn();
  const catalogService = { updateCategory } as unknown as MenuCatalogService;
  const controller = new MenuCatalogController(catalogService);

  it('rejects a non-string POS category identifier without producing an update DTO', () => {
    expect(() =>
      (controller as unknown as { parseUpdateCategory(body: unknown): unknown }).parseUpdateCategory({
        posCategoryId: 123,
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts an explicit null POS category identifier for removal', () => {
    expect(
      (controller as unknown as { parseUpdateCategory(body: unknown): unknown }).parseUpdateCategory({
        posCategoryId: null,
      }),
    ).toEqual({ posCategoryId: null });
  });

  it('does not invoke the update service for a malformed POS category identifier', () => {
    expect(() =>
      controller.updateCategory(
        { user: { tenantId: 'tenant-1' } } as never,
        'category-1',
        { posCategoryId: 123 },
      ),
    ).toThrow(BadRequestException);
    expect(updateCategory).not.toHaveBeenCalled();
  });
});
