import {
  Allow,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SpaceVisibility } from '../../generated/prisma';

export class CreateKnowledgeSpaceDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @Allow()
  slug?: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(SpaceVisibility)
  visibility?: SpaceVisibility;

  @IsOptional()
  @IsString()
  ownerGroupId?: string;

  @IsOptional()
  @IsString()
  parentSpaceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessGroupIds?: string[];
}
