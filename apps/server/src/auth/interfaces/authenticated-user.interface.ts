import { UserStatus } from '../../generated/prisma';

export interface AuthenticatedUser {
  id: string;
  username: string | null;
  email: string;
  realName: string;
  status: UserStatus;
  mustChangePassword: boolean;
  roleCodes: string[];
  groupIds: string[];
  memberships: Array<{
    groupId: string;
    group: {
      id: string;
      name: string;
      type: 'DIRECTION' | 'GRADE' | 'FUNCTIONAL' | 'SYSTEM';
    };
  }>;
}

export interface AuthTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}
