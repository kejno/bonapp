import { Controller, Get, Param } from '@nestjs/common';
import { PublicMenuService } from './public-menu.service.js';

@Controller('public/menu')
export class PublicMenuController {
  constructor(private readonly service: PublicMenuService) {}

  @Get(':slug')
  getPublicMenu(@Param('slug') slug: string) {
    return this.service.getPublicMenu(slug);
  }
}
