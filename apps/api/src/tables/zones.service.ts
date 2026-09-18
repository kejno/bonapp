import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, name: string) {
    const normalizedName = name?.trim();
    if (!tenantId || !normalizedName) {
      throw new BadRequestException('tenantId and zone name are required');
    }
    try {
      return await this.prisma.zone.create({
        data: { tenantId, name: normalizedName },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraint(error))
        throw new ConflictException('Zone name already exists');
      throw error;
    }
  }

  list(tenantId: string) {
    return this.prisma.zone.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private isUniqueConstraint(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
