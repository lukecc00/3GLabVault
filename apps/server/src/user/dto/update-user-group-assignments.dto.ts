import { IsArray, IsString } from 'class-validator';

export class UpdateUserGroupAssignmentsDto {
  @IsArray()
  @IsString({ each: true })
  groupIds: string[];
}
