import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @ValidateIf((dto: LoginDto) => dto.email === undefined && dto.tenantId === undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  login?: string;

  @ValidateIf((dto: LoginDto) => dto.login === undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((dto: LoginDto) => dto.login === undefined)
  @IsString()
  @IsNotEmpty()
  tenantId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  totpCode?: string;
}
