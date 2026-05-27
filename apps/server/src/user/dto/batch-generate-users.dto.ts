import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth/password.util';

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
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message: PASSWORD_COMPLEXITY_MESSAGE,
  })
  password: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchGenerateUserEntryDto)
  users: BatchGenerateUserEntryDto[];
}
