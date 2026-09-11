import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Tenant } from './entities/tenant.entity.js';
import { Role, User } from './entities/user.entity.js';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: Role;
  tenantName: string;
  tenantSlug: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const slug = this.generateSlug(dto.name);
    if (!slug) {
      throw new BadRequestException(
        'Venue name must contain at least one Latin character for URL generation',
      );
    }

    return this.dataSource.transaction(async (em) => {
      const existingTenant = await em.findOne(Tenant, { where: { slug } });
      if (existingTenant) {
        throw new ConflictException(
          `Tenant with slug "${slug}" already exists`,
        );
      }

      const existingUser = await em.findOne(User, { where: { email: dto.email } });
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);

      const tenant = em.create(Tenant, { name: dto.name, slug });
      const savedTenant = await em.save(tenant);

      const user = em.create(User, {
        tenantId: savedTenant.id,
        email: dto.email,
        passwordHash,
        role: Role.OWNER,
      });
      const savedUser = await em.save(user);

      return { accessToken: this.signToken(savedUser, savedTenant) };
    });
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tenant = await this.tenantRepo.findOneOrFail({ where: { id: user.tenantId } });
    return { accessToken: this.signToken(user, tenant) };
  }

  private signToken(user: User, tenant: Tenant): string {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
    };
    return this.jwtService.sign(payload);
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-');
  }
}
