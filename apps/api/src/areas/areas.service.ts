import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAreaInput {
  name: string;
  sortOrder?: number;
}

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.area.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  create(tenantId: string, input: CreateAreaInput) {
    return this.prisma.area.create({
      data: {
        tenantId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async ensureExists(tenantId: string, areaId: string) {
    const area = await this.prisma.area.findFirst({
      where: { id: areaId, tenantId },
    });

    if (!area) {
      throw new NotFoundException('Area not found');
    }

    return area;
  }
}
