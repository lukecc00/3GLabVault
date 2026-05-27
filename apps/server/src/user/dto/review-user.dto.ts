import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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

  @IsOptional()
  @IsEmail({}, { message: '请输入有效的外部通知邮箱' })
  @MaxLength(255)
  notificationEmail?: string;
}
