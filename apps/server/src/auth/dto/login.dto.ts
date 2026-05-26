import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(80)
  identifier: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;
}
