import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
  @MinLength(8)
  @MaxLength(64)
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
