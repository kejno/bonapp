import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MenuItem } from '../menu/entities/menu-item.entity.js';
import { Table } from '../table/entities/table.entity.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { Order, OrderItem, OrderStatus } from './entities/order.entity.js';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.DONE, OrderStatus.CANCELLED],
  [OrderStatus.DONE]: [],
  [OrderStatus.CANCELLED]: [],
};

export interface PaginatedOrders {
  data: Order[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Table)
    private readonly tableRepo: Repository<Table>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepo: Repository<MenuItem>,
  ) {}

  async createPublic(dto: CreateOrderDto): Promise<{ orderId: string; status: OrderStatus }> {
    const table = await this.tableRepo.findOne({
      where: { id: dto.tableId, tenantId: dto.tenantId },
    });
    if (!table) throw new NotFoundException('Table not found');

    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.menuItemRepo.find({
      where: { id: In(menuItemIds), tenantId: dto.tenantId },
    });

    const foundIds = new Set(menuItems.map((mi) => mi.id));
    const missing = menuItemIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Menu items not found: ${missing.join(', ')}`);
    }

    const unavailable = menuItems.filter((mi) => !mi.isAvailable);
    if (unavailable.length > 0) {
      const names = unavailable.map((mi) => mi.name).join(', ');
      throw new UnprocessableEntityException(`Items unavailable: ${names}`);
    }

    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));
    const items: OrderItem[] = dto.items.map((i) => {
      const mi = menuItemMap.get(i.menuItemId)!;
      return { menuItemId: mi.id, name: mi.name, price: mi.price, quantity: i.quantity };
    });

    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const order = this.orderRepo.create({
      tenantId: dto.tenantId,
      tableId: dto.tableId,
      items,
      totalAmount,
      status: OrderStatus.NEW,
    });

    const saved = await this.orderRepo.save(order);
    return { orderId: saved.id, status: saved.status };
  }

  async findAll(tenantId: string, query: ListOrdersQueryDto): Promise<PaginatedOrders> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const qb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.tenantId = :tenantId', { tenantId })
      .orderBy('order.createdAt', 'DESC')
      .addOrderBy('order.id', 'DESC')
      .skip(offset)
      .take(limit);

    if (query.status) qb.andWhere('order.status = :status', { status: query.status });
    if (query.tableId) qb.andWhere('order.tableId = :tableId', { tableId: query.tableId });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(tenantId: string, id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    const order = await this.findOne(tenantId, id);
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${dto.status}`,
      );
    }
    order.status = dto.status;
    return this.orderRepo.save(order);
  }
}
