import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PageStatus } from '../../generated/prisma';

export class CreateKnowledgePageDto {
  @IsString()
  spaceId: string;

  @IsString()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug 只能包含小写字母、数字和连字符',
  })
  slug: string;

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
