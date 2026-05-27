import { IsIn, IsOptional, IsString } from 'class-validator';

export class BulkUpdateInternalMailMailboxDto {
  @IsIn(['inbox', 'sent', 'drafts', 'archive'])
  folder!: 'inbox' | 'sent' | 'drafts' | 'archive';

  @IsIn(['DELETE'])
  action!: 'DELETE';

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['archived', 'direct'])
  archivedSource?: 'archived' | 'direct';

  @IsOptional()
  @IsIn(['read', 'unread'])
  read?: 'read' | 'unread';

  @IsOptional()
  @IsIn(['true', 'false'])
  starred?: 'true' | 'false';
}
