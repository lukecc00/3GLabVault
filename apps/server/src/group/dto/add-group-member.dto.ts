import { IsEnum, IsString } from 'class-validator';
import { MembershipRole } from '../../generated/prisma';

export class AddGroupMemberDto {
  @IsString()
  userId: string;

  @IsEnum(MembershipRole)
  membershipRole: MembershipRole;
}
