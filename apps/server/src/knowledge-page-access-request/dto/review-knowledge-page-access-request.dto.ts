export interface ReviewKnowledgePageAccessRequestDto {
  action: 'APPROVE' | 'REJECT';
  comment?: string;
}
