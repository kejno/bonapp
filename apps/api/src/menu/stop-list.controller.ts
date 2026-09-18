import { Body, Controller, Patch } from '@nestjs/common';
import { MenuAdminService } from './menu-admin.service';

interface UpdateStopListRequest {
  tenantId: string;
  itemId: string;
  isStopped: boolean;
}

@Controller('api/v1/stop-list')
export class StopListController {
  constructor(private readonly menuAdminService: MenuAdminService) {}

  @Patch()
  update(@Body() request: UpdateStopListRequest) {
    return this.menuAdminService.updateStopList(
      request.tenantId,
      request.itemId,
      request.isStopped,
    );
  }
}
