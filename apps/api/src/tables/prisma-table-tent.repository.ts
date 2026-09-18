import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TableTentRepository } from './table-tent-pdf.service';

@Injectable()
export class PrismaTableTentRepository implements TableTentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTenant(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true },
    });
  }

  async findTables(tenantId: string, tableIds?: string[]) {
    return this.prisma.table.findMany({
      where: {
        tenantId,
        ...(tableIds ? { id: { in: tableIds } } : {}),
      },
      select: { id: true, number: true, qrToken: true },
      orderBy: { number: 'asc' },
    });
  }
}
