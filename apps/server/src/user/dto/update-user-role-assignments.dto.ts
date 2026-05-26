import { IsArray, IsString } from 'class-validator';

export class UpdateUserRoleAssignmentsDto {
  @IsArray()
  @IsString({ each: true })
  roleIds: string[];
}
