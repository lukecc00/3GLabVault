import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { SpaceVisibility } from '../../generated/prisma';

export class CreateKnowledgeSpaceDto {
  @IsString()
  @MaxLength(50)
  code: string;

  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug 只能包含小写字母、数字和连字符',
  })
  slug: string;

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
}
