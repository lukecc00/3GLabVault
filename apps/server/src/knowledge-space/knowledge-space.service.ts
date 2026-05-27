import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  GroupType,
  MembershipRole,
  Prisma,
  SpaceVisibility,
} from '../generated/prisma';
import {
  DIRECTION_ADMIN_ROLE_CODE,
  GRADE_ADMIN_ROLE_CODE,
} from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgeSpaceDto } from './dto/create-knowledge-space.dto';

const knowledgeSpaceInclude = {
  ownerGroup: true,
  parentSpace: {
    select: {
      id: true,
      code: true,
      slug: true,
      name: true,
      description: true,
      visibility: true,
      ownerGroupId: true,
      parentSpaceId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  accessGroups: {
    include: {
      group: true,
    },
    orderBy: {
      group: {
        name: 'asc',
      },
    },
  },
  _count: {
    select: {
      pages: {
        where: {
          deletedAt: null,
        },
      },
      childSpaces: {
        where: {
          deletedAt: null,
        },
      },
    },
  },
} satisfies Prisma.KnowledgeSpaceInclude;

const defaultDirectionSpaceTemplates = [
  {
    groupCode: 'ANDROID',
    code: 'SPACE_ANDROID',
    slug: 'android',
    name: 'Android 空间',
    description: 'Android 方向知识空间',
  },
  {
    groupCode: 'WEB',
    code: 'SPACE_WEB',
    slug: 'web',
    name: 'Web 空间',
    description: 'Web 方向知识空间',
  },
  {
    groupCode: 'IOS',
    code: 'SPACE_IOS',
    slug: 'ios',
    name: 'iOS 空间',
    description: 'iOS 方向知识空间',
  },
  {
    groupCode: 'HARMONY',
    code: 'SPACE_HARMONYOS',
    slug: 'harmonyos',
    name: 'HarmonyOS 空间',
    description: 'HarmonyOS 方向知识空间',
    legacyCode: 'SPACE_HARMONY',
  },
  {
    groupCode: 'SERVER',
    code: 'SPACE_SERVER',
    slug: 'server',
    name: 'Server 空间',
    description: 'Server 方向知识空间',
    legacyCode: 'SPACE_BACKEND',
  },
] as const;

const KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'LAB_ADMIN'] as const;
const KNOWLEDGE_DELETE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const KNOWLEDGE_DELETE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class KnowledgeSpaceService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.runExpiredDeletionCleanup();
    this.cleanupTimer = setInterval(() => {
      void this.runExpiredDeletionCleanup();
    }, KNOWLEDGE_DELETE_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async findAll(currentUser: AuthenticatedUser) {
    await this.runExpiredDeletionCleanup();
    return this.prisma.knowledgeSpace.findMany({
      where: this.mergeWhere(
        {
          deletedAt: null,
        },
        this.buildAccessibleSpaceWhere(currentUser),
      ),
      include: knowledgeSpaceInclude,
      orderBy: [{ parentSpaceId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    await this.runExpiredDeletionCleanup();
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id },
      include: {
        ...knowledgeSpaceInclude,
        pages: {
          where: {
            deletedAt: null,
          },
          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              createdAt: 'asc',
            },
          ],
        },
      },
    });

    if (!space || space.deletedAt) {
      throw new NotFoundException('知识库空间不存在');
    }

    this.ensureSpaceAccessible(space, currentUser);

    const [canManageSubspaces, canManageAccess] = await Promise.all([
      this.canManageChildSpaceCreation(space, currentUser),
      this.canManageSpaceAccess(space, currentUser),
    ]);
    const [childSpaces, availableGradeGroups] = await Promise.all([
      this.prisma.knowledgeSpace.findMany({
        where: this.mergeWhere(
          {
            parentSpaceId: id,
            deletedAt: null,
          },
          canManageSubspaces ? undefined : this.buildAccessibleSpaceWhere(currentUser),
        ),
        include: knowledgeSpaceInclude,
        orderBy: {
          createdAt: 'asc',
        },
      }),
      canManageSubspaces || canManageAccess
        ? this.findAvailableGradeGroups()
        : Promise.resolve([]),
    ]);

    return {
      ...space,
      childSpaces,
      management: {
        canManageSubspaces,
        canManageAccess,
        availableGradeGroups,
      },
    };
  }

  async create(
    rawDto: Record<string, unknown>,
    currentUser: AuthenticatedUser,
  ) {
    await this.runExpiredDeletionCleanup();
    const dto = this.normalizeCreateDto(rawDto);
    const codeExisting = await this.prisma.knowledgeSpace.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });

    if (codeExisting) {
      throw new ConflictException('知识库空间编码已存在');
    }

    if (dto.parentSpaceId) {
      const parentSpace = await this.prisma.knowledgeSpace.findUnique({
        where: { id: dto.parentSpaceId },
        include: {
          ownerGroup: true,
          accessGroups: {
            select: {
              groupId: true,
            },
          },
        },
      });

      if (!parentSpace || parentSpace.deletedAt) {
        throw new BadRequestException('父知识库空间不存在');
      }

      if (parentSpace.parentSpaceId) {
        throw new BadRequestException('当前仅支持在方向知识库下创建一层子知识库');
      }

      if (
        !parentSpace.ownerGroupId ||
        parentSpace.ownerGroup?.type !== GroupType.DIRECTION
      ) {
        throw new BadRequestException('仅方向知识库支持创建子知识库');
      }

      if (!(await this.canManageChildSpaceCreation(parentSpace, currentUser))) {
        throw new ForbiddenException('当前账号无权在该方向知识库下创建子知识库');
      }

      const accessGroupIds = await this.resolveValidatedAccessGroupIds(
        dto.accessGroupIds,
        true,
      );
      const slug = await this.resolveUniqueSpaceSlug(dto.slug ?? dto.code);

      return this.prisma.knowledgeSpace.create({
        data: {
          code: dto.code,
          slug,
          name: dto.name,
          description: dto.description,
          visibility: SpaceVisibility.GROUP_RESTRICTED,
          ownerGroupId: parentSpace.ownerGroupId,
          parentSpaceId: parentSpace.id,
          accessGroups: {
            create: accessGroupIds.map((groupId) => ({
              groupId,
            })),
          },
        },
        include: knowledgeSpaceInclude,
      });
    }

    if (dto.accessGroupIds && dto.accessGroupIds.length > 0) {
      throw new BadRequestException('顶级知识库空间不支持直接配置年级访问范围');
    }

    if (dto.visibility === SpaceVisibility.GROUP_RESTRICTED && !dto.ownerGroupId) {
      throw new BadRequestException('群组可见的知识库空间必须绑定归属群组');
    }

    if (dto.ownerGroupId) {
      const ownerGroup = await this.prisma.group.findUnique({
        where: { id: dto.ownerGroupId },
        select: { id: true, type: true },
      });

      if (!ownerGroup) {
        throw new BadRequestException('归属群组不存在');
      }

      if (
        !this.isAdmin(currentUser) &&
        !this.canManageOwnedSpace(
          {
            ownerGroupId: ownerGroup.id,
            ownerGroup: {
              type: ownerGroup.type,
            },
          },
          currentUser,
        )
      ) {
        throw new ForbiddenException('当前账号只能创建自己负责群组下的知识库空间');
      }
    } else if (!this.isAdmin(currentUser)) {
      throw new ForbiddenException('非全局知识库管理员创建顶级空间时必须绑定归属群组');
    }

    if (
      !this.isAdmin(currentUser) &&
      dto.visibility !== SpaceVisibility.GROUP_RESTRICTED
    ) {
      throw new ForbiddenException('方向管理员和年级管理员只能创建群组可见的知识库空间');
    }

    const slug = await this.resolveUniqueSpaceSlug(dto.slug ?? dto.code);

    return this.prisma.knowledgeSpace.create({
      data: {
        code: dto.code,
        slug,
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility,
        ownerGroupId: dto.ownerGroupId,
      },
      include: knowledgeSpaceInclude,
    });
  }

  async grantAccessGroup(
    id: string,
    rawDto: Record<string, unknown>,
    currentUser: AuthenticatedUser,
  ) {
    await this.runExpiredDeletionCleanup();
    const groupId = this.requireString(rawDto.groupId, '目标年级不能为空');
    const space = await this.findSpaceForAccessManagement(id);

    if (!(await this.canManageSpaceAccess(space, currentUser))) {
      throw new ForbiddenException('当前账号无权管理该子知识库的年级权限');
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        type: true,
      },
    });

    if (!group) {
      throw new BadRequestException('目标年级不存在');
    }

    if (group.type !== GroupType.GRADE) {
      throw new BadRequestException('仅支持为年级组开通子知识库权限');
    }

    if (space.accessGroups.some((item) => item.groupId === group.id)) {
      throw new ConflictException('该年级已开通当前子知识库权限');
    }

    return this.prisma.knowledgeSpaceAccessGroup.create({
      data: {
        spaceId: space.id,
        groupId: group.id,
      },
      include: {
        group: true,
      },
    });
  }

  async revokeAccessGroup(
    id: string,
    groupId: string,
    currentUser: AuthenticatedUser,
  ) {
    await this.runExpiredDeletionCleanup();
    const space = await this.findSpaceForAccessManagement(id);

    if (!(await this.canManageSpaceAccess(space, currentUser))) {
      throw new ForbiddenException('当前账号无权管理该子知识库的年级权限');
    }

    const accessGroup = await this.prisma.knowledgeSpaceAccessGroup.findUnique({
      where: {
        spaceId_groupId: {
          spaceId: space.id,
          groupId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!accessGroup) {
      throw new NotFoundException('当前子知识库未开通该年级权限');
    }

    if (space.accessGroups.length <= 1) {
      throw new BadRequestException('子知识库至少需要保留一个可访问年级');
    }

    return this.prisma.knowledgeSpaceAccessGroup.delete({
      where: {
        id: accessGroup.id,
      },
      include: {
        group: true,
      },
    });
  }

  private normalizeCreateDto(
    dto: Record<string, unknown>,
  ): CreateKnowledgeSpaceDto {
    return {
      code: this.requireString(dto.code, '知识库空间编码不能为空'),
      slug: this.optionalString(dto.slug),
      name: this.requireString(dto.name, '知识库空间名称不能为空'),
      description: this.optionalString(dto.description),
      visibility:
        dto.visibility === SpaceVisibility.PUBLIC ||
        dto.visibility === SpaceVisibility.PRIVATE ||
        dto.visibility === SpaceVisibility.GROUP_RESTRICTED
          ? dto.visibility
          : undefined,
      ownerGroupId: this.optionalString(dto.ownerGroupId),
      parentSpaceId: this.optionalString(dto.parentSpaceId),
      accessGroupIds: Array.isArray(dto.accessGroupIds)
        ? Array.from(
            new Set(
              dto.accessGroupIds
                .filter((value): value is string => typeof value === 'string')
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          )
        : undefined,
    };
  }

  private requireString(value: unknown, message: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(message);
    }

    return value.trim();
  }

  private optionalString(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmedValue = value.trim();
    return trimmedValue || undefined;
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    await this.runExpiredDeletionCleanup();
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id },
      include: knowledgeSpaceInclude,
    });

    if (!space || space.deletedAt) {
      throw new NotFoundException('知识库空间不存在');
    }

    const canRemove = this.canManageOwnedSpace(space, currentUser);

    if (!canRemove) {
      throw new ForbiddenException('当前账号无权删除该知识库空间');
    }

    const [pageCount, childSpaceCount] = await Promise.all([
      this.prisma.knowledgePage.count({
        where: {
          spaceId: id,
          deletedAt: null,
        },
      }),
      this.prisma.knowledgeSpace.count({
        where: {
          parentSpaceId: id,
          deletedAt: null,
        },
      }),
    ]);

    if (pageCount > 0) {
      throw new ConflictException(
        `当前知识空间无法删除：仍有 ${pageCount} 篇页面。请先删除或迁移页面后再删除空间。`,
      );
    }

    if (childSpaceCount > 0) {
      throw new ConflictException(
        `当前知识空间无法删除：仍有 ${childSpaceCount} 个子知识库。请先删除子知识库后再删除当前空间。`,
      );
    }

    const now = new Date();
    const deleteExpiresAt = new Date(now.getTime() + KNOWLEDGE_DELETE_RETENTION_MS);

    return this.prisma.knowledgeSpace.update({
      where: { id },
      data: {
        deletedAt: now,
        deleteExpiresAt,
      },
      include: knowledgeSpaceInclude,
    });
  }

  async findArchived() {
    await this.runExpiredDeletionCleanup();
    return this.prisma.knowledgeSpace.findMany({
      where: {
        deletedAt: {
          not: null,
        },
      },
      include: knowledgeSpaceInclude,
      orderBy: [{ deleteExpiresAt: 'asc' }, { deletedAt: 'desc' }],
    });
  }

  async restore(id: string) {
    await this.runExpiredDeletionCleanup();
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id },
      include: knowledgeSpaceInclude,
    });

    if (!space) {
      throw new NotFoundException('知识库空间不存在');
    }

    if (!space.deletedAt) {
      throw new BadRequestException('当前知识库空间未处于删除保留期');
    }

    return this.prisma.knowledgeSpace.update({
      where: { id },
      data: {
        deletedAt: null,
        deleteExpiresAt: null,
      },
      include: knowledgeSpaceInclude,
    });
  }

  async runExpiredDeletionCleanup() {
    if (this.cleanupRunning) {
      return;
    }

    this.cleanupRunning = true;

    try {
      const now = new Date();
      const [expiredPages, expiredSpaces] = await Promise.all([
        this.prisma.knowledgePage.findMany({
          where: {
            deletedAt: {
              not: null,
            },
            deleteExpiresAt: {
              lte: now,
            },
          },
          select: {
            id: true,
          },
        }),
        this.prisma.knowledgeSpace.findMany({
          where: {
            deletedAt: {
              not: null,
            },
            deleteExpiresAt: {
              lte: now,
            },
          },
          select: {
            id: true,
          },
        }),
      ]);

      if (expiredPages.length === 0 && expiredSpaces.length === 0) {
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        if (expiredPages.length > 0) {
          await tx.knowledgePage.deleteMany({
            where: {
              id: {
                in: expiredPages.map((page) => page.id),
              },
            },
          });
        }

        if (expiredSpaces.length > 0) {
          await tx.knowledgeSpace.deleteMany({
            where: {
              id: {
                in: expiredSpaces.map((space) => space.id),
              },
            },
          });
        }
      });
    } finally {
      this.cleanupRunning = false;
    }
  }

  async bootstrapDirectionSpaces() {
    const createdSpaces = [];
    const updatedSpaces = [];

    for (const template of defaultDirectionSpaceTemplates) {
      const result = await this.upsertDefaultDirectionSpace(template);

      if (result.action === 'created') {
        createdSpaces.push(result.space);
      } else if (result.action === 'updated') {
        updatedSpaces.push(result.space);
      }
    }

    return {
      createdCount: createdSpaces.length,
      updatedCount: updatedSpaces.length,
      spaces: await this.prisma.knowledgeSpace.findMany({
        include: knowledgeSpaceInclude,
        orderBy: {
          createdAt: 'asc',
        },
      }),
    };
  }

  private buildAccessibleSpaceWhere(
    currentUser: AuthenticatedUser,
  ): Prisma.KnowledgeSpaceWhereInput | undefined {
    if (this.isAdmin(currentUser)) {
      return undefined;
    }

    const where: Prisma.KnowledgeSpaceWhereInput['OR'] = [
      {
        parentSpaceId: null,
        visibility: SpaceVisibility.PUBLIC,
      },
      {
        parentSpaceId: null,
        visibility: SpaceVisibility.GROUP_RESTRICTED,
        ownerGroupId: {
          in: currentUser.groupIds,
        },
      },
      {
        parentSpaceId: {
          not: null,
        },
        visibility: SpaceVisibility.GROUP_RESTRICTED,
        ownerGroupId: {
          in: currentUser.groupIds,
        },
        accessGroups: {
          some: {
            groupId: {
              in: currentUser.groupIds,
            },
          },
        },
      },
    ];

    if (this.isDirectionAdmin(currentUser)) {
      where.push({
        visibility: SpaceVisibility.GROUP_RESTRICTED,
        ownerGroupId: {
          in: currentUser.groupIds,
        },
        ownerGroup: {
          type: GroupType.DIRECTION,
        },
      });
    }

    return { OR: where };
  }

  private ensureSpaceAccessible(
    space: {
      visibility: SpaceVisibility;
      ownerGroupId: string | null;
      parentSpaceId?: string | null;
      ownerGroup?: {
        type: GroupType;
      } | null;
      accessGroups?: Array<{
        groupId: string;
      }>;
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.isAdmin(currentUser)) {
      return;
    }

    if (!space.parentSpaceId && space.visibility === SpaceVisibility.PUBLIC) {
      return;
    }

    if (
      space.visibility === SpaceVisibility.GROUP_RESTRICTED &&
      space.ownerGroupId &&
      currentUser.groupIds.includes(space.ownerGroupId) &&
      (!space.parentSpaceId ||
        space.accessGroups?.some((group) =>
          currentUser.groupIds.includes(group.groupId),
        ))
    ) {
      return;
    }

    if (this.canManageOwnedDirectionSpace(space, currentUser)) {
      return;
    }

    throw new ForbiddenException('当前账号无权访问该知识空间');
  }

  private isAdmin(currentUser: AuthenticatedUser) {
    return currentUser.roleCodes.some((role) =>
      KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES.includes(
        role as (typeof KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES)[number],
      ),
    );
  }

  private isDirectionAdmin(currentUser: AuthenticatedUser) {
    return currentUser.roleCodes.includes(DIRECTION_ADMIN_ROLE_CODE);
  }

  private canManageOwnedSpace(
    space: {
      ownerGroupId: string | null;
      ownerGroup?: {
        type: GroupType;
      } | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    return (
      this.canManageOwnedGradeSpace(space, currentUser) ||
      this.canManageOwnedDirectionSpace(space, currentUser)
    );
  }

  private canManageOwnedGradeSpace(
    space: {
      ownerGroupId: string | null;
      ownerGroup?: {
        type: GroupType;
      } | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    const ownerGroupId = space.ownerGroupId;

    return (
      currentUser.roleCodes.includes(GRADE_ADMIN_ROLE_CODE) &&
      ownerGroupId !== null &&
      currentUser.groupIds.includes(ownerGroupId) &&
      space.ownerGroup?.type === GroupType.GRADE
    );
  }

  private canManageOwnedDirectionSpace(
    space: {
      ownerGroupId: string | null;
      ownerGroup?: {
        type: GroupType;
      } | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    const ownerGroupId = space.ownerGroupId;

    return (
      this.isDirectionAdmin(currentUser) &&
      ownerGroupId !== null &&
      currentUser.groupIds.includes(ownerGroupId) &&
      space.ownerGroup?.type === GroupType.DIRECTION
    );
  }

  private async resolveUniqueSpaceSlug(source: string) {
    const maxSlugLength = 80;
    const baseSlug = this.toInternalSlug(source, 'space');
    let slug = baseSlug;
    let index = 1;

    while (
      await this.prisma.knowledgeSpace.findUnique({
        where: { slug },
        select: { id: true },
      })
    ) {
      index += 1;
      const suffix = `-${index}`;
      slug = `${baseSlug.slice(0, maxSlugLength - suffix.length)}${suffix}`;
    }

    return slug;
  }

  private toInternalSlug(source: string, fallback: string) {
    const slug = source
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '');

    return slug || fallback;
  }

  private async upsertDefaultDirectionSpace(template: {
    groupCode: string;
    code: string;
    slug: string;
    name: string;
    description: string;
    legacyCode?: string;
  }) {
    const ownerGroup = await this.prisma.group.findUnique({
      where: { code: template.groupCode },
      select: { id: true },
    });

    if (!ownerGroup) {
      throw new BadRequestException(
        `方向组 ${template.groupCode} 不存在，请先初始化方向组`,
      );
    }

    const existing = await this.prisma.knowledgeSpace.findUnique({
      where: { code: template.code },
      include: knowledgeSpaceInclude,
    });

    if (existing) {
      return {
        action: 'updated' as const,
        space: await this.prisma.knowledgeSpace.update({
          where: { id: existing.id },
          data: {
            slug: template.slug,
            name: template.name,
            description: template.description,
            visibility: SpaceVisibility.GROUP_RESTRICTED,
            ownerGroupId: ownerGroup.id,
            parentSpaceId: null,
          },
          include: knowledgeSpaceInclude,
        }),
      };
    }

    if (template.legacyCode) {
      const legacySpace = await this.prisma.knowledgeSpace.findUnique({
        where: { code: template.legacyCode },
        include: knowledgeSpaceInclude,
      });

      if (legacySpace) {
        return {
          action: 'updated' as const,
          space: await this.prisma.knowledgeSpace.update({
            where: { id: legacySpace.id },
            data: {
              code: template.code,
              slug: template.slug,
              name: template.name,
              description: template.description,
              visibility: SpaceVisibility.GROUP_RESTRICTED,
              ownerGroupId: ownerGroup.id,
              parentSpaceId: null,
            },
            include: knowledgeSpaceInclude,
          }),
        };
      }
    }

    return {
      action: 'created' as const,
      space: await this.prisma.knowledgeSpace.create({
        data: {
          code: template.code,
          slug: template.slug,
          name: template.name,
          description: template.description,
          visibility: SpaceVisibility.GROUP_RESTRICTED,
          ownerGroupId: ownerGroup.id,
        },
        include: knowledgeSpaceInclude,
      }),
    };
  }

  private async resolveValidatedAccessGroupIds(
    accessGroupIds: string[] | undefined,
    required: boolean,
  ) {
    if (!accessGroupIds || accessGroupIds.length === 0) {
      if (required) {
        throw new BadRequestException('子知识库至少需要配置一个可访问年级');
      }

      return [];
    }

    const groups = await this.prisma.group.findMany({
      where: {
        id: {
          in: accessGroupIds,
        },
        type: GroupType.GRADE,
      },
      select: {
        id: true,
      },
    });

    if (groups.length !== accessGroupIds.length) {
      throw new BadRequestException('子知识库仅支持绑定有效的年级组');
    }

    return accessGroupIds;
  }

  private async canManageChildSpaceCreation(
    space: {
      ownerGroupId: string | null;
      parentSpaceId?: string | null;
      ownerGroup?: {
        type: GroupType;
      } | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.isAdmin(currentUser)) {
      return true;
    }

    if (space.parentSpaceId) {
      return false;
    }

    return this.canManageOwnedDirectionSpace(space, currentUser);
  }

  private async canManageSpaceAccess(
    space: {
      ownerGroupId: string | null;
      parentSpaceId: string | null;
      accessGroups: Array<{
        groupId: string;
      }>;
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.isAdmin(currentUser)) {
      return true;
    }

    if (!space.parentSpaceId) {
      return false;
    }

    return this.canManageOwnedDirectionSpace(space, currentUser);
  }

  private async isGroupManager(userId: string, groupId: string) {
    const membership = await this.prisma.userGroupMembership.findFirst({
      where: {
        userId,
        groupId,
        membershipRole: MembershipRole.MANAGER,
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }

  private findAvailableGradeGroups() {
    return this.prisma.group.findMany({
      where: {
        type: GroupType.GRADE,
      },
      include: {
        parent: true,
        _count: {
          select: {
            memberships: true,
            children: true,
            knowledgeSpaces: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  private async findSpaceForAccessManagement(id: string) {
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id },
      include: {
        ownerGroup: true,
        parentSpace: true,
        accessGroups: {
          select: {
            groupId: true,
            group: true,
          },
        },
      },
    });

    if (!space) {
      throw new NotFoundException('知识库空间不存在');
    }

    if (!space.parentSpaceId) {
      throw new BadRequestException('仅子知识库支持年级权限管理');
    }

    return space;
  }

  private mergeWhere(
    left: Prisma.KnowledgeSpaceWhereInput,
    right: Prisma.KnowledgeSpaceWhereInput | undefined,
  ): Prisma.KnowledgeSpaceWhereInput {
    if (!right) {
      return left;
    }

    return {
      AND: [left, right],
    };
  }
}
