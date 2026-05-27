import { KnowledgePageAccessApproverKind } from '../../generated/prisma';

export interface CreateKnowledgePageAccessRequestDto {
  pageId: string;
  reviewerId: string;
  reviewerKind: KnowledgePageAccessApproverKind;
  reason?: string;
}
