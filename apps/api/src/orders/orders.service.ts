import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersEvents } from './orders.events';

export interface CreateOrderInput {
  qrToken: string;
  comment?: string;
  items: Array<{ menuItemId: string; quantity: number; selectedModifiers: string[] }>;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly events?: OrdersEvents) {}

  async create(input: CreateOrderInput) {
    this.validateInput(input);
    const tenant = await this.prisma.tenant.findUnique({ where: { qrToken: input.qrToken } });
    if (!tenant) throw new BadRequestException('Некорректный QR-код');

    const menuItems = await this.prisma.menuItem.findMany({
      where: { tenantId: tenant.id, id: { in: input.items.map(({ menuItemId }) => menuItemId) } },
      include: { modifierGroups: { include: { options: true } } },
    });
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));
    const preparedItems = input.items.map((item) => this.prepareItem(item, menuItemsById.get(item.menuItemId)));
    const totalAmountByn = preparedItems.reduce((total, item) => total + item.unitPriceByn * item.quantity, 0);
    const localOrderDate = this.getLocalOrderDate(tenant.timezone);

    const created = await this.prisma.$transaction(async (transaction) => {
      const counter = await transaction.dailyOrderCounter.upsert({
        where: { tenantId_localOrderDate: { tenantId: tenant.id, localOrderDate } },
        create: { tenantId: tenant.id, localOrderDate, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      return transaction.order.create({
        data: {
          tenantId: tenant.id, dailyOrderNumber: counter.lastNumber, localOrderDate, totalAmountByn,
          comment: input.comment?.trim() || null,
          estimatedReadyTime: new Date(Date.now() + 15 * 60 * 1000),
          items: { create: preparedItems.map((item) => ({
            menuItemId: item.menuItemId, quantity: item.quantity, unitPriceByn: item.unitPriceByn,
            selectedModifierIds: item.selectedModifiers,
          })) },
        },
      });
    });

    const response = {
      orderId: created.id, dailyOrderNumber: created.dailyOrderNumber, status: created.status,
      totalAmountByn: Number(created.totalAmountByn), estimatedReadyTime: created.estimatedReadyTime.toISOString(),
    };
    this.events?.created.emit('order:created', { tenantId: tenant.id, ...response });
    return response;
  }

  private validateInput(input: CreateOrderInput) {
    if (!input.qrToken || !Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('Корзина пуста');
    if (input.comment && input.comment.length > 255) throw new BadRequestException('Комментарий не должен превышать 255 символов');
    if (input.items.some(({ menuItemId, quantity, selectedModifiers }) => !menuItemId || !Number.isInteger(quantity) || quantity < 1 || !Array.isArray(selectedModifiers))) {
      throw new BadRequestException('Некорректная позиция заказа');
    }
  }

  private prepareItem(input: CreateOrderInput['items'][number], menuItem: any) {
    if (!menuItem) throw new BadRequestException('Блюдо не найдено');
    if (!menuItem.isAvailable) throw new BadRequestException('Блюдо недоступно для заказа');
    const selected = new Set(input.selectedModifiers);
    const allOptions = menuItem.modifierGroups.flatMap((group: any) => group.options.map((option: any) => ({ ...option, group })));
    const options = allOptions.filter((option: any) => selected.has(option.id));
    if (options.length !== selected.size || options.some((option: any) => !option.isAvailable)) throw new BadRequestException('Выбран недоступный модификатор');
    if (menuItem.modifierGroups.some((group: any) => group.isRequired && !options.some((option: any) => option.group.id === group.id))) {
      throw new BadRequestException('Выберите обязательный модификатор');
    }
    return {
      menuItemId: input.menuItemId, quantity: input.quantity, selectedModifiers: input.selectedModifiers,
      unitPriceByn: Number(menuItem.priceByn) + options.reduce((total: number, option: any) => total + Number(option.priceByn), 0),
    };
  }

  private getLocalOrderDate(timezone: string) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return new Date(`${date}T00:00:00.000Z`);
  }
}
