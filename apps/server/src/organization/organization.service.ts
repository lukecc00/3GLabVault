import { Injectable } from '@nestjs/common';
import { GroupType, UserStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [
      userCount,
      pendingUserCount,
      roleCount,
      groupCount,
      directionCount,
      gradeCount,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          archivedAt: null,
        },
      }),
      this.prisma.user.count({
        where: {
          status: UserStatus.PENDING,
          archivedAt: null,
        },
      }),
      this.prisma.role.count(),
      this.prisma.group.count(),
      this.prisma.group.count({
        where: {
          type: GroupType.DIRECTION,
        },
      }),
      this.prisma.group.count({
        where: {
          type: GroupType.GRADE,
        },
      }),
    ]);

    return {
      userCount,
      pendingUserCount,
      roleCount,
      groupCount,
      directionCount,
      gradeCount,
    };
  }
}
