import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, ServiceMode } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MenuGateway } from '../menu/menu.gateway';
import { nextDailyOrderNumber, tenantLocalDate } from '../orders/daily-order-number';
import { PosOrderDispatcher } from '../onboarding/pos-order-dispatcher';
import { decryptCredentials, isEncryptedCredentials } from '../tenant/payment-credentials';
import { BepaidClient } from './bepaid.client';
import { EripClient } from './erip.client';

@Injectable()
export class GuestSessionService {
  private readonly logger = new Logger(GuestSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menuGateway: MenuGateway,
    private readonly posOrderDispatcher: PosOrderDispatcher,
    @Optional() private readonly bepaidClient?: BepaidClient,
    @Optional() private readonly eripClient?: EripClient,
  ) {}

  async createEripPayment(orderId: string, tenantId: string, tableId: string, ip: string) {
    if (!process.env.PAYMENT_CREDENTIALS_SECRET) throw new ServiceUnavailableException('Оплата временно недоступна');
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true, name: true } });
    const encoded = (tenant?.paymentCredentials as Record<string, unknown> | null)?.erip;
    if (!isEncryptedCredentials(encoded)) throw new ConflictException('Оплата через ЕРИП не подключена');
    const credentials = decryptCredentials<{ shopId?: string; serviceId: string; secret: string }>(encoded, process.env.PAYMENT_CREDENTIALS_SECRET);
    if (!credentials.shopId) throw new ConflictException('Реквизиты ЕРИП не настроены');
    const db = this.prisma.forTenant(tenantId);
    const order = await db.order.findFirst({ where: { id: orderId, tableId }, select: { id: true, dailyOrderNumber: true, status: true, isPaid: true, totalAmountByn: true, tipsAmountByn: true } });
    if (!order) throw new ForbiddenException('Заказ не принадлежит этому столу');
    if (order.isPaid || order.status !== OrderStatus.SERVED) throw new ConflictException('Заказ пока нельзя оплатить');
    let payment = await db.payment.findFirst({ where: { orderId, provider: 'erip', status: PaymentStatus.PENDING }, orderBy: { createdAt: 'desc' } });
    if (payment?.providerTransactionId && payment.createdAt.getTime() > Date.now() - 15 * 60_000) {
      const payload = payment.payload as Record<string, unknown> | null;
      return { paymentId: payment.id, serviceNo: payload?.['serviceNo'], accountNumber: payment.eripOrderNumber, instruction: payload?.['instruction'] ?? [], qrCode: payload?.['qrCode'] ?? null, banks: payload?.['banks'] ?? [] };
    }
    if (payment?.providerTransactionId) {
      if (!this.eripClient) throw new ServiceUnavailableException('Оплата временно недоступна');
      let status: string;
      try { status = (await this.eripClient.get(payment.providerTransactionId, credentials.shopId, credentials.secret)).status ?? ''; }
      catch { throw new ConflictException('Не удалось подтвердить статус запроса ЕРИП'); }
      if (status === 'successful') throw new ConflictException('Платёж уже подтверждён');
      if (status !== 'expired' && status !== 'deleted') {
        const cancelled = await this.eripClient.cancel(payment.providerTransactionId, credentials.shopId, credentials.secret).catch(() => false);
        if (!cancelled) throw new ConflictException('Не удалось отменить предыдущий запрос ЕРИП');
      }
    }
    if (payment) await db.payment.updateMany({ where: { id: payment.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.CANCELLED } });
    payment = await db.payment.create({ data: { tenantId, orderId, amountByn: order.totalAmountByn, tipsAmountByn: order.tipsAmountByn, provider: 'erip', method: PaymentMethod.ERIP_EPOS, status: PaymentStatus.PENDING } });
    try {
      if (!this.eripClient) throw new ServiceUnavailableException('Оплата временно недоступна');
      const amount = new Prisma.Decimal(payment.amountByn).add(payment.tipsAmountByn).mul(100).toDecimalPlaces(0).toNumber();
      if (!Number.isSafeInteger(amount) || amount < 1) throw new BadRequestException('Некорректная сумма заказа');
      const result = await this.eripClient.create({ shopId: credentials.shopId, secret: credentials.secret, serviceId: credentials.serviceId, amount, orderId, paymentId: payment.id, tenantId, ip, dailyOrderNumber: order.dailyOrderNumber, restaurantName: tenant?.name });
      await db.payment.update({ where: { id: payment.id }, data: { providerTransactionId: result.uid, eripOrderNumber: result.accountNumber, payload: result as unknown as Prisma.InputJsonValue } });
      return { paymentId: payment.id, serviceNo: result.serviceNo, accountNumber: result.accountNumber, instruction: result.instruction, qrCode: result.qrCode, banks: result.banks };
    } catch (error) {
      await db.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
      throw error;
    }
  }

  async getEripPaymentStatus(orderId: string, tenantId: string, tableId: string) {
    const order = await this.prisma.forTenant(tenantId).order.findFirst({ where: { id: orderId, tableId }, select: { id: true, status: true } });
    if (!order) throw new ForbiddenException('Заказ не принадлежит этому столу');
    const payment = await this.prisma.forTenant(tenantId).payment.findFirst({ where: { orderId, provider: 'erip' }, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true } });
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const encoded = (tenant?.paymentCredentials as Record<string, unknown> | null)?.erip;
    return { orderStatus: order.status, paymentStatus: payment?.status ?? null, paymentExpiresAt: payment ? new Date(payment.createdAt.getTime() + 15 * 60_000).toISOString() : null, paymentEnabled: isEncryptedCredentials(encoded) && !!process.env.PAYMENT_CREDENTIALS_SECRET };
  }

  async createCardPayment(orderId: string, tenantId: string, tableId: string, tipsAmountByn = 0) {
    if (!process.env.PAYMENT_CREDENTIALS_SECRET) throw new ServiceUnavailableException('Оплата временно недоступна');
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const encoded = (tenant?.paymentCredentials as Record<string, unknown> | null)?.bepaid;
    if (!isEncryptedCredentials(encoded)) throw new ConflictException('Оплата картой не подключена');
    const credentials = decryptCredentials<{ provider: string; shopId: string; secret: string; publicKey?: string; environment: 'TEST' | 'PROD' }>(encoded, process.env.PAYMENT_CREDENTIALS_SECRET);
    if (credentials.provider !== 'bepaid') throw new ConflictException('Оплата картой не подключена');
    const order = await this.prisma.forTenant(tenantId).order.findFirst({ where: { id: orderId, tableId }, select: { id: true, status: true, isPaid: true, totalAmountByn: true } });
    if (!order) throw new ForbiddenException('Заказ не принадлежит этому столу');
    if (order.isPaid || order.status === OrderStatus.PAID || order.status !== OrderStatus.SERVED) throw new ConflictException('Заказ пока нельзя оплатить');
    const db = this.prisma.forTenant(tenantId);
    const pending = await db.payment.findFirst({ where: { orderId, provider: 'bepaid', status: PaymentStatus.PENDING }, orderBy: { createdAt: 'desc' } });
    if (!Number.isFinite(tipsAmountByn) || tipsAmountByn < 0 || !Number.isSafeInteger(tipsAmountByn * 100)) {
      throw new BadRequestException('Некорректная сумма чаевых');
    }
    const paymentExpired = pending && pending.createdAt.getTime() <= Date.now() - 15 * 60_000;
    if (pending && !paymentExpired && new Prisma.Decimal(pending.tipsAmountByn ?? 0).comparedTo(tipsAmountByn) !== 0) {
      throw new ConflictException('Для активного платежа нельзя изменить сумму чаевых');
    }
    if (paymentExpired) {
      const token = typeof pending.payload === 'object' && pending.payload !== null && 'token' in pending.payload
        ? pending.payload.token
        : null;
      if (!this.bepaidClient || typeof token !== 'string') throw new ConflictException('Ожидается подтверждение статуса платежа от bePaid');
      let status: { status: string; expired: boolean };
      try {
        status = await this.bepaidClient.getCheckoutStatus(token);
      } catch {
        throw new ConflictException('Не удалось подтвердить статус платежа у bePaid');
      }
      if (status.status === 'successful' || (status.status !== 'failed' && status.status !== 'expired' && !status.expired)) {
        throw new ConflictException('Ожидается подтверждение статуса платежа от bePaid');
      }
      const closed = await db.payment.updateMany({
        where: { id: pending.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.CANCELLED },
      });
      if (closed.count !== 1) throw new ConflictException('Статус платежа уже изменился');
    }
    const active = pending && !paymentExpired ? pending : null;
    let payment;
    try {
      payment = active ?? await db.payment.create({ data: { tenantId, orderId, amountByn: order.totalAmountByn, tipsAmountByn, provider: 'bepaid', method: PaymentMethod.BANK_CARD, status: PaymentStatus.PENDING } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Другой платёж уже создаётся');
      }
      throw error;
    }
    const amount = new Prisma.Decimal(payment.amountByn).add(payment.tipsAmountByn ?? 0).mul(100).toDecimalPlaces(0).toNumber();
    if (!Number.isSafeInteger(amount) || amount < 1) throw new BadRequestException('Некорректная сумма заказа');
    try {
      if (!this.bepaidClient) throw new ServiceUnavailableException('Оплата временно недоступна');
      const checkout = await this.bepaidClient.createCheckout({ shopId: credentials.shopId, secret: credentials.secret, amount, paymentId: payment.id, orderId, tenantId, test: credentials.environment === 'TEST' });
      await db.payment.update({ where: { id: payment.id }, data: { payload: { token: checkout.token } } });
      return { redirectUrl: checkout.redirectUrl };
    } catch (error) {
      this.logger.warn('bePaid checkout creation failed');
      await db.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } });
      throw error;
    }
  }

  async getCardPaymentStatus(orderId: string, tenantId: string, tableId: string) {
    const order = await this.prisma.forTenant(tenantId).order.findFirst({ where: { id: orderId, tableId }, select: { id: true, status: true } });
    if (!order) throw new ForbiddenException('Заказ не принадлежит этому столу');
    const payment = await this.prisma.forTenant(tenantId).payment.findFirst({ where: { orderId, provider: 'bepaid' }, orderBy: { createdAt: 'desc' }, select: { status: true, createdAt: true } });
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: tenantId }, select: { paymentCredentials: true } });
    const encoded = (tenant?.paymentCredentials as Record<string, unknown> | null)?.bepaid;
    const configured = isEncryptedCredentials(encoded) && !!process.env.PAYMENT_CREDENTIALS_SECRET
      && decryptCredentials<{ provider: string }>(encoded, process.env.PAYMENT_CREDENTIALS_SECRET).provider === 'bepaid';
    return {
      orderStatus: order.status,
      paymentStatus: payment?.status ?? null,
      paymentExpiresAt: payment ? new Date(payment.createdAt.getTime() + 15 * 60_000).toISOString() : null,
      paymentEnabled: configured,
    };
  }

  async createGuestOrder(
    tenantId: string,
    tableId: string,
    input: { items: Array<{ menuItemId: string; quantity: number; selectedModifiers: string[] }>; comment: string; guestSessionId?: string | null },
  ) {
    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('Cart cannot be empty');
    if (typeof input.comment !== 'string' || input.comment.length > 255) throw new BadRequestException('Comment must be at most 255 characters');
    for (const item of input.items) {
      if (!item || typeof item.menuItemId !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || !Array.isArray(item.selectedModifiers) || item.selectedModifiers.some((id) => typeof id !== 'string')) {
        throw new BadRequestException('Invalid order item');
      }
    }

    const order = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, dailyOrderNumber: true, dailyOrderNumberDate: true, serviceMode: true } });
      if (!tenant) throw new NotFoundException('Tenant not found');
      if (tenant.serviceMode === ServiceMode.VIEW_ONLY) throw new ConflictException('Ordering is disabled for this tenant');
      const today = tenantLocalDate(tenant.timezone);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
      const latestTenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { dailyOrderNumber: true, dailyOrderNumberDate: true } });
      if (!latestTenant) throw new NotFoundException('Tenant not found');
      const dailyOrderNumber = nextDailyOrderNumber(latestTenant.dailyOrderNumber, latestTenant.dailyOrderNumberDate, today);
      await tx.tenant.update({ where: { id: tenantId }, data: { dailyOrderNumber, dailyOrderNumberDate: today } });

      const pricedItems: Array<{ menuItemId: string; quantity: number; selectedModifiers: string[]; price: number; kitchenDepartment: string }> = [];
      for (const requested of input.items) {
        const menuItem = await tx.menuItem.findFirst({
          where: { id: requested.menuItemId, tenantId, isActive: true, isInStopList: false },
          include: {
            menuItemModifierGroups: { include: { modifierGroup: { include: { modifiers: true, modifierOptions: true } } } },
            modifierGroups: { include: { modifierOptions: true } },
            stopListItem: { select: { isStopped: true } },
          },
        });
        if (!menuItem || menuItem.stopListItem?.isStopped) throw new BadRequestException('One or more menu items are unavailable');
        const legacyGroups = menuItem.menuItemModifierGroups.map(({ modifierGroup }) => modifierGroup);
        const groups = [...legacyGroups, ...menuItem.modifierGroups]
          .filter((group, index, all) => group.isActive && all.findIndex((entry) => entry.id === group.id) === index);
        const allowed = [
          ...legacyGroups.filter((group) => group.isActive).flatMap((group) => group.modifiers.map((option) => ({ id: option.id, groupId: group.id, price: Number(option.price) }))),
          ...groups.flatMap((group) => group.modifierOptions.map((option) => ({ id: option.id, groupId: group.id, price: Number(option.extraPriceByn), active: option.isActive }))),
        ].filter((option) => !('active' in option) || option.active);
        const selected = new Set(requested.selectedModifiers);
        if (selected.size !== requested.selectedModifiers.length || requested.selectedModifiers.some((id) => !allowed.some((option) => option.id === id))) {
          throw new BadRequestException('Selected modifier is unavailable for this item');
        }
        for (const group of groups) {
          const count = requested.selectedModifiers.filter((id) => allowed.some((option) => option.id === id && option.groupId === group.id)).length;
          if (count < Math.max(group.isRequired ? 1 : 0, group.minSelection)) throw new BadRequestException(`Required modifiers are missing for ${menuItem.name}`);
          if (group.maxSelection !== null && count > group.maxSelection) throw new BadRequestException(`Too many modifiers selected for ${menuItem.name}`);
        }
        const modifiersPrice = requested.selectedModifiers.reduce((sum, id) => sum + (allowed.find((option) => option.id === id)?.price ?? 0), 0);
        pricedItems.push({ menuItemId: menuItem.id, quantity: requested.quantity, selectedModifiers: requested.selectedModifiers, price: Number((Number(menuItem.priceByn) + modifiersPrice).toFixed(2)), kitchenDepartment: menuItem.kitchenDepartment ?? 'HOT' });
      }
      const totalAmountByn = Number(pricedItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
      const created = await tx.order.create({ data: {
        tenantId, tableId, dailyOrderNumber, guestSessionId: input.guestSessionId ?? null, comment: input.comment,
        totalAmountByn, status: OrderStatus.NEW,
        items: { create: pricedItems.map((item) => ({
          itemId: item.menuItemId, quantity: item.quantity, unitPriceByn: item.price,
          selectedModifiers: item.selectedModifiers, status: OrderStatus.NEW,
          kitchenDepartment: item.kitchenDepartment,
        })) },
      }, select: { id: true, dailyOrderNumber: true, status: true, totalAmountByn: true, createdAt: true } });
      return created;
    });
    await this.posOrderDispatcher.enqueue(tenantId, order.id);
    this.menuGateway.emitKitchenOrder(tenantId, 'order:created', order);
    return {
      orderId: order.id,
      dailyOrderNumber: order.dailyOrderNumber,
      status: order.status,
      totalAmountByn: Number(order.totalAmountByn),
      estimatedReadyTime: new Date(order.createdAt.getTime() + 12 * 60_000).toISOString(),
    };
  }

  async resolveByQrToken(qrToken: string) {
    const tableRow = await this.prisma.findTableByQrToken(qrToken);
    if (!tableRow) {
      throw new NotFoundException('QR token not found');
    }

    const { tenant, area, id, tableNumber, tenantId } = tableRow;
    const tableSessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    await this.prisma.unscopedClient.tableSession.create({
      data: {
        tenantId,
        tableId: id,
        tokenHash: createHash('sha256').update(tableSessionToken).digest('hex'),
        expiresAt,
      },
    });
    const scopedDb = this.prisma.forTenant(tenantId);

    const activeOrder = await scopedDb.order.findFirst({
      where: {
        tableId: id,
        status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] },
      },
      select: { id: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
        currency: tenant.currency,
      },
      table: {
        id,
        tableNumber,
        areaName: area.name,
      },
      tableSessionToken,
      tableSessionExpiresAt: expiresAt,
      activeOrder: activeOrder
        ? {
            id: activeOrder.id,
            status: activeOrder.status,
            createdAt: activeOrder.createdAt,
          }
        : null,
    };
  }

  async getOrderStatus(orderId: string, tenantId: string, tableId: string) {
    const order = await this.prisma.forTenant(tenantId).order.findFirst({
      where: { id: orderId, tableId },
      select: { id: true, dailyOrderNumber: true, status: true, totalAmountByn: true, updatedAt: true },
    });
    if (!order) throw new ForbiddenException('Order does not belong to this table');
    return {
      id: order.id,
      dailyOrderNumber: order.dailyOrderNumber,
      status: order.status,
      totalAmountByn: Number(order.totalAmountByn),
      updatedAt: order.updatedAt.toISOString(),
      estimatedReadyAt: order.status === OrderStatus.COOKING
        ? new Date(order.updatedAt.getTime() + 12 * 60_000).toISOString()
        : null,
    };
  }

  async addOrderItem(orderId: string, itemId: string, quantity: number, tenantId: string, tableId: string) {
    const created = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tableId, status: { in: [OrderStatus.NEW, OrderStatus.COOKING] }, isPaid: false },
        select: { id: true, status: true },
      });
      if (!order) throw new ForbiddenException('Active order does not belong to this table');
      const item = await tx.menuItem.findFirst({
        where: { id: itemId, isActive: true, isInStopList: false },
        select: { id: true, priceByn: true, kitchenDepartment: true, stopListItem: { select: { isStopped: true } } },
      });
      if (!item || item.stopListItem?.isStopped) throw new NotFoundException('Menu item is unavailable');
      const created = await tx.orderItem.create({
        data: {
          orderId,
          itemId,
          quantity,
          unitPriceByn: item.priceByn,
          selectedModifiers: [],
          status: order.status,
          kitchenDepartment: item.kitchenDepartment ?? 'HOT',
        },
      });
      await tx.order.update({
        where: { id_tenantId: { id: orderId, tenantId } },
        data: { totalAmountByn: { increment: Number(item.priceByn) * quantity } },
      });
      return created;
    });
    this.menuGateway.emitKitchenOrder(tenantId, 'order:updated', { id: orderId });
    return created;
  }
}
