import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class BatchGenerateUserEntryDto {
  @IsString()
  @MaxLength(50)
  realName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  studentId?: string;
}

export class BatchGenerateUsersDto {
  @IsArray()
  @IsString({ each: true })
  groupIds: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchGenerateUserEntryDto)
  users: BatchGenerateUserEntryDto[];
}
