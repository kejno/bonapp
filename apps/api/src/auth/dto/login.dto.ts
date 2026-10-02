import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiPropertyOptional({ description: 'Логин сотрудника', example: 'manager' })
  @ValidateIf((dto: LoginDto) => dto.email === undefined && dto.tenantId === undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  login?: string;

  @ApiPropertyOptional({ description: 'Электронная почта сотрудника', example: 'manager@example.com' })
  @ValidateIf((dto: LoginDto) => dto.login === undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ description: 'Идентификатор ресторана', example: 'tenant-uuid' })
  @ValidateIf((dto: LoginDto) => dto.login === undefined)
  @IsString()
  @IsNotEmpty()
  tenantId?: string;

  @ApiProperty({ description: 'Пароль сотрудника', example: 'StrongPassword123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ description: 'Шестизначный код двухфакторной аутентификации', example: '123456' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  totpCode?: string;
}
