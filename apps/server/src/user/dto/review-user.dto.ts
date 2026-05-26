import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserStatus } from '../../generated/prisma';

export class ReviewUserDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];
}
