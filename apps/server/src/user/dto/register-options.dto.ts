import { GroupType } from '../../generated/prisma';

export class RegisterOptionGroupDto {
  id: string;
  code: string;
  name: string;
  type: GroupType;
}

export class RegisterOptionsDto {
  groups: RegisterOptionGroupDto[];
  mailDomain: string;
}
