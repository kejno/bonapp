import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuestService {
  constructor(private readonly prisma: PrismaService) {}

  async getSession(qrToken: string) {
    const table = await this.prisma.table.findUnique({
      where: { qrToken },
      include: { tenant: true },
    });

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    return {
      tenantId: table.tenant.id,
      tableId: table.id,
      tableNumber: table.number,
      brandColor: table.tenant.brandColor,
      logoUrl: table.tenant.logoUrl,
      tenantName: table.tenant.name,
    };
  }
}
