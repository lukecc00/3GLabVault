import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../auth/password.util';

export class ResetUserPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message: PASSWORD_COMPLEXITY_MESSAGE,
  })
  password?: string;
}
