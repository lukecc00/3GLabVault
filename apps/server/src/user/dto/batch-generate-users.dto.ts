import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class BatchGenerateUserEntryDto {
  @IsString()
  @MaxLength(50)
  realName: string;

  @IsEmail({}, { message: '请输入有效的外部提醒邮箱' })
  @MaxLength(255)
  notificationEmail: string;
}

export class BatchGenerateUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  groupIds: string[];

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchGenerateUserEntryDto)
  users: BatchGenerateUserEntryDto[];
}
