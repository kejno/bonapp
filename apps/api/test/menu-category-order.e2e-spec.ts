import { MenuCatalogService } from '../src/menu/menu-catalog.service';
import { MenuCacheTestFixture } from './menu-cache-test.fixture';

describe('menu item category ordering (e2e)', () => {
  const fixture = new MenuCacheTestFixture();
  const destinationCategoryId = `destination-${fixture.tenantId}`;

  beforeAll(async () => {
    await fixture.start();
    await fixture.prisma.menuCategory.create({
      data: {
        id: destinationCategoryId,
        tenantId: fixture.tenantId,
        name: 'Destination',
        sortOrder: 1,
      },
    });
    await fixture.prisma.menuItem.createMany({
      data: [
        {
          id: `destination-first-${fixture.tenantId}`,
          tenantId: fixture.tenantId,
          categoryId: destinationCategoryId,
          name: 'First destination item',
          priceByn: 1,
          sortOrder: 0,
        },
        {
          id: `destination-last-${fixture.tenantId}`,
          tenantId: fixture.tenantId,
          categoryId: destinationCategoryId,
          name: 'Last destination item',
          priceByn: 1,
          sortOrder: 3,
        },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await fixture.stop();
  });

  it('places a moved dish after the existing destination category items', async () => {
    const catalog = fixture.app.get(MenuCatalogService);

    await catalog.updateItem(fixture.tenantId, fixture.itemId, {
      categoryId: destinationCategoryId,
    });

    const destinationItems = await catalog.listItems(fixture.tenantId, {
      categoryId: destinationCategoryId,
    });
    const movedItem = destinationItems.find((item) => item.id === fixture.itemId);
    expect(movedItem).toMatchObject({ categoryId: destinationCategoryId, sortOrder: 4 });
  });
});
