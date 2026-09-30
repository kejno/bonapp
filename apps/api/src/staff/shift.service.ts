import {
  ConflictException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FiscalizationStatus, PaymentStatus, ShiftStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptCredentials, isEncryptedCredentials } from '../tenant/payment-credentials';
import { SKNO_CLIENT } from './skno-client';
import type { SknoCredentials, SknoShiftClient } from './skno-client';

@Injectable()
export class ShiftService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SKNO_CLIENT) private readonly skno: SknoShiftClient,
  ) {}

  async current(tenantId: string) {
    return this.prisma
      .forTenant(tenantId)
      .shift.findFirst({
        where: { status: ShiftStatus.OPEN },
        include: { cashier: { select: { id: true, fullName: true } } },
      });
  }

  async open(tenantId: string, cashierId: string) {
    try {
      return await this.prisma.transactionForTenant(tenantId, async (tx) => {
      const active = await tx.shift.findFirst({
        where: { tenantId, status: ShiftStatus.OPEN },
      });
      if (active)
        throw new ConflictException('A shift is already open for this tenant');
      const cashier = await tx.user.findFirst({
        where: {
          id: cashierId,
          tenantId,
          isActive: true,
          role: { in: ['CASHIER', 'MANAGER'] },
        },
      });
      if (!cashier) throw new NotFoundException('Active cashier not found');
      const credentials = await this.getSknoCredentials(tenantId);
      const confirmation = await this.skno.open(credentials);
      return tx.shift.create({ data: { tenantId, cashierId, sknoStartZ: confirmation.zReportNumber } });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A shift is already open for this tenant');
      }
      throw error;
    }
  }

  async close(tenantId: string) {
    // A persisted marker means the non-idempotent command may have reached the device.
    // Reject invalid configuration before recording that state.
    const credentials = await this.getSknoCredentials(tenantId);
    const pending = await this.prisma.transactionForTenant(tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
      const shift = await tx.shift.findFirst({ where: { tenantId, status: ShiftStatus.OPEN } });
      if (!shift) throw new NotFoundException('No open shift for this tenant');
      const unresolvedFiscalizations = await tx.payment.count({
        where: {
          tenantId,
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.COMPLETED] },
          fiscalizationStatus: { in: [FiscalizationStatus.PENDING, FiscalizationStatus.FISCAL_FAILED] },
          order: { isPaid: true, paidAt: { gte: shift.openedAt, lte: new Date() } },
        },
      });
      if (unresolvedFiscalizations) {
        throw new ConflictException({ message: 'Смену нельзя закрыть: есть неурегулированные фискализации', unresolvedFiscalizations });
      }
      const started = !shift.sknoCloseStartedAt;
      if (started) {
        await tx.shift.update({
          where: { id_tenantId: { id: shift.id, tenantId } },
          data: { sknoCloseStartedAt: new Date() },
        });
      }
      return { shift, started };
    });

    const confirmation = pending.started
      ? await this.skno.close(credentials)
      : await this.skno.reconcileClose(credentials, pending.shift.sknoStartZ ?? 0);
    if (!confirmation) {
      throw new ConflictException('Результат Z-отчёта не подтверждён; требуется сверка с кассой, повторная команда не отправлялась');
    }

    return this.prisma.transactionForTenant(tenantId, async (tx) => {
      const shift = await tx.shift.findFirst({ where: { id: pending.shift.id, tenantId, status: ShiftStatus.OPEN } });
      if (!shift) throw new ConflictException('Смена уже закрыта или изменилась');
      const closedAt = new Date();
      const totals = await tx.order.aggregate({
        where: { tenantId, createdAt: { gte: shift.openedAt, lte: closedAt } },
        _sum: { totalAmountByn: true }, _count: { _all: true },
      });
      const closed = await tx.shift.update({
        where: { id_tenantId: { id: shift.id, tenantId } },
        data: { status: ShiftStatus.CLOSED, closedAt },
      });
      const report = await tx.shiftReport.create({
        data: {
          tenantId, shiftId: shift.id, cashierId: shift.cashierId,
          openedAt: shift.openedAt, closedAt,
          totalAmount: totals._sum.totalAmountByn ?? 0,
          orderCount: totals._count._all, zReportNumber: confirmation.zReportNumber,
        },
      });
      await tx.tenant.update({ where: { id: tenantId }, data: { dailyOrderNumber: 0 } });
      return { ...closed, report };
    });
  }

  private async getSknoCredentials(tenantId: string): Promise<SknoCredentials> {
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: { paymentCredentials: true },
    });
    const encrypted = (tenant?.paymentCredentials as Record<string, unknown> | null)?.skno;
    const secret = process.env.PAYMENT_CREDENTIALS_SECRET;
    if (!isEncryptedCredentials(encrypted) || !secret) {
      throw new BadRequestException('Настройте зашифрованные реквизиты кассы СКНО');
    }
    const credentials = decryptCredentials<{
      cashRegisterSerial: string; host?: string; username?: string; password?: string;
    }>(encrypted, secret);
    if (!credentials.host || !credentials.username || credentials.password === undefined) {
      throw new BadRequestException('В реквизитах СКНО отсутствуют хост или данные авторизации');
    }
    let host: URL;
    try { host = new URL(credentials.host); } catch { throw new BadRequestException('Некорректный хост кассы СКНО'); }
    if (!['http:', 'https:'].includes(host.protocol) || host.username || host.password) {
      throw new BadRequestException('Некорректный хост кассы СКНО');
    }
    return { host: host.toString(), username: credentials.username, password: credentials.password, cashRegisterSerial: credentials.cashRegisterSerial };
  }
}
