import { IsString, Matches, MaxLength } from 'class-validator';

export class CheckRegisterPrefixDto {
  @IsString()
  @MaxLength(30)
  @Matches(/^[A-Za-z][A-Za-z0-9]*$/, {
    message: '姓名拼音只能包含英文字母和数字，且需以字母开头',
  })
  namePinyin: string;
}
