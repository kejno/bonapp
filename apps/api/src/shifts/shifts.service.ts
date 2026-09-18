import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ISknoApiService,
  SKNO_API_SERVICE,
  ZReport,
} from '../fiscal/skno/skno-api.interface';
import { Shift } from '@prisma/client';

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SKNO_API_SERVICE) private readonly sknoApi: ISknoApiService,
  ) {}

  async openShift(tenantId: string): Promise<Shift> {
    const settings = await this.getSettings(tenantId);
    await this.sknoApi.openShift(settings.sknoSerial, settings.sknoUnp);
    const shift = await this.prisma.shift.create({
      data: { tenantId },
    });
    this.logger.log(`Shift ${shift.id} opened for tenant ${tenantId}`);
    return shift;
  }

  async closeShift(tenantId: string): Promise<{ shift: Shift; zReport: ZReport }> {
    const settings = await this.getSettings(tenantId);

    const openShift = await this.prisma.shift.findFirst({
      where: { tenantId, status: 'OPEN' },
    });
    if (!openShift) {
      throw new NotFoundException(`No open shift found for tenant ${tenantId}`);
    }

    const unresolvedCount = await this.prisma.payment.count({
      where: {
        shiftId: openShift.id,
        fiscalStatus: { in: ['PENDING', 'FISCAL_FAILED'] },
      },
    });
    if (unresolvedCount > 0) {
      throw new ConflictException(
        `Cannot close shift: ${unresolvedCount} unresolved fiscalization(s) remain`,
      );
    }

    const zReport = await this.sknoApi.closeShift(settings.sknoSerial, settings.sknoUnp);

    const shift = await this.prisma.shift.update({
      where: { id: openShift.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        zReport: zReport as object,
      },
    });

    this.logger.log(`Shift ${shift.id} closed for tenant ${tenantId}`);
    return { shift, zReport };
  }

  private async getSettings(tenantId: string) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });
    if (!settings) {
      throw new NotFoundException(`TenantSettings not found for tenant ${tenantId}`);
    }
    return settings;
  }
}
