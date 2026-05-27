import { IsIn } from 'class-validator';

export class UpdateInternalMailMailboxDto {
  @IsIn(['STAR', 'UNSTAR', 'ARCHIVE', 'DELETE', 'RESTORE', 'PURGE'])
  action: 'STAR' | 'UNSTAR' | 'ARCHIVE' | 'DELETE' | 'RESTORE' | 'PURGE';
}
