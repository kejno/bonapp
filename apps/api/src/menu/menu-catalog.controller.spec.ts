import { BadRequestException } from '@nestjs/common';
import { MediaController, MenuCatalogController } from './menu-catalog.controller';
import { MenuCatalogService } from './menu-catalog.service';

describe('MenuCatalogController', () => {
  const updateCategory = jest.fn();
  const presignMenuItemUpload = jest.fn();
  const catalogService = {
    updateCategory,
    presignMenuItemUpload,
  } as unknown as MenuCatalogService;
  const controller = new MenuCatalogController(catalogService);
  const mediaController = new MediaController(catalogService);

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

  it.each([
    ['imageUrl', 42],
    ['description', true],
  ])('rejects a non-string %s in an item update', (field, value) => {
    expect(() =>
      (controller as unknown as { parseUpdateItem(body: unknown): unknown }).parseUpdateItem({
        [field]: value,
      }),
    ).toThrow(BadRequestException);
  });

  it.each([
    ['imageUrl', 42],
    ['description', true],
  ])('rejects a non-string %s when creating an item', (field, value) => {
    expect(() =>
      (controller as unknown as { parseCreateItem(body: unknown): unknown }).parseCreateItem({
        name: 'Latte',
        categoryId: 'category-1',
        price: 500,
        [field]: value,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects an unsupported upload MIME type before invoking the service', () => {
    expect(() =>
      mediaController.presign(
        { user: { tenantId: 'tenant-1' } } as never,
        { contentType: 'image/gif' },
      ),
    ).toThrow(BadRequestException);
    expect(presignMenuItemUpload).not.toHaveBeenCalled();
  });
});
