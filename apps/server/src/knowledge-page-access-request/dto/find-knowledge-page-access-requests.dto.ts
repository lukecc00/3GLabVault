import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  KnowledgePageAccessApproverKind,
  KnowledgePageAccessRequestStatus,
} from '../../generated/prisma';

export const KNOWLEDGE_APPROVAL_SECTIONS = [
  'pendingReviews',
  'submitted',
  'reviewedByMe',
] as const;

export type KnowledgeApprovalSection =
  (typeof KNOWLEDGE_APPROVAL_SECTIONS)[number];

export class FindKnowledgePageAccessRequestsDto {
  @IsOptional()
  @IsIn(KNOWLEDGE_APPROVAL_SECTIONS)
  section?: KnowledgeApprovalSection;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(KnowledgePageAccessRequestStatus)
  status?: KnowledgePageAccessRequestStatus;

  @IsOptional()
  @IsEnum(KnowledgePageAccessApproverKind)
  reviewerKind?: KnowledgePageAccessApproverKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
