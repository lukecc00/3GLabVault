import { IsEnum } from 'class-validator';

export enum RestoreArchivedContentTarget {
  LAB_ADMIN = 'LAB_ADMIN',
  DIRECTION_ADMIN = 'DIRECTION_ADMIN',
}

export class RestoreArchivedContentDto {
  @IsEnum(RestoreArchivedContentTarget)
  target!: RestoreArchivedContentTarget;
}
