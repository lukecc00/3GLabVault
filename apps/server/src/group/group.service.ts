import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { GroupType, Prisma, UserGroupMembership } from '../generated/prisma';
import {
  GLOBAL_ADMIN_ROLE_CODES,
  GRADE_ADMIN_ROLE_CODE,
} from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CreateGroupDto } from './dto/create-group.dto';

const groupInclude = {
  parent: true,
  _count: {
    select: {
      memberships: true,
      children: true,
      knowledgeSpaces: true,
    },
  },
} satisfies Prisma.GroupInclude;

const defaultDirectionGroupTemplates = [
  {
    code: 'ANDROID',
    name: 'Android',
    description: 'Android 方向组',
  },
  {
    code: 'WEB',
    name: 'Web',
    description: 'Web 方向组',
  },
  {
    code: 'IOS',
    name: 'iOS',
    description: 'iOS 方向组',
  },
  {
    code: 'HARMONY',
    name: 'HarmonyOS',
    description: 'HarmonyOS 方向组',
  },
  {
    code: 'SERVER',
    name: 'Server',
    description: 'Server 方向组',
  },
] as const;

@Injectable()
export class GroupService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(currentUser?: AuthenticatedUser) {
    const scopedWhere = this.buildScopedGroupWhere(currentUser);

    return this.prisma.group.findMany({
      where: scopedWhere,
      include: groupInclude,
      orderBy: [
        {
          type: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  private buildScopedGroupWhere(
    currentUser?: AuthenticatedUser,
  ): Prisma.GroupWhereInput | undefined {
    if (!currentUser || this.hasGlobalAdminRole(currentUser.roleCodes)) {
      return undefined;
    }

    if (currentUser.roleCodes.includes(GRADE_ADMIN_ROLE_CODE)) {
      const scopedGradeGroupIds = currentUser.groupIds;

      if (scopedGradeGroupIds.length === 0) {
        throw new ForbiddenException('年级管理员未绑定年级群组，无法查看群组列表');
      }

      return {
        id: {
          in: scopedGradeGroupIds,
        },
        type: GroupType.GRADE,
      };
    }

    return undefined;
  }

  private hasGlobalAdminRole(roleCodes: string[]) {
    return roleCodes.some((roleCode) =>
      GLOBAL_ADMIN_ROLE_CODES.includes(
        roleCode as (typeof GLOBAL_ADMIN_ROLE_CODES)[number],
      ),
    );
  }

  async create(dto: CreateGroupDto) {
    const existing = await this.prisma.group.findUnique({
      where: {
        code: dto.code,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new ConflictException('群组编码已存在');
    }

    if (dto.parentId) {
      const parent = await this.prisma.group.findUnique({
        where: {
          id: dto.parentId,
        },
        select: {
          id: true,
        },
      });

      if (!parent) {
        throw new BadRequestException('父群组不存在');
      }
    }

    return this.prisma.group.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        description: dto.description,
        parentId: dto.parentId,
      },
      include: groupInclude,
    });
  }

  async getDirectionBootstrapStatus() {
    const [groupCount, knowledgeSpaceCount] = await this.prisma.$transaction([
      this.prisma.group.count(),
      this.prisma.knowledgeSpace.count(),
    ]);
    const available = groupCount === 0 && knowledgeSpaceCount === 0;

    return {
      available,
      groupCount,
      knowledgeSpaceCount,
      reason: available
        ? null
        : '默认方向组初始化仅限全新部署时使用。当前系统已存在群组或知识空间，请通过群组管理与知识库管理手动维护。',
    };
  }

  async bootstrapDirections() {
    const status = await this.getDirectionBootstrapStatus();

    if (!status.available) {
      throw new ConflictException(
        status.reason ??
          '默认方向组初始化仅限全新部署时使用，当前系统已无法再次初始化。',
      );
    }

    const createdGroups = [];
    const updatedGroups = [];

    for (const template of defaultDirectionGroupTemplates) {
      const result = await this.upsertDefaultDirectionGroup(template);

      if (result.action === 'created') {
        createdGroups.push(result.group);
      } else if (result.action === 'updated') {
        updatedGroups.push(result.group);
      }
    }

    return {
      createdCount: createdGroups.length,
      updatedCount: updatedGroups.length,
      groups: await this.findAll(),
    };
  }

  async addMember(
    groupId: string,
    dto: AddGroupMemberDto,
  ): Promise<UserGroupMembership> {
    const [group, user] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true },
      }),
    ]);

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.prisma.userGroupMembership.upsert({
      where: {
        userId_groupId: {
          userId: dto.userId,
          groupId,
        },
      },
      create: {
        userId: dto.userId,
        groupId,
        membershipRole: dto.membershipRole,
      },
      update: {
        membershipRole: dto.membershipRole,
      },
    });
  }

  async remove(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: groupInclude,
    });

    if (!group) {
      throw new NotFoundException('群组不存在');
    }

    const blockers = [];

    if (group._count.memberships > 0) {
      blockers.push(`仍有 ${group._count.memberships} 个成员`);
    }

    if (group._count.children > 0) {
      blockers.push(`仍有 ${group._count.children} 个子群组`);
    }

    if (group._count.knowledgeSpaces > 0) {
      blockers.push(
        `仍有 ${group._count.knowledgeSpaces} 个知识空间绑定到该群组`,
      );
    }

    if (blockers.length > 0) {
      throw new ConflictException(
        `当前群组无法删除：${blockers.join('，')}。请先解除关联后再删除。`,
      );
    }

    return this.prisma.group.delete({
      where: { id },
      include: groupInclude,
    });
  }

  private async upsertDefaultDirectionGroup(template: {
    code: string;
    name: string;
    description: string;
  }) {
    const existing = await this.prisma.group.findUnique({
      where: { code: template.code },
      include: groupInclude,
    });

    if (existing) {
      return {
        action: 'updated' as const,
        group: await this.prisma.group.update({
          where: { id: existing.id },
          data: {
            name: template.name,
            type: GroupType.DIRECTION,
            description: template.description,
          },
          include: groupInclude,
        }),
      };
    }

    if (template.code === 'SERVER') {
      const legacyBackend = await this.prisma.group.findUnique({
        where: { code: 'BACKEND' },
        include: groupInclude,
      });

      if (legacyBackend) {
        return {
          action: 'updated' as const,
          group: await this.prisma.group.update({
            where: { id: legacyBackend.id },
            data: {
              code: template.code,
              name: template.name,
              type: GroupType.DIRECTION,
              description: template.description,
            },
            include: groupInclude,
          }),
        };
      }
    }

    return {
      action: 'created' as const,
      group: await this.prisma.group.create({
        data: {
          code: template.code,
          name: template.name,
          type: GroupType.DIRECTION,
          description: template.description,
        },
        include: groupInclude,
      }),
    };
  }
}
