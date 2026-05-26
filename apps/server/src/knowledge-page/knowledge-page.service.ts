import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PageStatus, Prisma, SpaceVisibility } from '../generated/prisma';
import { ADMIN_ROLE_CODES } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgePageDto } from './dto/create-knowledge-page.dto';
import { UpdateKnowledgePageDto } from './dto/update-knowledge-page.dto';

const knowledgePageInclude = {
  space: true,
  author: true,
  editor: true,
} satisfies Prisma.KnowledgePageInclude;

@Injectable()
export class KnowledgePageService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(spaceId: string | undefined, currentUser: AuthenticatedUser) {
    return this.prisma.knowledgePage.findMany({
      where: {
        ...(spaceId ? { spaceId } : {}),
        space: this.buildAccessibleSpaceWhere(currentUser),
      },
      include: knowledgePageInclude,
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      include: knowledgePageInclude,
    });

    if (!page) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);

    return page;
  }

  async create(dto: CreateKnowledgePageDto, currentUser: AuthenticatedUser) {
    const [space, duplicate] = await Promise.all([
      this.prisma.knowledgeSpace.findUnique({
        where: { id: dto.spaceId },
        select: {
          id: true,
          visibility: true,
          ownerGroupId: true,
        },
      }),
      this.prisma.knowledgePage.findUnique({
        where: {
          spaceId_slug: {
            spaceId: dto.spaceId,
            slug: dto.slug,
          },
        },
        select: { id: true },
      }),
    ]);

    if (!space) {
      throw new BadRequestException('知识库空间不存在');
    }

    this.ensureSpaceAccessible(space, currentUser);

    if (duplicate) {
      throw new ConflictException('同一空间下页面 slug 已存在');
    }

    return this.prisma.knowledgePage.create({
      data: {
        spaceId: dto.spaceId,
        authorId: currentUser.id,
        editorId: currentUser.id,
        title: dto.title,
        slug: dto.slug,
        summary: dto.summary,
        contentMd: dto.contentMd,
        contentRawJson: dto.contentRawJson,
        tags: dto.tags ?? [],
        status: dto.status ?? PageStatus.DRAFT,
        publishedAt:
          dto.status === PageStatus.PUBLISHED ? new Date() : undefined,
      },
      include: knowledgePageInclude,
    });
  }

  async update(
    id: string,
    dto: UpdateKnowledgePageDto,
    currentUser: AuthenticatedUser,
  ) {
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        spaceId: true,
        slug: true,
        status: true,
        authorId: true,
        editorId: true,
        space: {
          select: {
            visibility: true,
            ownerGroupId: true,
          },
        },
      },
    });

    if (!page) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);
    this.ensurePageEditable(page, currentUser);

    const nextSlug = dto.slug ?? page.slug;

    const [duplicate] = await Promise.all([
      this.prisma.knowledgePage.findFirst({
        where: {
          id: {
            not: id,
          },
          spaceId: page.spaceId,
          slug: nextSlug,
        },
        select: { id: true },
      }),
    ]);

    if (duplicate) {
      throw new ConflictException('同一空间下页面 slug 已存在');
    }

    const nextStatus = dto.status ?? page.status;

    return this.prisma.knowledgePage.update({
      where: { id },
      data: {
        editorId: currentUser.id,
        title: dto.title,
        slug: dto.slug,
        summary: dto.summary,
        contentMd: dto.contentMd,
        contentRawJson: dto.contentRawJson,
        tags: dto.tags,
        status: nextStatus,
        publishedAt:
          nextStatus === PageStatus.PUBLISHED
            ? page.status === PageStatus.PUBLISHED
              ? undefined
              : new Date()
            : null,
      },
      include: knowledgePageInclude,
    });
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        spaceId: true,
        title: true,
        authorId: true,
        editorId: true,
        space: {
          select: {
            visibility: true,
            ownerGroupId: true,
          },
        },
      },
    });

    if (!page) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);
    this.ensurePageEditable(page, currentUser);

    return this.prisma.knowledgePage.delete({
      where: { id },
      include: knowledgePageInclude,
    });
  }

  private buildAccessibleSpaceWhere(
    currentUser: AuthenticatedUser,
  ): Prisma.KnowledgeSpaceWhereInput {
    if (this.isAdmin(currentUser)) {
      return {};
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

    throw new ForbiddenException('当前账号无权访问该知识页面');
  }

  private ensurePageEditable(
    page: {
      authorId: string | null;
      editorId: string | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.isAdmin(currentUser)) {
      return;
    }

    if (page.authorId === currentUser.id || page.editorId === currentUser.id) {
      return;
    }

    throw new ForbiddenException('当前账号无权编辑该知识页面');
  }

  private isAdmin(currentUser: AuthenticatedUser) {
    return currentUser.roleCodes.some((role) =>
      ADMIN_ROLE_CODES.includes(role as (typeof ADMIN_ROLE_CODES)[number]),
    );
  }
}
