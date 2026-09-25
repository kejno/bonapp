import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  totpCode?: string;
}
