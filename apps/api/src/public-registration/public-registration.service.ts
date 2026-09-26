import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const CYRILLIC: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};

export function createTenantSlug(name: string): string {
  const transliterated = Array.from(name.toLowerCase(), (char) => CYRILLIC[char] ?? char).join('');
  const slug = transliterated.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').slice(0, 60).replace(/^-+|-+$/g, '');
  return slug || `tenant-${randomBytes(3).toString('hex')}`;
}

export interface RegistrationInput {
  name: string;
  email: string;
  phone: string;
  venueType: 'RESTAURANT' | 'CAFE' | 'BAR';
}

@Injectable()
export class PublicRegistrationService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async register(input: RegistrationInput): Promise<{ tenantId: string; accessToken: string; user: { id: string; email: string; role: 'OWNER'; tenantId: string; fullName: string } }> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name || name.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Введите корректные название заведения и email');
    }
    if (!/^\+375(?:25|29|33|44)\d{7}$/.test(input.phone)) {
      throw new BadRequestException('Введите номер телефона Беларуси в формате +375XXXXXXXXX');
    }
    if (!['RESTAURANT', 'CAFE', 'BAR'].includes(input.venueType)) {
      throw new BadRequestException('Выберите тип заведения');
    }
    const existing = await this.prisma.unscopedClient.tenantRegistration.findUnique({ where: { email }, select: { email: true } });
    if (existing) throw new ConflictException('Пользователь с таким email уже зарегистрирован');

    const passwordHash = await hash(randomBytes(32).toString('hex'), 10);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const baseSlug = createTenantSlug(name);
    let tenantId = randomUUID();
    let created: { tenant: { id: string }; user: { id: string; sessionVersion: number } } | undefined;
    for (let suffix = 1; !created; suffix++) {
      tenantId = randomUUID();
      const suffixText = suffix === 1 ? '' : `-${suffix}`;
      const slug = `${baseSlug.slice(0, 60 - suffixText.length).replace(/-+$/g, '')}${suffixText}`;
      try {
        created = await this.prisma.unscopedTransaction(tenantId, async (tx) => {
          const tenant = await tx.tenant.create({ data: { id: tenantId, slug, name, venueType: input.venueType, status: 'TRIAL', trialEndsAt } });
          const user = await tx.user.create({ data: { tenantId, email, phone: input.phone, passwordHash, fullName: name, role: 'OWNER', mustChangePassword: true }, select: { id: true, sessionVersion: true } });
          await tx.tenantRegistration.create({ data: { email, tenantId } });
          return { tenant, user };
        });
      } catch (error) {
        const prismaError = error as { code?: string; meta?: { target?: string | string[] } };
        if (prismaError.code === 'P2002') {
          const target = String(prismaError.meta?.target).toLowerCase();
          if (target.includes('email') || target.includes('tenant_registrations')) throw new ConflictException('Пользователь с таким email уже зарегистрирован');
          if (suffix > 1000) throw new ConflictException('Не удалось подобрать свободный адрес заведения');
          continue;
        }
        throw error;
      }
    }
    // MVP welcome email stub: delivery is intentionally deferred.
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ tenantId, userId: created.user.id, role: 'OWNER', sessionVersion: created.user.sessionVersion, iat: now, exp: now + 24 * 60 * 60 })).toString('base64url');
    const signature = createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET')).update(`${header}.${payload}`).digest('base64url');
    return { tenantId: created.tenant.id, accessToken: `${header}.${payload}.${signature}`, user: { id: created.user.id, email, role: 'OWNER', tenantId, fullName: name } };
  }

}
