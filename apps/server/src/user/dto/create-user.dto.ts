import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth/password.util';

export class CreateUserDto {
  @IsString()
  @MaxLength(50)
  realName: string;

  @IsString()
  @MaxLength(30)
  @Matches(/^[A-Za-z][A-Za-z0-9]*$/, {
    message: '姓名拼音只能包含英文字母和数字，且需以字母开头',
  })
  namePinyin: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message: PASSWORD_COMPLEXITY_MESSAGE,
  })
  password: string;

  @IsEmail({}, { message: '请输入有效的外部通知邮箱' })
  @MaxLength(255)
  notificationEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}
