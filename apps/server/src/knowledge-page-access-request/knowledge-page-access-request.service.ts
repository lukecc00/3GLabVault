import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupType,
  KnowledgePageAccessApproverKind,
  KnowledgePageAccessRequestStatus,
  MembershipRole,
  Prisma,
  SpaceVisibility,
  UserStatus,
} from '../generated/prisma';
import {
  DIRECTION_ADMIN_ROLE_CODE,
  GRADE_ADMIN_ROLE_CODE,
} from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ExternalMailReminderService } from '../internal-mail/external-mail-reminder.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgePageAccessRequestDto } from './dto/create-knowledge-page-access-request.dto';
import {
  FindKnowledgePageAccessRequestsDto,
  KnowledgeApprovalSection,
} from './dto/find-knowledge-page-access-requests.dto';
import { ReviewKnowledgePageAccessRequestDto } from './dto/review-knowledge-page-access-request.dto';

const knowledgePageAccessRequestInclude = {
  page: {
    select: {
      id: true,
      title: true,
      spaceId: true,
      space: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  requester: {
    select: {
      id: true,
      realName: true,
      email: true,
    },
  },
  reviewer: {
    select: {
      id: true,
      realName: true,
      email: true,
    },
  },
} satisfies Prisma.KnowledgePageAccessRequestInclude;

const knowledgePageAccessPageSelect = {
  id: true,
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
  },
} satisfies Prisma.KnowledgePageSelect;

type KnowledgePageAccessPage = Prisma.KnowledgePageGetPayload<{
  select: typeof knowledgePageAccessPageSelect;
}>;

type ApprovalTarget = {
  reviewerId: string;
  reviewerKind: KnowledgePageAccessApproverKind;
};

type AccessRequestListItem = Prisma.KnowledgePageAccessRequestGetPayload<{
  include: typeof knowledgePageAccessRequestInclude;
}>;

type DashboardQuery = {
  section: KnowledgeApprovalSection;
  q?: string;
  status?: KnowledgePageAccessRequestStatus;
  reviewerKind?: KnowledgePageAccessApproverKind;
  page: number;
  pageSize: number;
};

const KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES = ['SUPER_ADMIN', 'LAB_ADMIN'] as const;

@Injectable()
export class KnowledgePageAccessRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly externalMailReminderService: ExternalMailReminderService,
  ) {}

  async findDashboard(
    rawQuery: FindKnowledgePageAccessRequestsDto,
    currentUser: AuthenticatedUser,
  ) {
    const query = this.normalizeDashboardQuery(rawQuery);
    const [summary, total] = await Promise.all([
      this.countDashboardSummary(currentUser),
      this.prisma.knowledgePageAccessRequest.count({
        where: this.buildDashboardWhere(query, currentUser),
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);
    const items = await this.prisma.knowledgePageAccessRequest.findMany({
      where: this.buildDashboardWhere(query, currentUser),
      include: knowledgePageAccessRequestInclude,
      orderBy: this.buildDashboardOrderBy(query.section),
      skip: (page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const itemsWithGrantState = await this.attachGrantState(items);

    return {
      summary,
      section: query.section,
      filters: {
        q: query.q ?? null,
        status: query.status ?? null,
        reviewerKind: query.reviewerKind ?? null,
        page,
        pageSize: query.pageSize,
      },
      records: {
        items: itemsWithGrantState,
        total,
        page,
        pageSize: query.pageSize,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    };
  }

  async create(
    rawDto: Record<string, unknown>,
    currentUser: AuthenticatedUser,
  ) {
    const dto = this.normalizeCreateDto(rawDto);
    const page = await this.prisma.knowledgePage.findUnique({
      where: { id: dto.pageId },
      select: knowledgePageAccessPageSelect,
    });

    if (!page) {
      throw new NotFoundException('知识库页面不存在');
    }

    this.ensureSpaceAccessible(page.space, currentUser);

    if (this.canEditPage(page, currentUser)) {
      throw new BadRequestException('当前账号已具备该知识页面的编辑权限');
    }

    const existingPendingRequest =
      await this.prisma.knowledgePageAccessRequest.findFirst({
        where: {
          pageId: dto.pageId,
          requesterId: currentUser.id,
          status: KnowledgePageAccessRequestStatus.PENDING,
        },
        select: {
          id: true,
        },
      });

    if (existingPendingRequest) {
      throw new BadRequestException(
        '当前知识页面已存在待处理的编辑权限申请，请等待权限审批结果',
      );
    }

    const approvalTargets = await this.resolveApprovalTargets(
      page,
      currentUser.id,
    );
    const selectedTarget = approvalTargets.find(
      (target) =>
        target.reviewerId === dto.reviewerId &&
        target.reviewerKind === dto.reviewerKind,
    );

    if (!selectedTarget) {
      throw new BadRequestException('所选审批人不在当前页面允许的审批范围内');
    }

    const createdRequest = await this.prisma.knowledgePageAccessRequest.create({
      data: {
        pageId: dto.pageId,
        requesterId: currentUser.id,
        reviewerId: dto.reviewerId,
        reviewerKind: dto.reviewerKind,
        reason: dto.reason,
      },
      include: knowledgePageAccessRequestInclude,
    });

    await this.externalMailReminderService.notifyKnowledgeApprovalPendingRecipients(
      {
        recipientUserIds: [createdRequest.reviewerId],
        senderUserId: currentUser.id,
        spaceName: createdRequest.page.space.name,
        pageTitle: createdRequest.page.title,
      },
    );

    return createdRequest;
  }

  async review(
    id: string,
    rawDto: Record<string, unknown>,
    currentUser: AuthenticatedUser,
  ) {
    const dto = this.normalizeReviewDto(rawDto);
    const request = await this.prisma.knowledgePageAccessRequest.findUnique({
      where: { id },
      include: {
        ...knowledgePageAccessRequestInclude,
        page: {
          select: knowledgePageAccessPageSelect,
        },
      },
    });

    if (!request) {
      throw new NotFoundException('审批记录不存在');
    }

    if (request.status !== KnowledgePageAccessRequestStatus.PENDING) {
      throw new BadRequestException('该审批已处理，不能重复操作');
    }

    if (request.reviewerId !== currentUser.id) {
      throw new ForbiddenException('当前账号无权处理该审批');
    }

    const reviewedAt = new Date();

    if (dto.action === 'APPROVE') {
      const [, updatedRequest] = await this.prisma.$transaction([
        this.prisma.knowledgePageEditGrant.upsert({
          where: {
            pageId_userId: {
              pageId: request.pageId,
              userId: request.requesterId,
            },
          },
          update: {
            grantedById: currentUser.id,
          },
          create: {
            pageId: request.pageId,
            userId: request.requesterId,
            grantedById: currentUser.id,
          },
        }),
        this.prisma.knowledgePageAccessRequest.update({
          where: { id: request.id },
          data: {
            status: KnowledgePageAccessRequestStatus.APPROVED,
            reviewComment: dto.comment,
            reviewedAt,
          },
          include: knowledgePageAccessRequestInclude,
        }),
      ]);

      await this.externalMailReminderService.notifyKnowledgeApprovalReviewedRecipients(
        {
          recipientUserIds: [updatedRequest.requesterId],
          senderUserId: currentUser.id,
          spaceName: updatedRequest.page.space.name,
          pageTitle: updatedRequest.page.title,
          action: 'APPROVE',
        },
      );

      return updatedRequest;
    }

    const rejectedRequest = await this.prisma.knowledgePageAccessRequest.update(
      {
        where: { id: request.id },
        data: {
          status: KnowledgePageAccessRequestStatus.REJECTED,
          reviewComment: dto.comment,
          reviewedAt,
        },
        include: knowledgePageAccessRequestInclude,
      },
    );

    await this.externalMailReminderService.notifyKnowledgeApprovalReviewedRecipients(
      {
        recipientUserIds: [rejectedRequest.requesterId],
        senderUserId: currentUser.id,
        spaceName: rejectedRequest.page.space.name,
        pageTitle: rejectedRequest.page.title,
        action: 'REJECT',
      },
    );

    return rejectedRequest;
  }

  private normalizeCreateDto(
    dto: Record<string, unknown>,
  ): CreateKnowledgePageAccessRequestDto {
    return {
      pageId: this.requireString(dto.pageId, '知识库页面不存在'),
      reviewerId: this.requireString(dto.reviewerId, '审批人不能为空'),
      reviewerKind: this.normalizeApproverKind(dto.reviewerKind),
      reason: this.optionalString(dto.reason),
    };
  }

  private normalizeReviewDto(
    dto: Record<string, unknown>,
  ): ReviewKnowledgePageAccessRequestDto {
    return {
      action: this.normalizeReviewAction(dto.action),
      comment: this.optionalString(dto.comment),
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

  private normalizeApproverKind(value: unknown) {
    if (
      value === KnowledgePageAccessApproverKind.PAGE_OWNER ||
      value === KnowledgePageAccessApproverKind.SPACE_OWNER ||
      value === KnowledgePageAccessApproverKind.LAB_ADMIN
    ) {
      return value;
    }

    throw new BadRequestException('审批类型不合法');
  }

  private normalizeReviewAction(value: unknown) {
    if (value === 'APPROVE' || value === 'REJECT') {
      return value;
    }

    throw new BadRequestException('审批动作不合法');
  }

  private normalizeDashboardQuery(
    query: FindKnowledgePageAccessRequestsDto,
  ): DashboardQuery {
    return {
      section: query.section ?? 'pendingReviews',
      q: this.optionalString(query.q),
      status: query.status,
      reviewerKind: query.reviewerKind,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  private async resolveApprovalTargets(
    page: KnowledgePageAccessPage,
    excludeUserId: string,
  ) {
    const targets = new Map<string, ApprovalTarget>();
    const pageOwnerIds = Array.from(
      new Set(
        (page.authorId ? [page.authorId] : page.editorId ? [page.editorId] : []).filter(
          (userId) => userId !== excludeUserId,
        ),
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
        },
      });

      for (const owner of pageOwners) {
        targets.set(owner.id, {
          reviewerId: owner.id,
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
          reviewerKind: KnowledgePageAccessApproverKind.SPACE_OWNER,
        });
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
          },
        });

        for (const admin of directionAdmins) {
          if (targets.has(admin.id)) {
            continue;
          }

          targets.set(admin.id, {
            reviewerId: admin.id,
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
      },
    });

    for (const admin of labAdmins) {
      if (targets.has(admin.id)) {
        continue;
      }

      targets.set(admin.id, {
        reviewerId: admin.id,
        reviewerKind: KnowledgePageAccessApproverKind.LAB_ADMIN,
      });
    }

    return Array.from(targets.values());
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

  private canEditPage(
    page: {
      authorId: string | null;
      editorId: string | null;
      editGrants: Array<{
        userId: string;
      }>;
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

    if (page.authorId === currentUser.id || (!page.authorId && page.editorId === currentUser.id)) {
      return true;
    }

    return page.editGrants.some((grant) => grant.userId === currentUser.id);
  }

  private isAdmin(currentUser: AuthenticatedUser) {
    return currentUser.roleCodes.some((role) =>
      KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES.includes(
        role as (typeof KNOWLEDGE_GLOBAL_ADMIN_ROLE_CODES)[number],
      ),
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
      currentUser.roleCodes.includes(DIRECTION_ADMIN_ROLE_CODE) &&
      ownerGroupId !== null &&
      currentUser.groupIds.includes(ownerGroupId) &&
      space.ownerGroup?.type === GroupType.DIRECTION
    );
  }

  private async countDashboardSummary(currentUser: AuthenticatedUser) {
    const [pendingReviews, submitted, reviewedByMe] = await Promise.all([
      this.prisma.knowledgePageAccessRequest.count({
        where: {
          reviewerId: currentUser.id,
          status: KnowledgePageAccessRequestStatus.PENDING,
        },
      }),
      this.prisma.knowledgePageAccessRequest.count({
        where: {
          requesterId: currentUser.id,
        },
      }),
      this.prisma.knowledgePageAccessRequest.count({
        where: {
          reviewerId: currentUser.id,
          status: {
            not: KnowledgePageAccessRequestStatus.PENDING,
          },
        },
      }),
    ]);

    return {
      pendingReviews,
      submitted,
      reviewedByMe,
    };
  }

  private buildDashboardWhere(
    query: DashboardQuery,
    currentUser: AuthenticatedUser,
  ): Prisma.KnowledgePageAccessRequestWhereInput {
    const where: Prisma.KnowledgePageAccessRequestWhereInput = {};

    if (query.section === 'pendingReviews') {
      where.reviewerId = currentUser.id;
      where.status = KnowledgePageAccessRequestStatus.PENDING;
    } else if (query.section === 'submitted') {
      where.requesterId = currentUser.id;
      if (query.status) {
        where.status = query.status;
      }
    } else {
      where.reviewerId = currentUser.id;
      where.status =
        query.status ?? {
          not: KnowledgePageAccessRequestStatus.PENDING,
        };
    }

    if (query.reviewerKind) {
      where.reviewerKind = query.reviewerKind;
    }

    if (query.q) {
      const contains = {
        contains: query.q,
        mode: Prisma.QueryMode.insensitive,
      } as const;

      where.AND = [
        {
          OR: [
            {
              page: {
                title: contains,
              },
            },
            {
              page: {
                space: {
                  name: contains,
                },
              },
            },
            {
              requester: {
                realName: contains,
              },
            },
            {
              requester: {
                email: contains,
              },
            },
            {
              reviewer: {
                realName: contains,
              },
            },
            {
              reviewer: {
                email: contains,
              },
            },
            {
              reason: contains,
            },
            {
              reviewComment: contains,
            },
          ],
        },
      ];
    }

    return where;
  }

  private buildDashboardOrderBy(
    section: KnowledgeApprovalSection,
  ): Prisma.KnowledgePageAccessRequestOrderByWithRelationInput[] {
    if (section === 'pendingReviews') {
      return [{ createdAt: 'desc' }];
    }

    if (section === 'reviewedByMe') {
      return [{ reviewedAt: 'desc' }, { updatedAt: 'desc' }];
    }

    return [{ updatedAt: 'desc' }, { createdAt: 'desc' }];
  }

  private async attachGrantState(
    requests: AccessRequestListItem[],
  ) {
    const approvedPairs = requests
      .filter(
        (request) =>
          request.status === KnowledgePageAccessRequestStatus.APPROVED,
      )
      .map((request) => ({
        pageId: request.pageId,
        userId: request.requesterId,
      }));

    if (approvedPairs.length === 0) {
      return requests.map((request) => ({
        ...request,
        grantActive: false,
      }));
    }

    const grants = await this.prisma.knowledgePageEditGrant.findMany({
      where: {
        OR: approvedPairs,
      },
      select: {
        pageId: true,
        userId: true,
      },
    });
    const grantKeySet = new Set(
      grants.map((grant) => `${grant.pageId}:${grant.userId}`),
    );

    return requests.map((request) => ({
      ...request,
      grantActive:
        request.status === KnowledgePageAccessRequestStatus.APPROVED &&
        grantKeySet.has(`${request.pageId}:${request.requesterId}`),
    }));
  }
}
