import { StaffRole } from '@bonapp/shared-types';

export class UpdateStaffDto {
  name?: string;
  role?: StaffRole;
  phone?: string;
}
