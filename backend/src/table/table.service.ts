import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import { In, Repository } from 'typeorm';
import { Order, OrderStatus } from '../order/entities/order.entity.js';
import { Tenant } from '../identity/entities/tenant.entity.js';
import { CreateTableDto } from './dto/create-table.dto.js';
import { UpdateTableDto } from './dto/update-table.dto.js';
import { Table } from './entities/table.entity.js';

@Injectable()
export class TableService {
  private readonly appUrl: string;

  constructor(
    @InjectRepository(Table)
    private readonly tableRepo: Repository<Table>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly config: ConfigService,
  ) {
    this.appUrl = this.config.get<string>('APP_URL', 'http://localhost:5173');
  }

  async findAll(tenantId: string): Promise<Table[]> {
    return this.tableRepo.find({ where: { tenantId } });
  }

  async create(tenantId: string, dto: CreateTableDto): Promise<Table> {
    const table = this.tableRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
    });
    return this.tableRepo.save(table);
  }

  async update(tenantId: string, id: string, dto: UpdateTableDto): Promise<Table> {
    const table = await this.getOwnedTable(tenantId, id);
    if (dto.name !== undefined) table.name = dto.name;
    if (dto.description !== undefined) table.description = dto.description ?? null;
    return this.tableRepo.save(table);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.tableRepo.manager.transaction(async (em) => {
      // SELECT FOR UPDATE blocks concurrent order inserts (FK INSERT acquires FOR KEY SHARE,
      // which conflicts with FOR UPDATE), eliminating the TOCTOU window.
      const table = await em.findOne(Table, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!table) throw new NotFoundException('Table not found');
      if (table.tenantId !== tenantId) throw new NotFoundException('Table not found');

      const activeCount = await em.count(Order, {
        where: { tableId: id, status: In([OrderStatus.NEW, OrderStatus.IN_PROGRESS]) },
      });
      if (activeCount > 0) {
        throw new BadRequestException('Cannot delete table with active orders');
      }
      await em.remove(table);
    });
  }

  async generateQr(tenantId: string, id: string): Promise<Buffer> {
    const table = await this.getOwnedTable(tenantId, id);

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const url = `${this.appUrl}/menu/${tenant.slug}?table=${table.id}`;
    return QRCode.toBuffer(url) as Promise<Buffer>;
  }

  async resolvePublic(tableId: string): Promise<{ tableId: string; tableName: string; tenantSlug: string }> {
    const table = await this.tableRepo.findOne({ where: { id: tableId } });
    if (!table) throw new NotFoundException('Table not found');

    const tenant = await this.tenantRepo.findOne({ where: { id: table.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return { tableId: table.id, tableName: table.name, tenantSlug: tenant.slug };
  }

  private async getOwnedTable(tenantId: string, id: string): Promise<Table> {
    const table = await this.tableRepo.findOne({ where: { id } });
    if (!table) throw new NotFoundException('Table not found');
    if (table.tenantId !== tenantId) throw new NotFoundException('Table not found');
    return table;
  }
}
