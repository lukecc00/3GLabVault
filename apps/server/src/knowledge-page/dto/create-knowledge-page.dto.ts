import {
  Allow,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PageStatus } from '../../generated/prisma';

export class CreateKnowledgePageDto {
  @IsString()
  spaceId: string;

  @Allow()
  @IsOptional()
  parentId?: string;

  @IsString()
  @MaxLength(100)
  title: string;

  @IsOptional()
  @Allow()
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsString()
  contentMd: string;

  @IsOptional()
  contentRawJson?: object;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(PageStatus)
  status?: PageStatus;
}
