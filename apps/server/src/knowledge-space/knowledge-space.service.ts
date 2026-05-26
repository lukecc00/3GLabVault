import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SpaceVisibility } from '../generated/prisma';
import { ADMIN_ROLE_CODES } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgeSpaceDto } from './dto/create-knowledge-space.dto';

const knowledgeSpaceInclude = {
  ownerGroup: true,
  _count: {
    select: {
      pages: true,
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

@Injectable()
export class KnowledgeSpaceService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(currentUser: AuthenticatedUser) {
    return this.prisma.knowledgeSpace.findMany({
      where: this.buildAccessibleSpaceWhere(currentUser),
      include: knowledgeSpaceInclude,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id },
      include: {
        ...knowledgeSpaceInclude,
        pages: {
          orderBy: {
            updatedAt: 'desc',
          },
        },
      },
    });

    if (!space) {
      throw new NotFoundException('知识库空间不存在');
    }

    this.ensureSpaceAccessible(space, currentUser);

    return space;
  }

  async create(dto: CreateKnowledgeSpaceDto) {
    const [codeExisting, slugExisting] = await Promise.all([
      this.prisma.knowledgeSpace.findUnique({
        where: { code: dto.code },
        select: { id: true },
      }),
      this.prisma.knowledgeSpace.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      }),
    ]);

    if (codeExisting) {
      throw new ConflictException('知识库空间编码已存在');
    }

    if (slugExisting) {
      throw new ConflictException('知识库空间 slug 已存在');
    }

    if (dto.ownerGroupId) {
      const ownerGroup = await this.prisma.group.findUnique({
        where: { id: dto.ownerGroupId },
        select: { id: true },
      });

      if (!ownerGroup) {
        throw new BadRequestException('归属群组不存在');
      }
    }

    return this.prisma.knowledgeSpace.create({
      data: {
        code: dto.code,
        slug: dto.slug,
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility,
        ownerGroupId: dto.ownerGroupId,
      },
      include: knowledgeSpaceInclude,
    });
  }

  async remove(id: string) {
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id },
      include: knowledgeSpaceInclude,
    });

    if (!space) {
      throw new NotFoundException('知识库空间不存在');
    }

    if (space._count.pages > 0) {
      throw new ConflictException(
        `当前知识空间无法删除：仍有 ${space._count.pages} 篇页面。请先删除或迁移页面后再删除空间。`,
      );
    }

    return this.prisma.knowledgeSpace.delete({
      where: { id },
      include: knowledgeSpaceInclude,
    });
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

    return {
      OR: [
        { visibility: SpaceVisibility.PUBLIC },
        {
          visibility: SpaceVisibility.GROUP_RESTRICTED,
          ownerGroupId: {
            in: currentUser.groupIds,
          },
        },
      ],
    };
  }

  private ensureSpaceAccessible(
    space: {
      visibility: SpaceVisibility;
      ownerGroupId: string | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.isAdmin(currentUser)) {
      return;
    }

    if (space.visibility === SpaceVisibility.PUBLIC) {
      return;
    }

    if (
      space.visibility === SpaceVisibility.GROUP_RESTRICTED &&
      space.ownerGroupId &&
      currentUser.groupIds.includes(space.ownerGroupId)
    ) {
      return;
    }

    throw new ForbiddenException('当前账号无权访问该知识空间');
  }

  private isAdmin(currentUser: AuthenticatedUser) {
    return currentUser.roleCodes.some((role) =>
      ADMIN_ROLE_CODES.includes(role as (typeof ADMIN_ROLE_CODES)[number]),
    );
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
}
