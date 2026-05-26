import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryInternalMailListDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['read', 'unread'])
  read?: 'read' | 'unread';

  @IsOptional()
  @IsIn(['true', 'false'])
  starred?: 'true' | 'false';
}
