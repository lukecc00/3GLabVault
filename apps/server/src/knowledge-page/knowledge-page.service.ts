import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  KnowledgePageAccessApproverKind,
  KnowledgePageAccessRequestStatus,
  GroupType,
  MembershipRole,
  PageStatus,
  Prisma,
  SpaceVisibility,
  UserStatus,
} from '../generated/prisma';
import sharp from 'sharp';
import {
  DIRECTION_ADMIN_ROLE_CODE,
  GRADE_ADMIN_ROLE_CODE,
} from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { InternalMailService } from '../internal-mail/internal-mail.service';
import { KnowledgeSpaceService } from '../knowledge-space/knowledge-space.service';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../storage/minio.service';
import { CreateKnowledgePageDto } from './dto/create-knowledge-page.dto';
import { UpdateKnowledgePageDto } from './dto/update-knowledge-page.dto';

const knowledgePageInclude = {
  space: {
    include: {
      ownerGroup: true,
      accessGroups: {
        select: {
          groupId: true,
        },
      },
    },
  },
  parent: {
    select: {
      id: true,
      title: true,
      slug: true,
      parentId: true,
    },
  },
  author: true,
  editor: true,
} satisfies Prisma.KnowledgePageInclude;

const knowledgePermissionUserSelect = {
  id: true,
  realName: true,
  email: true,
} satisfies Prisma.UserSelect;

const knowledgePageEditGrantInclude = {
  user: {
    select: knowledgePermissionUserSelect,
  },
  grantedBy: {
    select: knowledgePermissionUserSelect,
  },
} satisfies Prisma.KnowledgePageEditGrantInclude;

const KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'LAB_ADMIN'] as const;
const KNOWLEDGE_IMAGE_OBJECT_PREFIX = 'knowledge-images';
const KNOWLEDGE_IMAGE_MAX_DIMENSION = 2400;
const KNOWLEDGE_DELETE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const KNOWLEDGE_IMAGE_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface UploadedKnowledgeImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class KnowledgePageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly internalMailService: InternalMailService,
    private readonly minioService: MinioService,
    private readonly knowledgeSpaceService: KnowledgeSpaceService,
  ) {}

  async findAll(
    spaceId: string | undefined,
    query: string | undefined,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const trimmedQuery = query?.trim();

    return this.prisma.knowledgePage.findMany({
      where: {
        deletedAt: null,
        ...(spaceId ? { spaceId } : {}),
        ...(trimmedQuery
          ? {
              OR: [
                {
                  title: {
                    contains: trimmedQuery,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  summary: {
                    contains: trimmedQuery,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  contentMd: {
                    contains: trimmedQuery,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  tags: {
                    has: trimmedQuery,
                  },
                },
              ],
            }
          : {}),
        space: this.mergeSpaceWhere(
          {
            deletedAt: null,
          },
          this.buildAccessibleSpaceWhere(currentUser),
        ),
      },
      include: knowledgePageInclude,
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      include: knowledgePageInclude,
    });

    if (!page || page.deletedAt || page.space.deletedAt) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);

    return {
      ...page,
      editPermission: await this.buildEditPermissionContext(page, currentUser),
    };
  }

  async uploadImage(
    spaceId: string,
    file: UploadedKnowledgeImageFile | undefined,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    if (!file) {
      throw new BadRequestException('请先选择要上传的图片文件');
    }

    const normalizedSpaceId = this.requireString(spaceId, '知识库空间不存在');
    await this.findAccessibleSpaceOrThrow(normalizedSpaceId, currentUser);
    const optimizedImage = await this.optimizeKnowledgeImage(file);
    const objectKey = this.buildKnowledgeImageObjectKey(
      normalizedSpaceId,
      optimizedImage.extension,
    );

    await this.minioService.putObject(objectKey, optimizedImage.buffer, {
      'Content-Type': optimizedImage.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
    });

    return {
      url: this.buildKnowledgeImageUrl(normalizedSpaceId, objectKey),
      key: objectKey,
      contentType: optimizedImage.contentType,
      width: optimizedImage.width,
      height: optimizedImage.height,
      size: optimizedImage.buffer.length,
    };
  }

  async getImageAsset(
    spaceId: string,
    key: string,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const normalizedSpaceId = this.requireString(spaceId, '知识库空间不存在');
    const normalizedKey = this.requireString(key, '图片资源不存在');

    this.ensureKnowledgeImageKey(normalizedSpaceId, normalizedKey);
    await this.findAccessibleSpaceOrThrow(normalizedSpaceId, currentUser);

    const [stream, stat] = await Promise.all([
      this.minioService.getObject(normalizedKey),
      this.minioService.statObject(normalizedKey),
    ]);

    return {
      stream,
      contentType:
        stat.metaData?.['content-type'] ||
        stat.metaData?.['Content-Type'] ||
        'application/octet-stream',
      cacheControl:
        stat.metaData?.['cache-control'] || stat.metaData?.['Cache-Control'],
      contentLength: stat.size,
      etag: stat.etag,
    };
  }

  async findPermissionManagement(
    id: string,
    query: string | undefined,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        deletedAt: true,
        title: true,
        authorId: true,
        editorId: true,
        space: {
          select: {
            id: true,
            name: true,
            visibility: true,
            ownerGroupId: true,
            parentSpaceId: true,
            deletedAt: true,
            ownerGroup: {
              select: {
                type: true,
              },
            },
            accessGroups: {
              select: {
                groupId: true,
              },
            },
          },
        },
        editGrants: {
          include: knowledgePageEditGrantInclude,
          orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
        },
      },
    });

    if (!page || page.deletedAt || page.space.deletedAt) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);

    if (!(await this.canManagePagePermissions(page, currentUser))) {
      throw new ForbiddenException('当前账号无权管理该知识页面的编辑权限');
    }

    const excludedUserIds = Array.from(
      new Set(
        [
          ...this.getPageOwnerIds(page),
          ...page.editGrants.map((grant) => grant.userId),
        ].filter((userId): userId is string => Boolean(userId)),
      ),
    );
    const search = query?.trim() || undefined;
    const availableUsers = await this.findGrantableUsers(
      page.space,
      excludedUserIds,
      search,
    );

    return {
      canManage: true,
      grants: page.editGrants,
      availableUsers,
    };
  }

  async create(
    rawDto: Record<string, unknown>,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const dto = this.normalizeCreateDto(rawDto);
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id: dto.spaceId },
      select: {
        id: true,
        deletedAt: true,
        visibility: true,
        ownerGroupId: true,
        parentSpaceId: true,
        ownerGroup: {
          select: {
            type: true,
          },
        },
        accessGroups: {
          select: {
            groupId: true,
          },
        },
      },
    });

    if (!space || space.deletedAt) {
      throw new BadRequestException('知识库空间不存在');
    }

    this.ensureSpaceAccessible(space, currentUser);

    await this.ensureParentPageInSpace(dto.parentId, dto.spaceId);
    const slug = await this.resolveUniquePageSlug(
      dto.spaceId,
      dto.slug ?? dto.title,
    );

    return this.prisma.knowledgePage.create({
      data: {
        spaceId: dto.spaceId,
        parentId: dto.parentId,
        authorId: currentUser.id,
        editorId: currentUser.id,
        title: dto.title,
        slug,
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
    rawDto: Record<string, unknown>,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const dto = this.normalizeUpdateDto(rawDto);
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        deletedAt: true,
        spaceId: true,
        slug: true,
        status: true,
        authorId: true,
        editorId: true,
        editGrants: {
          select: {
            userId: true,
          },
        },
        parentId: true,
        space: {
          select: {
            visibility: true,
            ownerGroupId: true,
            parentSpaceId: true,
            deletedAt: true,
            ownerGroup: {
              select: {
                type: true,
              },
            },
            accessGroups: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
    });

    if (!page || page.deletedAt || page.space.deletedAt) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);
    this.ensurePageEditable(page, currentUser);

    const nextStatus = dto.status ?? page.status;
    const nextParentId =
      dto.parentId === undefined ? page.parentId : dto.parentId || null;

    await this.ensureParentPageInSpace(nextParentId, page.spaceId);
    await this.ensureNoParentCycle(id, nextParentId);

    const updatedPage = await this.prisma.knowledgePage.update({
      where: { id },
      data: {
        parentId: nextParentId,
        editorId: currentUser.id,
        title: dto.title,
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

    return {
      ...updatedPage,
      editPermission: await this.buildEditPermissionContext(
        updatedPage,
        currentUser,
      ),
    };
  }

  async grantPermission(
    id: string,
    rawDto: Record<string, unknown>,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const targetUserId = this.requireString(rawDto.userId, '授权用户不能为空');
    const comment = this.optionalString(rawDto.comment);
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        deletedAt: true,
        title: true,
        authorId: true,
        editorId: true,
        editGrants: {
          select: {
            userId: true,
          },
        },
        space: {
          select: {
            id: true,
            name: true,
            visibility: true,
            ownerGroupId: true,
            parentSpaceId: true,
            deletedAt: true,
            ownerGroup: {
              select: {
                type: true,
              },
            },
            accessGroups: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
    });

    if (!page || page.deletedAt || page.space.deletedAt) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);

    if (!(await this.canManagePagePermissions(page, currentUser))) {
      throw new ForbiddenException('当前账号无权管理该知识页面的编辑权限');
    }

    if (this.getPageOwnerIds(page).includes(targetUserId)) {
      throw new BadRequestException('页面所有者默认具备编辑权限，无需重复授权');
    }

    if (page.editGrants.some((grant) => grant.userId === targetUserId)) {
      throw new BadRequestException('该用户已具备当前知识页面的编辑权限');
    }

    const targetUser = await this.findGrantableUserById(
      page.space,
      targetUserId,
    );

    if (!targetUser) {
      throw new BadRequestException('目标用户当前无法获得该知识页面的编辑权限');
    }

    const createdGrant = await this.prisma.knowledgePageEditGrant.create({
      data: {
        pageId: page.id,
        userId: targetUserId,
        grantedById: currentUser.id,
      },
      include: knowledgePageEditGrantInclude,
    });

    await this.internalMailService.sendNotification({
      senderId: currentUser.id,
      toUserIds: [targetUserId],
      subject: `知识页编辑权限已授予：${page.title}`,
      bodyMarkdown: [
        '# 知识页编辑权限变更',
        '',
        `${currentUser.realName} 已主动授予你知识页面编辑权限。`,
        '',
        `- 知识库：${page.space.name}`,
        `- 页面：${page.title}`,
        `- 说明：${comment || '未填写'}`,
        '',
        '你现在可以进入知识页进行编辑，但不会获得页面或知识库所有权。',
      ].join('\n'),
    });

    return createdGrant;
  }

  private normalizeCreateDto(
    dto: Record<string, unknown>,
  ): CreateKnowledgePageDto {
    return {
      spaceId: this.requireString(dto.spaceId, '知识空间不存在'),
      parentId: this.optionalString(dto.parentId),
      slug: this.optionalString(dto.slug),
      title: this.requireString(dto.title, '页面标题不能为空'),
      summary: this.optionalString(dto.summary),
      contentMd: this.optionalString(dto.contentMd) ?? '',
      contentRawJson:
        dto.contentRawJson && typeof dto.contentRawJson === 'object'
          ? dto.contentRawJson
          : undefined,
      tags: Array.isArray(dto.tags)
        ? dto.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      status: this.normalizePageStatus(dto.status),
    };
  }

  private normalizeUpdateDto(
    dto: Record<string, unknown>,
  ): UpdateKnowledgePageDto {
    return {
      parentId:
        dto.parentId === null ? null : this.optionalString(dto.parentId),
      title: this.optionalString(dto.title),
      summary: this.optionalString(dto.summary),
      contentMd: this.optionalString(dto.contentMd),
      contentRawJson:
        dto.contentRawJson && typeof dto.contentRawJson === 'object'
          ? dto.contentRawJson
          : undefined,
      tags: Array.isArray(dto.tags)
        ? dto.tags.filter((tag): tag is string => typeof tag === 'string')
        : undefined,
      status: this.normalizePageStatus(dto.status),
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

  private normalizePageStatus(value: unknown) {
    if (
      value === PageStatus.DRAFT ||
      value === PageStatus.PUBLISHED ||
      value === PageStatus.ARCHIVED
    ) {
      return value;
    }

    return undefined;
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        deletedAt: true,
        spaceId: true,
        title: true,
        parentId: true,
        authorId: true,
        editorId: true,
        deleteExpiresAt: true,
        editGrants: {
          select: {
            userId: true,
          },
        },
        space: {
          select: {
            visibility: true,
            ownerGroupId: true,
            parentSpaceId: true,
            deletedAt: true,
            ownerGroup: {
              select: {
                type: true,
              },
            },
            accessGroups: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
    });

    if (!page || page.deletedAt || page.space.deletedAt) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);
    this.ensurePageDeletable(page, currentUser);

    const now = new Date();
    const deleteExpiresAt = new Date(now.getTime() + KNOWLEDGE_DELETE_RETENTION_MS);

    return this.prisma.knowledgePage.update({
      where: { id },
      data: {
        deletedAt: now,
        deleteExpiresAt,
      },
      include: knowledgePageInclude,
    });
  }

  async findArchived() {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    return this.prisma.knowledgePage.findMany({
      where: {
        deletedAt: {
          not: null,
        },
        space: {
          deletedAt: null,
        },
      },
      include: knowledgePageInclude,
      orderBy: [{ deleteExpiresAt: 'asc' }, { deletedAt: 'desc' }],
    });
  }

  async restore(id: string) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      include: knowledgePageInclude,
    });

    if (!page) {
      throw new NotFoundException('知识库页面不存在');
    }

    if (!page.deletedAt) {
      throw new BadRequestException('当前知识库页面未处于删除保留期');
    }

    if (page.space.deletedAt) {
      throw new BadRequestException('当前页面所在知识库空间已删除，请先恢复知识库空间');
    }

    return this.prisma.knowledgePage.update({
      where: { id },
      data: {
        deletedAt: null,
        deleteExpiresAt: null,
      },
      include: knowledgePageInclude,
    });
  }

  async revokePermission(
    id: string,
    userId: string,
    currentUser: AuthenticatedUser,
  ) {
    await this.knowledgeSpaceService.runExpiredDeletionCleanup();
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id },
      select: {
        id: true,
        deletedAt: true,
        title: true,
        authorId: true,
        editorId: true,
        space: {
          select: {
            id: true,
            name: true,
            visibility: true,
            ownerGroupId: true,
            parentSpaceId: true,
            deletedAt: true,
            ownerGroup: {
              select: {
                type: true,
              },
            },
            accessGroups: {
              select: {
                groupId: true,
              },
            },
          },
        },
      },
    });

    if (!page || page.deletedAt || page.space.deletedAt) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);

    if (!(await this.canManagePagePermissions(page, currentUser))) {
      throw new ForbiddenException('当前账号无权管理该知识页面的编辑权限');
    }

    const existingGrant = await this.prisma.knowledgePageEditGrant.findUnique({
      where: {
        pageId_userId: {
          pageId: id,
          userId,
        },
      },
      include: knowledgePageEditGrantInclude,
    });

    if (!existingGrant) {
      throw new NotFoundException('该知识页面不存在可移除的编辑权限');
    }

    const deletedGrant = await this.prisma.knowledgePageEditGrant.delete({
      where: {
        pageId_userId: {
          pageId: id,
          userId,
        },
      },
      include: knowledgePageEditGrantInclude,
    });

    await this.internalMailService.sendNotification({
      senderId: currentUser.id,
      toUserIds: [deletedGrant.userId],
      subject: `知识页编辑权限已关闭：${page.title}`,
      bodyMarkdown: [
        '# 知识页编辑权限变更',
        '',
        `${currentUser.realName} 已关闭你对该知识页面的编辑权限。`,
        '',
        `- 知识库：${page.space.name}`,
        `- 页面：${page.title}`,
        '',
        '如需继续编辑，请重新发起审批申请或联系页面权限管理人。',
      ].join('\n'),
    });

    return deletedGrant;
  }

  private async findAccessibleSpaceOrThrow(
    spaceId: string,
    currentUser: AuthenticatedUser,
  ) {
    const space = await this.prisma.knowledgeSpace.findUnique({
      where: { id: spaceId },
      select: {
        id: true,
        visibility: true,
        ownerGroupId: true,
        parentSpaceId: true,
        deletedAt: true,
        ownerGroup: {
          select: {
            type: true,
          },
        },
        accessGroups: {
          select: {
            groupId: true,
          },
        },
      },
    });

    if (!space || space.deletedAt) {
      throw new NotFoundException('知识库空间不存在');
    }

    this.ensureSpaceAccessible(space, currentUser);

    return space;
  }

  private buildKnowledgeImageObjectKey(spaceId: string, extension: string) {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    return [
      KNOWLEDGE_IMAGE_OBJECT_PREFIX,
      spaceId,
      year,
      month,
      day,
      `${randomUUID()}.${extension}`,
    ].join('/');
  }

  private buildKnowledgeImageUrl(spaceId: string, objectKey: string) {
    const params = new URLSearchParams({
      spaceId,
      key: objectKey,
    });

    return `/api/knowledge/pages/assets?${params.toString()}`;
  }

  private ensureKnowledgeImageKey(spaceId: string, key: string) {
    const expectedPrefix = `${KNOWLEDGE_IMAGE_OBJECT_PREFIX}/${spaceId}/`;

    if (!key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('当前账号无权访问该图片资源');
    }
  }

  private async optimizeKnowledgeImage(file: UploadedKnowledgeImageFile) {
    if (!KNOWLEDGE_IMAGE_ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('仅支持上传 JPG、PNG、WebP 格式的图片');
    }

    const pipeline = sharp(file.buffer, {
      failOn: 'warning',
      animated: false,
    }).rotate();
    const metadata = await pipeline.metadata();
    const format = metadata.format?.toLowerCase();

    if (!metadata.width || !metadata.height || !format) {
      throw new BadRequestException('无法识别当前图片，请更换文件后重试');
    }

    if (metadata.pages && metadata.pages > 1) {
      throw new BadRequestException('暂不支持上传动图，请改用静态图片');
    }

    const transformed = pipeline.resize({
      width: KNOWLEDGE_IMAGE_MAX_DIMENSION,
      height: KNOWLEDGE_IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const prefersHighFidelity = metadata.hasAlpha || format === 'png';
    const optimizedBuffer = await transformed
      .webp({
        quality: prefersHighFidelity ? 90 : 84,
        nearLossless: prefersHighFidelity,
        smartSubsample: !prefersHighFidelity,
        effort: 5,
      })
      .toBuffer();
    const optimizedMetadata = await sharp(optimizedBuffer).metadata();

    if (
      (format === 'jpeg' || format === 'jpg' || format === 'webp') &&
      optimizedBuffer.length >= file.size * 0.95
    ) {
      return {
        buffer: file.buffer,
        contentType: file.mimetype,
        extension: format === 'jpeg' ? 'jpg' : format,
        width: metadata.width,
        height: metadata.height,
      };
    }

    return {
      buffer: optimizedBuffer,
      contentType: 'image/webp',
      extension: 'webp',
      width: optimizedMetadata.width ?? metadata.width,
      height: optimizedMetadata.height ?? metadata.height,
    };
  }

  private async ensureParentPageInSpace(
    parentId: string | null | undefined,
    spaceId: string,
  ) {
    if (!parentId) {
      return;
    }

    const parent = await this.prisma.knowledgePage.findUnique({
      where: { id: parentId },
      select: {
        spaceId: true,
        deletedAt: true,
      },
    });

    if (!parent || parent.deletedAt || parent.spaceId !== spaceId) {
      throw new BadRequestException('父级页面必须属于当前知识空间');
    }
  }

  private async resolveUniquePageSlug(spaceId: string, source: string) {
    const maxSlugLength = 80;
    const baseSlug = this.toInternalSlug(source, 'page');
    let slug = baseSlug;
    let index = 1;

    while (
      await this.prisma.knowledgePage.findUnique({
        where: {
          spaceId_slug: {
            spaceId,
            slug,
          },
        },
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

  private async ensureNoParentCycle(id: string, parentId: string | null) {
    if (!parentId) {
      return;
    }

    if (parentId === id) {
      throw new BadRequestException('页面不能将自己设为父级页面');
    }

    let cursor: string | null = parentId;

    while (cursor) {
      const ancestor: { id: string; parentId: string | null } | null =
        await this.prisma.knowledgePage.findUnique({
          where: { id: cursor },
          select: {
            id: true,
            parentId: true,
          },
        });

      if (!ancestor) {
        return;
      }

      if (ancestor.parentId === id) {
        throw new BadRequestException('页面目录不能形成循环层级');
      }

      cursor = ancestor.parentId;
    }
  }

  private buildAccessibleSpaceWhere(
    currentUser: AuthenticatedUser,
  ): Prisma.KnowledgeSpaceWhereInput {
    if (this.isAdmin(currentUser)) {
      return {};
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

    if (currentUser.roleCodes.includes(DIRECTION_ADMIN_ROLE_CODE)) {
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

  private mergeSpaceWhere(
    left: Prisma.KnowledgeSpaceWhereInput,
    right: Prisma.KnowledgeSpaceWhereInput,
  ): Prisma.KnowledgeSpaceWhereInput {
    return {
      AND: [left, right],
    };
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

    throw new ForbiddenException('当前账号无权访问该知识页面');
  }

  private ensurePageEditable(
    page: {
      authorId: string | null;
      editorId: string | null;
      editGrants?: Array<{
        userId: string;
      }>;
      space?: {
        ownerGroupId: string | null;
        ownerGroup?: {
          type: GroupType;
        } | null;
      };
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.canEditPage(page, currentUser)) {
      return;
    }

    throw new ForbiddenException('当前账号无权编辑该知识页面');
  }

  private ensurePageDeletable(
    page: {
      authorId: string | null;
      editorId: string | null;
      space?: {
        ownerGroupId: string | null;
        ownerGroup?: {
          type: GroupType;
        } | null;
      };
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.canDeletePage(page, currentUser)) {
      return;
    }

    throw new ForbiddenException('当前账号无权删除该知识页面');
  }

  private async buildEditPermissionContext(
    page: {
      id: string;
      authorId: string | null;
      editorId: string | null;
      space: {
        ownerGroupId: string | null;
        ownerGroup?: {
          type: GroupType;
        } | null;
      };
    },
    currentUser: AuthenticatedUser,
  ) {
    const [editGrant, canManagePermissions] = await Promise.all([
      this.prisma.knowledgePageEditGrant.findUnique({
        where: {
          pageId_userId: {
            pageId: page.id,
            userId: currentUser.id,
          },
        },
        select: {
          id: true,
        },
      }),
      this.canManagePagePermissions(page, currentUser),
    ]);
    const isPageOwner = this.isPageOwner(page, currentUser);
    const canManageOwnedGradeSpace = this.canManageOwnedGradeSpace(
      page.space,
      currentUser,
    );
    const canManageOwnedDirectionSpace = this.canManageOwnedDirectionSpace(
      page.space,
      currentUser,
    );
    const canEdit =
      this.isAdmin(currentUser) ||
      canManageOwnedGradeSpace ||
      canManageOwnedDirectionSpace ||
      isPageOwner ||
      Boolean(editGrant);
    const canDelete = this.canDeletePage(page, currentUser);

    if (canEdit) {
      return {
        canEdit: true,
        canDelete,
        canManagePermissions,
        pendingRequest: null,
        availableApprovalTargets: [],
      };
    }

    const [pendingRequest, availableApprovalTargets] = await Promise.all([
      this.prisma.knowledgePageAccessRequest.findFirst({
        where: {
          pageId: page.id,
          requesterId: currentUser.id,
          status: KnowledgePageAccessRequestStatus.PENDING,
        },
        select: {
          id: true,
          reviewerId: true,
          reviewerKind: true,
          status: true,
          reason: true,
          createdAt: true,
          reviewer: {
            select: {
              id: true,
              realName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.resolveApprovalTargets(page, currentUser.id),
    ]);

    return {
      canEdit: false,
      canDelete,
      canManagePermissions,
      pendingRequest,
      availableApprovalTargets,
    };
  }

  private async canManagePagePermissions(
    page: {
      authorId: string | null;
      editorId: string | null;
      space: {
        ownerGroupId: string | null;
        ownerGroup?: {
          type: GroupType;
        } | null;
      };
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.isAdmin(currentUser)) {
      return true;
    }

    if (this.canManageOwnedGradeSpace(page.space, currentUser)) {
      return true;
    }

    if (this.canManageOwnedDirectionSpace(page.space, currentUser)) {
      return true;
    }

    if (this.isPageOwner(page, currentUser)) {
      return true;
    }

    if (!page.space.ownerGroupId) {
      return false;
    }

    const membership = await this.prisma.userGroupMembership.findFirst({
      where: {
        groupId: page.space.ownerGroupId,
        userId: currentUser.id,
        membershipRole: MembershipRole.MANAGER,
      },
      select: {
        id: true,
      },
    });

    return Boolean(membership);
  }

  private async findGrantableUsers(
    space: {
      visibility: SpaceVisibility;
      ownerGroupId: string | null;
      parentSpaceId?: string | null;
      accessGroups?: Array<{
        groupId: string;
      }>;
    },
    excludedUserIds: string[],
    query?: string,
  ) {
    return this.prisma.user.findMany({
      where: {
        ...this.buildGrantableUserWhere(space),
        ...(excludedUserIds.length > 0
          ? {
              id: {
                notIn: excludedUserIds,
              },
            }
          : {}),
        ...(query
          ? {
              OR: [
                {
                  realName: {
                    contains: query,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  email: {
                    contains: query,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  username: {
                    contains: query,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              ],
            }
          : {}),
      },
      select: knowledgePermissionUserSelect,
      orderBy: [{ realName: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });
  }

  private async findGrantableUserById(
    space: {
      visibility: SpaceVisibility;
      ownerGroupId: string | null;
      parentSpaceId?: string | null;
      accessGroups?: Array<{
        groupId: string;
      }>;
    },
    userId: string,
  ) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        ...this.buildGrantableUserWhere(space),
      },
      select: knowledgePermissionUserSelect,
    });
  }

  private buildGrantableUserWhere(space: {
    visibility: SpaceVisibility;
    ownerGroupId: string | null;
    parentSpaceId?: string | null;
    accessGroups?: Array<{
      groupId: string;
    }>;
  }): Prisma.UserWhereInput {
    const adminWhere: Prisma.UserWhereInput = {
      roles: {
        some: {
          role: {
            code: {
              in: [...KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES],
            },
          },
        },
      },
    };

    if (space.visibility === SpaceVisibility.PUBLIC) {
      return {
        archivedAt: null,
        status: UserStatus.ACTIVE,
      };
    }

    if (
      space.visibility === SpaceVisibility.GROUP_RESTRICTED &&
      space.ownerGroupId
    ) {
      const accessGroupIds =
        space.parentSpaceId && space.accessGroups
          ? space.accessGroups.map((group) => group.groupId)
          : [];

      return {
        archivedAt: null,
        status: UserStatus.ACTIVE,
        OR: [
          {
            AND: [
              {
                memberships: {
                  some: {
                    groupId: space.ownerGroupId,
                  },
                },
              },
              ...(accessGroupIds.length > 0
                ? [
                    {
                      memberships: {
                        some: {
                          groupId: {
                            in: accessGroupIds,
                          },
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
          adminWhere,
        ],
      };
    }

    return {
      archivedAt: null,
      status: UserStatus.ACTIVE,
      ...adminWhere,
    };
  }

  private async resolveApprovalTargets(
    page: {
      authorId: string | null;
      editorId: string | null;
      space: {
        ownerGroupId: string | null;
        ownerGroup?: {
          type: GroupType;
        } | null;
      };
    },
    excludeUserId: string,
  ) {
    const targets = new Map<
      string,
      {
        reviewerId: string;
        reviewerName: string;
        reviewerEmail: string;
        reviewerKind: KnowledgePageAccessApproverKind;
      }
    >();
    const pageOwnerIds = Array.from(
      new Set(
        this.getPageOwnerIds(page).filter((userId) => userId !== excludeUserId),
      ),
    );

    if (pageOwnerIds.length > 0) {
      const pageOwners = await this.prisma.user.findMany({
        where: {
          id: {
            in: pageOwnerIds,
          },
          archivedAt: null,
          status: UserStatus.ACTIVE,
        },
        select: {
          id: true,
          realName: true,
          email: true,
        },
      });

      for (const owner of pageOwners) {
        targets.set(owner.id, {
          reviewerId: owner.id,
          reviewerName: owner.realName,
          reviewerEmail: owner.email,
          reviewerKind: KnowledgePageAccessApproverKind.PAGE_OWNER,
        });
      }
    }

    if (page.space.ownerGroupId) {
      const spaceOwners = await this.prisma.userGroupMembership.findMany({
        where: {
          groupId: page.space.ownerGroupId,
          membershipRole: MembershipRole.MANAGER,
          userId: {
            not: excludeUserId,
          },
          user: {
            archivedAt: null,
            status: UserStatus.ACTIVE,
          },
        },
        select: {
          user: {
            select: {
              id: true,
              realName: true,
              email: true,
            },
          },
        },
      });

      for (const membership of spaceOwners) {
        if (targets.has(membership.user.id)) {
          continue;
        }

        targets.set(membership.user.id, {
          reviewerId: membership.user.id,
          reviewerName: membership.user.realName,
          reviewerEmail: membership.user.email,
          reviewerKind: KnowledgePageAccessApproverKind.SPACE_OWNER,
        });
      }

      if (page.space.ownerGroup?.type === GroupType.GRADE) {
        const gradeAdmins = await this.prisma.user.findMany({
          where: {
            id: {
              not: excludeUserId,
            },
            archivedAt: null,
            status: UserStatus.ACTIVE,
            roles: {
              some: {
                role: {
                  code: GRADE_ADMIN_ROLE_CODE,
                },
              },
            },
            memberships: {
              some: {
                groupId: page.space.ownerGroupId,
              },
            },
          },
          select: {
            id: true,
            realName: true,
            email: true,
          },
        });

        for (const admin of gradeAdmins) {
          if (targets.has(admin.id)) {
            continue;
          }

          targets.set(admin.id, {
            reviewerId: admin.id,
            reviewerName: admin.realName,
            reviewerEmail: admin.email,
            reviewerKind: KnowledgePageAccessApproverKind.SPACE_OWNER,
          });
        }
      }

      if (page.space.ownerGroup?.type === GroupType.DIRECTION) {
        const directionAdmins = await this.prisma.user.findMany({
          where: {
            id: {
              not: excludeUserId,
            },
            archivedAt: null,
            status: UserStatus.ACTIVE,
            roles: {
              some: {
                role: {
                  code: DIRECTION_ADMIN_ROLE_CODE,
                },
              },
            },
            memberships: {
              some: {
                groupId: page.space.ownerGroupId,
              },
            },
          },
          select: {
            id: true,
            realName: true,
            email: true,
          },
        });

        for (const admin of directionAdmins) {
          if (targets.has(admin.id)) {
            continue;
          }

          targets.set(admin.id, {
            reviewerId: admin.id,
            reviewerName: admin.realName,
            reviewerEmail: admin.email,
            reviewerKind: KnowledgePageAccessApproverKind.SPACE_OWNER,
          });
        }
      }
    }

    const labAdmins = await this.prisma.user.findMany({
      where: {
        id: {
          not: excludeUserId,
        },
        archivedAt: null,
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            role: {
              code: {
                in: ['LAB_ADMIN', 'SUPER_ADMIN'],
              },
            },
          },
        },
      },
      select: {
        id: true,
        realName: true,
        email: true,
      },
    });

    for (const admin of labAdmins) {
      if (targets.has(admin.id)) {
        continue;
      }

      targets.set(admin.id, {
        reviewerId: admin.id,
        reviewerName: admin.realName,
        reviewerEmail: admin.email,
        reviewerKind: KnowledgePageAccessApproverKind.LAB_ADMIN,
      });
    }

    return Array.from(targets.values());
  }

  private canEditPage(
    page: {
      authorId: string | null;
      editorId: string | null;
      editGrants?: Array<{
        userId: string;
      }>;
      space?: {
        ownerGroupId: string | null;
        ownerGroup?: {
          type: GroupType;
        } | null;
      };
    },
    currentUser: AuthenticatedUser,
  ) {
    if (this.isAdmin(currentUser)) {
      return true;
    }

    if (page.space && this.canManageOwnedGradeSpace(page.space, currentUser)) {
      return true;
    }

    if (
      page.space &&
      this.canManageOwnedDirectionSpace(page.space, currentUser)
    ) {
      return true;
    }

    if (this.isPageOwner(page, currentUser)) {
      return true;
    }

    return (
      page.editGrants?.some((grant) => grant.userId === currentUser.id) ?? false
    );
  }

  private isAdmin(currentUser: AuthenticatedUser) {
    return currentUser.roleCodes.some((role) =>
      KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES.includes(
        role as (typeof KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES)[number],
      ),
    );
  }

  private isPageOwner(
    page: {
      authorId: string | null;
      editorId: string | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    return this.getPageOwnerIds(page).includes(currentUser.id);
  }

  private canDeletePage(
    page: {
      authorId: string | null;
      editorId: string | null;
    },
    currentUser: AuthenticatedUser,
  ) {
    return this.isPageOwner(page, currentUser);
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
      currentUser.roleCodes.includes(DIRECTION_ADMIN_ROLE_CODE) &&
      ownerGroupId !== null &&
      currentUser.groupIds.includes(ownerGroupId) &&
      space.ownerGroup?.type === GroupType.DIRECTION
    );
  }

  private getPageOwnerIds(page: {
    authorId: string | null;
    editorId: string | null;
  }) {
    if (page.authorId) {
      return [page.authorId];
    }

    return page.editorId ? [page.editorId] : [];
  }
}
