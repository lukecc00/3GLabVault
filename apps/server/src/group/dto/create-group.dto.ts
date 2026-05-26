import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { GroupType } from '../../generated/prisma';

export class CreateGroupDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsString()
  @MaxLength(50)
  name: string;

  @IsEnum(GroupType)
  type: GroupType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
