import { StaffRole } from '@bonapp/shared-types';

export class CreateStaffDto {
  name: string;
  role: StaffRole;
  phone: string;
  temporaryPassword: string;
}
