import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Step1Input = {
  tenantId: string;
  name: string;
  slug: string;
  legalName: string;
  unp: string;
  address: string;
  timezone?: string;
  color?: string;
  logoUrl?: string;
};

const slugPattern = /^[a-z0-9-]{3,50}$/;

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async saveStep1(input: Step1Input) {
    this.validate(input);
    const owner = await this.prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (owner && owner.id !== input.tenantId) {
      throw new ConflictException('Этот субдомен уже занят.');
    }

    const data = {
      name: input.name.trim(),
      slug: input.slug,
      legalName: input.legalName.trim(),
      unp: input.unp,
      address: input.address.trim(),
      timezone: 'Europe/Minsk',
      brandColor: input.color ?? '#e0533c',
      logoUrl: input.logoUrl,
    };
    return this.prisma.tenant.upsert({
      where: { id: input.tenantId },
      create: { id: input.tenantId, ...data },
      update: data,
    });
  }

  private validate(input: Step1Input) {
    if (!input.name.trim() || !input.legalName.trim() || !input.address.trim()) {
      throw new BadRequestException('Заполните обязательные поля профиля.');
    }
    if (!slugPattern.test(input.slug)) {
      throw new BadRequestException('Некорректный формат субдомена.');
    }
    if (!/^\d{9}$/.test(input.unp)) {
      throw new BadRequestException('УНП должен состоять из 9 цифр.');
    }
  }
}
