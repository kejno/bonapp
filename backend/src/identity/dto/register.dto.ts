import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'Venue name must not be empty' })
  @MinLength(2, { message: 'Venue name must be at least 2 characters long' })
  @Matches(/[a-z0-9]/i, { message: 'name must contain at least one ASCII letter or digit' })
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
