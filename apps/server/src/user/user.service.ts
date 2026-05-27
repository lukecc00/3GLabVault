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
  MailboxProvisioningStatus,
  MembershipRole,
  Prisma,
  UserStatus,
} from '../generated/prisma';
import { generateTemporaryPassword, hashPassword } from '../auth/password.util';
import {
  ADMIN_ROLE_CODES,
  GLOBAL_ADMIN_ROLE_CODES,
  GRADE_ADMIN_ROLE_CODE,
} from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GroupService } from '../group/group.service';
import { MailcowService } from '../mailcow/mailcow.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../security/audit-log.service';
import { BatchGenerateUsersDto } from './dto/batch-generate-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { FindUsersDirectoryDto } from './dto/find-users-directory.dto';
import { RegisterOptionsDto } from './dto/register-options.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import {
  RestoreArchivedContentDto,
  RestoreArchivedContentTarget,
} from './dto/restore-archived-content.dto';
import { ReviewUserDto } from './dto/review-user.dto';
import { UpdateUserGroupAssignmentsDto } from './dto/update-user-group-assignments.dto';
import { UpdateUserRoleAssignmentsDto } from './dto/update-user-role-assignments.dto';
import {
  createMailboxAddress,
  createUsernameBase,
  createUsernameBaseFromPinyin,
} from './user-account.util';

const userDetailSelect = {
  id: true,
  username: true,
  email: true,
  notificationEmail: true,
  realName: true,
  studentId: true,
  avatarUrl: true,
  bio: true,
  emailReminderEnabled: true,
  lastExternalMailReminderAt: true,
  keycloakUserId: true,
  mustChangePassword: true,
  mailboxProvisioningStatus: true,
  mailboxProvisionedAt: true,
  mailboxLastError: true,
  status: true,
  archivedAt: true,
  archiveExpiresAt: true,
  contentRestoredAt: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    include: {
      group: true,
    },
  },
  roles: {
    include: {
      role: true,
    },
  },
} satisfies Prisma.UserSelect;

type UserDetail = Prisma.UserGetPayload<{
  select: typeof userDetailSelect;
}>;

type ArchivedKnowledgeMembership = {
  groupId: string;
  membershipRole: MembershipRole;
  group: {
    id: string;
    type: GroupType;
    code?: string;
    name?: string;
  };
};

type ArchivedMailSourceSnapshot = {
  userId: string;
  realName: string;
  email?: string | null;
  restoredAt: Date;
};

const USER_ARCHIVE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const USER_ARCHIVE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const USER_DIRECTORY_DEFAULT_PAGE_SIZE = 25;
const USER_DIRECTORY_MAX_PAGE_SIZE = 100;
const PROTECTED_SYSTEM_ADMIN_USERNAME = 'xiyou3g';
const SYSTEM_ADMIN_ROLE_CODE = 'SUPER_ADMIN';
const GRADE_ADMIN_ASSIGNABLE_ROLE_CODES = ['MEMBER', GRADE_ADMIN_ROLE_CODE];

@Injectable()
export class UserService implements OnModuleInit, OnModuleDestroy {
  private purgeTimer: NodeJS.Timeout | null = null;
  private purgeRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupService: GroupService,
    private readonly mailcowService: MailcowService,
    private readonly auditLogService: AuditLogService,
  ) {}

  onModuleInit() {
    void this.runExpiredArchiveCleanup();
    this.purgeTimer = setInterval(() => {
      void this.runExpiredArchiveCleanup();
    }, USER_ARCHIVE_CLEANUP_INTERVAL_MS);
    this.purgeTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
  }

  async findAll(currentUser?: AuthenticatedUser) {
    await this.runExpiredArchiveCleanup();
    const managementScope = await this.buildManageableUserWhere(currentUser);

    return this.prisma.user.findMany({
      where: {
        archivedAt: null,
        ...managementScope,
      },
      select: userDetailSelect,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findDirectory(
    query: FindUsersDirectoryDto,
    currentUser?: AuthenticatedUser,
  ) {
    await this.runExpiredArchiveCleanup();

    const pageSize = Math.min(
      Math.max(query.pageSize ?? USER_DIRECTORY_DEFAULT_PAGE_SIZE, 1),
      USER_DIRECTORY_MAX_PAGE_SIZE,
    );
    const requestedPage = Math.max(query.page ?? 1, 1);
    const keyword = query.q?.trim();
    const groupId = query.groupId?.trim();
    const managementScope = await this.buildManageableUserWhere(
      currentUser,
      groupId,
    );

    const where: Prisma.UserWhereInput = {
      archivedAt: null,
      ...managementScope,
      ...(groupId
        ? {
            memberships: {
              some: {
                groupId,
              },
            },
          }
        : {}),
      ...(keyword
        ? {
            OR: [
              {
                realName: {
                  contains: keyword,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: keyword,
                  mode: 'insensitive',
                },
              },
              {
                username: {
                  contains: keyword,
                  mode: 'insensitive',
                },
              },
              {
                notificationEmail: {
                  contains: keyword,
                  mode: 'insensitive',
                },
              },
              {
                studentId: {
                  contains: keyword,
                  mode: 'insensitive',
                },
              },
              {
                roles: {
                  some: {
                    role: {
                      name: {
                        contains: keyword,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
              {
                memberships: {
                  some: {
                    group: {
                      name: {
                        contains: keyword,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const total = await this.prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const items = await this.prisma.user.findMany({
      where,
      select: userDetailSelect,
      orderBy: [{ createdAt: 'asc' }, { realName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    };
  }

  async findArchived(currentUser?: AuthenticatedUser) {
    await this.runExpiredArchiveCleanup();
    const managementScope = await this.buildManageableUserWhere(currentUser);

    return this.prisma.user.findMany({
      where: {
        archivedAt: {
          not: null,
        },
        ...managementScope,
      },
      select: userDetailSelect,
      orderBy: [{ archiveExpiresAt: 'asc' }, { archivedAt: 'desc' }],
    });
  }

  async findOne(id: string, currentUser?: AuthenticatedUser) {
    await this.runExpiredArchiveCleanup();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userDetailSelect,
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    await this.ensureUserManageable(id, currentUser);

    return user;
  }

  async getRegisterOptions(): Promise<RegisterOptionsDto> {
    const groups = await this.getRegisterSelectableGroups();

    return {
      groups,
      mailDomain: this.getMailDomain(),
    };
  }

  async checkRegisterPrefix(namePinyin: string) {
    const prefix = createUsernameBaseFromPinyin(namePinyin);
    const available = await this.isUsernamePrefixAvailable(prefix);

    return {
      prefix,
      email: createMailboxAddress(prefix, this.getMailDomain()),
      available,
      message: available
        ? '当前邮箱前缀可用'
        : '该邮箱前缀已被占用，请增加字符后重试',
    };
  }

  async register(dto: CreateUserDto) {
    const groupIds = await this.ensureAssignableGroupIds(dto.groupIds);
    const usernamePrefix = createUsernameBaseFromPinyin(dto.namePinyin);
    await this.ensureUsernamePrefixAvailable(usernamePrefix);
    const createdUser = await this.createUserRecord({
      realName: dto.realName,
      usernamePrefix,
      password: dto.password,
      notificationEmail: dto.notificationEmail,
      avatarUrl: dto.avatarUrl,
      bio: dto.bio,
      groupIds,
      status: UserStatus.PENDING,
      mustChangePassword: false,
      reserve: new Set(),
    });

    try {
      if (this.mailcowService.isEnabled()) {
        await this.mailcowService.createMailbox({
          username: createdUser.username ?? createdUser.email,
          password: dto.password,
          name: createdUser.realName,
          active: false,
          forcePasswordUpdate: false,
        });
      }

      await this.markMailboxProvisioning(createdUser.id, {
        status: this.mailcowService.isEnabled()
          ? MailboxProvisioningStatus.PROVISIONED
          : MailboxProvisioningStatus.PENDING,
        error: null,
      });
    } catch (error) {
      await this.prisma.user.delete({
        where: { id: createdUser.id },
      });
      throw error;
    }

    return this.findOne(createdUser.id);
  }

  async batchGenerate(
    dto: BatchGenerateUsersDto,
    currentUser?: AuthenticatedUser,
  ) {
    const groupIds = await this.ensureAssignableGroupIds(
      dto.groupIds,
      currentUser,
    );
    const temporaryPassword = dto.password.trim();

    if (temporaryPassword.length < 8) {
      throw new BadRequestException('统一初始密码至少需要 8 位');
    }

    if (groupIds.length === 0) {
      throw new BadRequestException('请至少绑定一个群组');
    }
    const reservedUsernames = new Set<string>();
    const createdUsers: Array<{
      temporaryPassword: string;
      user: UserDetail;
    }> = [];
    const failedUsers: Array<{
      realName: string;
      notificationEmail?: string;
      reason: string;
    }> = [];

    for (const entry of dto.users) {
      try {
        const createdUser = await this.createUserRecord({
          realName: entry.realName,
          password: temporaryPassword,
          notificationEmail: entry.notificationEmail,
          groupIds,
          status: UserStatus.ACTIVE,
          mustChangePassword: true,
          reserve: reservedUsernames,
        });

        try {
          if (this.mailcowService.isEnabled()) {
            await this.mailcowService.createMailbox({
              username: createdUser.username ?? createdUser.email,
              password: temporaryPassword,
              name: createdUser.realName,
              active: true,
              forcePasswordUpdate: true,
            });
          }

          await this.markMailboxProvisioning(createdUser.id, {
            status: this.mailcowService.isEnabled()
              ? MailboxProvisioningStatus.PROVISIONED
              : MailboxProvisioningStatus.PENDING,
            error: null,
          });

          createdUsers.push({
            temporaryPassword,
            user: await this.findOne(createdUser.id, currentUser),
          });
        } catch (error) {
          await this.prisma.user.delete({
            where: { id: createdUser.id },
          });
          throw error;
        }
      } catch (error) {
        failedUsers.push({
          realName: entry.realName,
          notificationEmail:
            entry.notificationEmail?.trim().toLowerCase() || undefined,
          reason: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    await this.auditLogService.record({
      actorId: currentUser?.id,
      action: 'USER_BATCH_GENERATE',
      targetType: 'USER_BATCH',
      summary: '批量生成账号',
      metadata: {
        requestedCount: dto.users.length,
        createdCount: createdUsers.length,
        failedCount: failedUsers.length,
        groupIds,
      },
    });

    return {
      createdUsers,
      failedUsers,
    };
  }

  async review(
    id: string,
    dto: ReviewUserDto,
    currentUser?: AuthenticatedUser,
  ) {
    await this.ensureUserManageable(id, currentUser);
    const existingUser = await this.getUserAuthMaterial(id);
    const normalizedRoleIds = dto.roleIds
      ? this.normalizeIds(dto.roleIds)
      : undefined;
    const normalizedGroupIds = dto.groupIds
      ? await this.ensureAssignableGroupIds(dto.groupIds, currentUser)
      : undefined;

    if (dto.status === UserStatus.PENDING) {
      throw new BadRequestException('审核状态不能回退为待审核');
    }

    if (normalizedRoleIds) {
      await this.ensureRolesExist(normalizedRoleIds);
      await this.ensureManageableRoleIds(normalizedRoleIds, currentUser);
      await this.ensureProtectedSystemAdminRoleRetained(id, normalizedRoleIds);
    }

    if (existingUser.archivedAt) {
      throw new BadRequestException(
        '该账号已归档，请前往“归档用户”页面管理，不能在正常用户页审核启用',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          status: dto.status,
          notificationEmail: dto.notificationEmail?.trim().toLowerCase(),
          ...(dto.notificationEmail
            ? {
                emailReminderEnabled: true,
              }
            : {}),
        },
      });

      if (normalizedRoleIds) {
        await tx.userRole.deleteMany({
          where: { userId: id },
        });

        if (normalizedRoleIds.length > 0) {
          await tx.userRole.createMany({
            data: normalizedRoleIds.map((roleId) => ({
              userId: id,
              roleId,
            })),
          });
        }
      }

      if (normalizedGroupIds) {
        await tx.userGroupMembership.deleteMany({
          where: { userId: id },
        });

        if (normalizedGroupIds.length > 0) {
          await tx.userGroupMembership.createMany({
            data: normalizedGroupIds.map((groupId) => ({
              userId: id,
              groupId,
              membershipRole: MembershipRole.MEMBER,
            })),
          });
        }
      }
    });

    if (this.mailcowService.isEnabled()) {
      if (
        dto.status === UserStatus.ACTIVE &&
        existingUser.status !== UserStatus.ACTIVE
      ) {
        await this.syncMailboxActivation(existingUser, true);
      }

      if (
        dto.status !== UserStatus.ACTIVE &&
        existingUser.status === UserStatus.ACTIVE
      ) {
        await this.syncMailboxActivation(existingUser, false);
      }
    }

    await this.auditLogService.record({
      actorId: currentUser?.id,
      action: 'USER_REVIEW',
      targetType: 'USER',
      targetId: id,
      summary: '审核用户账号',
      metadata: {
        status: dto.status,
        roleIds: normalizedRoleIds,
        groupIds: normalizedGroupIds,
        notificationEmail: dto.notificationEmail?.trim().toLowerCase(),
      },
    });

    return this.findOne(id, currentUser);
  }

  async resetPassword(
    id: string,
    dto: ResetUserPasswordDto,
    currentUser?: AuthenticatedUser,
  ) {
    await this.ensureUserManageable(id, currentUser);
    const user = await this.getUserAuthMaterial(id);

    if (user.archivedAt) {
      throw new BadRequestException(
        '该账号已归档，请前往“归档用户”页面管理，不能直接重置密码',
      );
    }

    const temporaryPassword =
      dto.password?.trim() || generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    if (this.mailcowService.isEnabled()) {
      try {
        await this.syncMailboxPassword(user, temporaryPassword, {
          forcePasswordUpdate: true,
        });
      } catch (error) {
        await this.markMailboxProvisioning(user.id, {
          status: MailboxProvisioningStatus.FAILED,
          error: error instanceof Error ? error.message : '邮箱密码同步失败',
        });
        throw error;
      }
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordUpdatedAt: new Date(),
      },
    });

    await this.auditLogService.record({
      actorId: currentUser?.id,
      action: 'USER_RESET_PASSWORD',
      targetType: 'USER',
      targetId: id,
      summary: '管理员重置用户密码',
      metadata: {
        userEmail: user.email,
        mustChangePassword: true,
        customPasswordProvided: Boolean(dto.password?.trim()),
      },
    });

    return {
      temporaryPassword,
      user: await this.findOne(id, currentUser),
    };
  }

  async updateRoles(
    id: string,
    dto: UpdateUserRoleAssignmentsDto,
    currentUser?: AuthenticatedUser,
  ) {
    await this.ensureUserManageable(id, currentUser);
    await this.ensureUserNotArchived(id, '不能修改角色');
    const normalizedRoleIds = this.normalizeIds(dto.roleIds);
    await this.ensureRolesExist(normalizedRoleIds);
    await this.ensureManageableRoleIds(normalizedRoleIds, currentUser);
    await this.ensureProtectedSystemAdminRoleRetained(id, normalizedRoleIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: id },
      });

      if (normalizedRoleIds.length > 0) {
        await tx.userRole.createMany({
          data: normalizedRoleIds.map((roleId) => ({
            userId: id,
            roleId,
          })),
        });
      }
    });

    await this.auditLogService.record({
      actorId: currentUser?.id,
      action: 'USER_UPDATE_ROLES',
      targetType: 'USER',
      targetId: id,
      summary: '更新用户角色分配',
      metadata: {
        roleIds: normalizedRoleIds,
      },
    });

    return this.findOne(id, currentUser);
  }

  async updateGroups(
    id: string,
    dto: UpdateUserGroupAssignmentsDto,
    currentUser?: AuthenticatedUser,
  ) {
    await this.ensureUserManageable(id, currentUser);
    await this.ensureUserNotArchived(id, '不能修改群组');
    const groupIds = await this.ensureAssignableGroupIds(
      dto.groupIds,
      currentUser,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.userGroupMembership.deleteMany({
        where: { userId: id },
      });

      if (groupIds.length > 0) {
        await tx.userGroupMembership.createMany({
          data: groupIds.map((groupId) => ({
            userId: id,
            groupId,
            membershipRole: MembershipRole.MEMBER,
          })),
        });
      }
    });

    await this.auditLogService.record({
      actorId: currentUser?.id,
      action: 'USER_UPDATE_GROUPS',
      targetType: 'USER',
      targetId: id,
      summary: '更新用户群组分配',
      metadata: {
        groupIds,
      },
    });

    return this.findOne(id, currentUser);
  }

  async archive(id: string, currentUser: AuthenticatedUser) {
    await this.runExpiredArchiveCleanup();
    await this.ensureUserManageable(id, currentUser);
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        realName: true,
        status: true,
        archivedAt: true,
        mailboxProvisioningStatus: true,
        memberships: {
          select: {
            groupId: true,
            membershipRole: true,
            group: {
              select: {
                id: true,
                type: true,
                code: true,
                name: true,
              },
            },
          },
        },
        roles: {
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.id === currentUser.id) {
      throw new BadRequestException('不能删除当前登录账号');
    }

    if (user.archivedAt) {
      throw new ConflictException('该用户已归档，无需重复操作');
    }

    const hasAdminRole = user.roles.some(({ role }) =>
      ADMIN_ROLE_CODES.includes(role.code as (typeof ADMIN_ROLE_CODES)[number]),
    );

    if (hasAdminRole && user.status === UserStatus.ACTIVE) {
      const remainingActiveAdminCount = await this.prisma.user.count({
        where: {
          id: {
            not: user.id,
          },
          status: UserStatus.ACTIVE,
          roles: {
            some: {
              role: {
                code: {
                  in: [...ADMIN_ROLE_CODES],
                },
              },
            },
          },
        },
      });

      if (remainingActiveAdminCount === 0) {
        throw new ConflictException('至少需要保留一个已启用的管理员账号');
      }
    }

    if (
      this.mailcowService.isEnabled() &&
      user.mailboxProvisioningStatus === MailboxProvisioningStatus.PROVISIONED
    ) {
      await this.mailcowService.updateMailbox(user.email, {
        active: '0',
      });
    }

    const now = new Date();
    const archiveExpiresAt = new Date(
      now.getTime() + USER_ARCHIVE_RETENTION_MS,
    );

    await this.prisma.$transaction(async (tx) => {
      await this.transferArchivedKnowledgePages(tx, {
        userId: user.id,
        memberships: user.memberships,
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.DISABLED,
          archivedAt: now,
          archiveExpiresAt,
          contentRestoredAt: null,
        },
      });
    });

    await this.auditLogService.record({
      actorId: currentUser.id,
      action: 'USER_ARCHIVE',
      targetType: 'USER',
      targetId: user.id,
      summary: '归档用户账号',
      metadata: {
        archiveExpiresAt: archiveExpiresAt.toISOString(),
        userEmail: user.email,
      },
    });

    return this.findOne(user.id, currentUser);
  }

  async restoreArchivedContent(
    id: string,
    dto: RestoreArchivedContentDto,
    currentUser?: AuthenticatedUser,
  ) {
    await this.ensureUserManageable(id, currentUser);
    await this.runExpiredArchiveCleanup();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        realName: true,
        archivedAt: true,
        archiveExpiresAt: true,
        contentRestoredAt: true,
        memberships: {
          select: {
            groupId: true,
            membershipRole: true,
            group: {
              select: {
                id: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (!user.archivedAt) {
      throw new BadRequestException('当前用户未归档，无法恢复内容');
    }

    if (
      user.archiveExpiresAt &&
      user.archiveExpiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException('当前用户归档已到期，内容即将被自动清理');
    }

    if (user.contentRestoredAt) {
      throw new ConflictException('该用户邮件内容已转移，无需重复操作');
    }

    const restoredAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const recipientId = await this.findRestoreContentRecipientId(tx, {
        userId: user.id,
        target: dto.target,
        memberships: user.memberships,
      });

      await this.transferArchivedKnowledgePages(tx, {
        userId: user.id,
        memberships: user.memberships,
        recipientId,
      });

      await tx.internalMailThread.updateMany({
        where: { createdById: user.id },
        data: { createdById: recipientId },
      });

      await tx.internalMailMessage.updateMany({
        where: { senderId: user.id },
        data: { senderId: recipientId },
      });

      await this.transferDraftUserReferences(tx, user.id, recipientId);
      await this.transferMailboxEntries(tx, user.id, recipientId, {
        userId: user.id,
        realName: user.realName,
        email: user.email,
        restoredAt,
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          contentRestoredAt: restoredAt,
          archiveExpiresAt: new Date(Date.now() + USER_ARCHIVE_RETENTION_MS),
        },
      });
    });

    await this.auditLogService.record({
      actorId: currentUser?.id,
      action: 'USER_RESTORE_CONTENT',
      targetType: 'USER',
      targetId: user.id,
      summary: '恢复归档用户内容',
      metadata: {
        target: dto.target,
      },
    });

    return this.findOne(user.id, currentUser);
  }

  async reactivate(id: string, currentUser?: AuthenticatedUser) {
    await this.ensureUserManageable(id, currentUser);
    await this.runExpiredArchiveCleanup();
    const user = await this.getUserAuthMaterial(id);

    if (!user.archivedAt) {
      throw new BadRequestException('当前用户未归档，无法重新启用账号');
    }

    if (
      user.archiveExpiresAt &&
      user.archiveExpiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException('当前用户归档已到期，无法重新启用账号');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.ACTIVE,
          archivedAt: null,
          archiveExpiresAt: null,
          contentRestoredAt: null,
        },
      });

      const existingRoleCount = await tx.userRole.count({
        where: {
          userId: user.id,
        },
      });

      if (existingRoleCount === 0) {
        await this.assignMemberRole(tx, user.id);
      }
    });

    if (this.mailcowService.isEnabled()) {
      await this.syncMailboxActivation(user, true);
    }

    await this.auditLogService.record({
      actorId: currentUser?.id,
      action: 'USER_REACTIVATE',
      targetType: 'USER',
      targetId: user.id,
      summary: '重新启用归档用户',
      metadata: {
        userEmail: user.email,
      },
    });

    return this.findOne(user.id, currentUser);
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    return this.archive(id, currentUser);
  }

  private async buildManageableUserWhere(
    currentUser?: AuthenticatedUser,
    requestedGroupId?: string,
  ): Promise<Prisma.UserWhereInput> {
    const manageableGradeGroupIds =
      await this.resolveManageableGradeGroupIds(currentUser);

    if (!manageableGradeGroupIds) {
      return {};
    }

    if (
      requestedGroupId &&
      !manageableGradeGroupIds.includes(requestedGroupId.trim())
    ) {
      throw new ForbiddenException('年级管理员只能管理自己所在年级的成员');
    }

    return {
      memberships: {
        some: {
          groupId: {
            in: manageableGradeGroupIds,
          },
        },
      },
    };
  }

  private async ensureUserManageable(
    userId: string,
    currentUser?: AuthenticatedUser,
  ) {
    const manageableGradeGroupIds =
      await this.resolveManageableGradeGroupIds(currentUser);

    if (!manageableGradeGroupIds) {
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        memberships: {
          some: {
            groupId: {
              in: manageableGradeGroupIds,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new ForbiddenException('年级管理员只能管理自己所在年级的成员');
    }
  }

  private async ensureManageableGroupIds(
    groupIds: string[],
    currentUser?: AuthenticatedUser,
  ) {
    const manageableGradeGroupIds =
      await this.resolveManageableGradeGroupIds(currentUser);

    if (!manageableGradeGroupIds) {
      return;
    }

    if (groupIds.length === 0) {
      throw new ForbiddenException('年级管理员至少需要保留一个所属年级群组');
    }

    if (!groupIds.every((groupId) => manageableGradeGroupIds.includes(groupId))) {
      throw new ForbiddenException('年级管理员只能分配自己所在年级的群组');
    }
  }

  private async ensureManageableRoleIds(
    roleIds: string[],
    currentUser?: AuthenticatedUser,
  ) {
    const manageableGradeGroupIds =
      await this.resolveManageableGradeGroupIds(currentUser);

    if (!manageableGradeGroupIds || roleIds.length === 0) {
      return;
    }

    const roles = await this.prisma.role.findMany({
      where: {
        id: {
          in: roleIds,
        },
      },
      select: {
        code: true,
      },
    });

    if (
      roles.some(
        (role) => !GRADE_ADMIN_ASSIGNABLE_ROLE_CODES.includes(role.code),
      )
    ) {
      throw new ForbiddenException(
        '年级管理员只能分配普通成员或年级管理员角色',
      );
    }
  }

  private async resolveManageableGradeGroupIds(
    currentUser?: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (!currentUser || this.hasGlobalAdminRole(currentUser.roleCodes)) {
      return null;
    }

    if (!currentUser.roleCodes.includes(GRADE_ADMIN_ROLE_CODE)) {
      return null;
    }

    const gradeGroups = await this.prisma.group.findMany({
      where: {
        id: {
          in: currentUser.groupIds,
        },
        type: GroupType.GRADE,
      },
      select: {
        id: true,
      },
    });
    const manageableGradeGroupIds = gradeGroups.map((group) => group.id);

    if (manageableGradeGroupIds.length === 0) {
      throw new ForbiddenException('年级管理员未绑定年级群组，无法执行该操作');
    }

    return manageableGradeGroupIds;
  }

  private hasGlobalAdminRole(roleCodes: string[]) {
    return roleCodes.some((roleCode) =>
      GLOBAL_ADMIN_ROLE_CODES.includes(
        roleCode as (typeof GLOBAL_ADMIN_ROLE_CODES)[number],
      ),
    );
  }

  private async ensureUserNotArchived(id: string, actionMessage: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        archivedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.archivedAt) {
      throw new BadRequestException(
        `该账号已归档，请前往“归档用户”页面管理，${actionMessage}`,
      );
    }
  }

  private async getUserAuthMaterial(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        realName: true,
        studentId: true,
        passwordHash: true,
        status: true,
        archivedAt: true,
        archiveExpiresAt: true,
        contentRestoredAt: true,
        mustChangePassword: true,
        mailboxProvisioningStatus: true,
        mailboxLastError: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  private async syncMailboxPassword(
    user: Awaited<ReturnType<UserService['getUserAuthMaterial']>>,
    password: string,
    options: {
      forcePasswordUpdate: boolean;
    },
  ) {
    const attr = {
      active: user.status === UserStatus.ACTIVE ? '1' : '0',
      password,
      password2: password,
      force_pw_update: options.forcePasswordUpdate ? '1' : '0',
    };

    if (
      user.mailboxProvisioningStatus === MailboxProvisioningStatus.PROVISIONED
    ) {
      await this.mailcowService.updateMailbox(user.email, attr);
    } else {
      try {
        await this.mailcowService.createMailbox({
          username: user.email,
          password,
          name: user.realName,
          active: user.status === UserStatus.ACTIVE,
          forcePasswordUpdate: options.forcePasswordUpdate,
        });
      } catch {
        await this.mailcowService.updateMailbox(user.email, attr);
      }
    }

    await this.markMailboxProvisioning(user.id, {
      status: MailboxProvisioningStatus.PROVISIONED,
      error: null,
    });
  }

  private async syncMailboxActivation(
    user: Awaited<ReturnType<UserService['getUserAuthMaterial']>>,
    active: boolean,
  ) {
    if (
      user.mailboxProvisioningStatus !== MailboxProvisioningStatus.PROVISIONED
    ) {
      await this.markMailboxProvisioning(user.id, {
        status: user.mailboxProvisioningStatus,
        error: active
          ? '账号已启用，但邮箱尚未成功开户；当前可登录系统，邮箱功能暂不可用。'
          : user.mailboxProvisioningStatus === MailboxProvisioningStatus.FAILED
            ? (user.mailboxLastError ?? '邮箱停用状态未知')
            : null,
      });
      return;
    }

    try {
      await this.mailcowService.updateMailbox(user.email, {
        active: active ? '1' : '0',
      });
      await this.markMailboxProvisioning(user.id, {
        status: MailboxProvisioningStatus.PROVISIONED,
        error: null,
      });
    } catch (error) {
      await this.markMailboxProvisioning(user.id, {
        status: MailboxProvisioningStatus.FAILED,
        error:
          error instanceof Error
            ? error.message
            : active
              ? '账号已启用，但邮箱启用失败'
              : '邮箱停用失败',
      });
    }
  }

  private async ensureStudentIdAvailable(
    tx: Prisma.TransactionClient,
    studentId?: string,
  ) {
    if (!studentId) {
      return;
    }

    const existingStudentId = await tx.user.findUnique({
      where: { studentId: studentId.trim() },
      select: { id: true },
    });

    if (existingStudentId) {
      throw new ConflictException('学号已存在');
    }
  }

  private async ensureRolesExist(roleIds: string[]) {
    const normalizedRoleIds = this.normalizeIds(roleIds);

    if (normalizedRoleIds.length === 0) {
      return;
    }

    const count = await this.prisma.role.count({
      where: {
        id: {
          in: normalizedRoleIds,
        },
      },
    });

    if (count !== normalizedRoleIds.length) {
      throw new BadRequestException('存在无效角色 ID');
    }
  }

  private async ensureProtectedSystemAdminRoleRetained(
    userId: string,
    roleIds: string[],
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.username !== PROTECTED_SYSTEM_ADMIN_USERNAME) {
      return;
    }

    const currentlyHasSystemAdminRole = user.roles.some(
      ({ role }) => role.code === SYSTEM_ADMIN_ROLE_CODE,
    );

    if (!currentlyHasSystemAdminRole) {
      return;
    }

    const systemAdminRole = await this.prisma.role.findUnique({
      where: {
        code: SYSTEM_ADMIN_ROLE_CODE,
      },
      select: {
        id: true,
      },
    });

    if (!systemAdminRole) {
      throw new ConflictException('系统管理员角色不存在，无法完成身份修改');
    }

    if (!roleIds.includes(systemAdminRole.id)) {
      throw new ConflictException(
        `账号 ${PROTECTED_SYSTEM_ADMIN_USERNAME} 不能被移除系统管理员权限`,
      );
    }
  }

  private async ensureGroupsExist(groupIds: string[]) {
    const normalizedGroupIds = this.normalizeIds(groupIds);

    if (normalizedGroupIds.length === 0) {
      return;
    }

    const count = await this.prisma.group.count({
      where: {
        id: {
          in: normalizedGroupIds,
        },
      },
    });

    if (count !== normalizedGroupIds.length) {
      throw new BadRequestException('存在无效群组 ID');
    }
  }

  private async ensureAssignableGroupIds(
    groupIds?: string[],
    currentUser?: AuthenticatedUser,
  ) {
    const normalizedGroupIds = this.normalizeIds(groupIds);
    await this.ensureGroupsExist(normalizedGroupIds);
    await this.ensureSingleGradeGroupSelection(normalizedGroupIds);
    await this.ensureManageableGroupIds(normalizedGroupIds, currentUser);

    return normalizedGroupIds;
  }

  private async ensureSingleGradeGroupSelection(groupIds: string[]) {
    if (groupIds.length <= 1) {
      return;
    }

    const gradeGroups = await this.prisma.group.findMany({
      where: {
        id: {
          in: groupIds,
        },
        type: GroupType.GRADE,
      },
      select: {
        id: true,
      },
    });

    if (gradeGroups.length > 1) {
      throw new BadRequestException('一个用户只能选择一个年级组');
    }
  }

  private async isUsernamePrefixAvailable(prefix: string) {
    const email = createMailboxAddress(prefix, this.getMailDomain());
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: prefix }, { email }],
      },
      select: {
        id: true,
      },
    });

    return !existing;
  }

  private async ensureUsernamePrefixAvailable(prefix: string) {
    const available = await this.isUsernamePrefixAvailable(prefix);

    if (!available) {
      throw new ConflictException('该邮箱前缀已被占用，请增加字符后重试');
    }
  }

  private async getRegisterSelectableGroups() {
    let groups = await this.prisma.group.findMany({
      where: {
        type: {
          in: [GroupType.DIRECTION, GroupType.GRADE, GroupType.FUNCTIONAL],
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
      orderBy: [
        {
          type: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    if (groups.some((group) => group.type === GroupType.DIRECTION)) {
      return groups;
    }

    await this.groupService.bootstrapDirections();

    groups = await this.prisma.group.findMany({
      where: {
        type: {
          in: [GroupType.DIRECTION, GroupType.GRADE, GroupType.FUNCTIONAL],
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
      },
      orderBy: [
        {
          type: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    return groups;
  }

  private async generateUniqueIdentity(
    tx: Prisma.TransactionClient,
    realName: string,
    reservedUsernames: Set<string>,
  ) {
    const base = createUsernameBase(realName);

    for (const candidate of [
      base,
      ...this.getRandomizedTwoDigitUsernameCandidates(base),
    ]) {
      if (reservedUsernames.has(candidate)) {
        continue;
      }

      const email = createMailboxAddress(candidate, this.getMailDomain());
      const existing = await tx.user.findFirst({
        where: {
          OR: [{ username: candidate }, { email }],
        },
        select: { id: true },
      });

      if (!existing) {
        reservedUsernames.add(candidate);

        return {
          username: candidate,
          email,
        };
      }
    }

    throw new ConflictException('无法为当前成员生成唯一账号，请调整姓名后重试');
  }

  private async createUserRecord(input: {
    realName: string;
    usernamePrefix?: string;
    password: string;
    notificationEmail?: string;
    studentId?: string;
    avatarUrl?: string;
    bio?: string;
    groupIds: string[];
    status: UserStatus;
    mustChangePassword: boolean;
    reserve: Set<string>;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureStudentIdAvailable(tx, input.studentId);

        const identity = input.usernamePrefix
          ? await this.ensureSpecifiedIdentityAvailable(
              tx,
              input.usernamePrefix,
            )
          : await this.generateUniqueIdentity(
              tx,
              input.realName,
              input.reserve,
            );
        const passwordHash = await hashPassword(input.password);
        const user = await tx.user.create({
          data: {
            email: identity.email,
            notificationEmail: input.notificationEmail?.trim().toLowerCase(),
            username: identity.username,
            passwordHash,
            realName: input.realName,
            studentId: input.studentId?.trim() || undefined,
            avatarUrl: input.avatarUrl,
            bio: input.bio,
            emailReminderEnabled: true,
            status: input.status,
            mustChangePassword: input.mustChangePassword,
            passwordUpdatedAt: new Date(),
            mailboxProvisioningStatus: MailboxProvisioningStatus.PENDING,
            mailboxLastError: null,
          },
          select: {
            id: true,
          },
        });

        await this.assignMemberRole(tx, user.id);
        await this.assignGroups(tx, user.id, input.groupIds);

        return this.findOneById(tx, user.id);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('该邮箱前缀已被占用，请增加字符后重试');
      }

      throw error;
    }
  }

  private async ensureSpecifiedIdentityAvailable(
    tx: Prisma.TransactionClient,
    usernamePrefix: string,
  ) {
    const username = createUsernameBaseFromPinyin(usernamePrefix);
    const email = createMailboxAddress(username, this.getMailDomain());
    const existing = await tx.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('该邮箱前缀已被占用，请增加字符后重试');
    }

    return {
      username,
      email,
    };
  }

  private async markMailboxProvisioning(
    userId: string,
    input: {
      status: MailboxProvisioningStatus;
      error: string | null;
    },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mailboxProvisioningStatus: input.status,
        mailboxProvisionedAt:
          input.status === MailboxProvisioningStatus.PROVISIONED
            ? new Date()
            : null,
        mailboxLastError: input.error,
      },
    });
  }

  private async assignMemberRole(tx: Prisma.TransactionClient, userId: string) {
    const memberRole = await tx.role.findUnique({
      where: {
        code: 'MEMBER',
      },
      select: {
        id: true,
      },
    });

    if (!memberRole) {
      return;
    }

    await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: memberRole.id,
        },
      },
      update: {},
      create: {
        userId,
        roleId: memberRole.id,
      },
    });
  }

  private async assignGroups(
    tx: Prisma.TransactionClient,
    userId: string,
    groupIds: string[],
  ) {
    if (groupIds.length === 0) {
      return;
    }

    await tx.userGroupMembership.createMany({
      data: groupIds.map((groupId) => ({
        userId,
        groupId,
        membershipRole: MembershipRole.MEMBER,
      })),
      skipDuplicates: true,
    });
  }

  private async findOneById(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<UserDetail> {
    const user = await tx.user.findUnique({
      where: { id },
      select: userDetailSelect,
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  private normalizeIds(ids?: string[]) {
    return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
  }

  private getRandomizedTwoDigitUsernameCandidates(base: string) {
    const suffixes = Array.from({ length: 100 }, (_, index) =>
      index.toString().padStart(2, '0'),
    );

    for (let index = suffixes.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      const current = suffixes[index];
      suffixes[index] = suffixes[randomIndex];
      suffixes[randomIndex] = current;
    }

    return suffixes.map(
      (suffix) => `${base.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`,
    );
  }

  private getMailDomain() {
    return process.env.MAIL_DOMAIN ?? '3glab';
  }

  private async runExpiredArchiveCleanup() {
    if (this.purgeRunning) {
      return;
    }

    this.purgeRunning = true;

    try {
      const expiredUsers = await this.prisma.user.findMany({
        where: {
          archivedAt: {
            not: null,
          },
          archiveExpiresAt: {
            lte: new Date(),
          },
        },
        select: {
          id: true,
          email: true,
          mailboxProvisioningStatus: true,
        },
        orderBy: {
          archiveExpiresAt: 'asc',
        },
      });

      for (const user of expiredUsers) {
        try {
          if (
            this.mailcowService.isEnabled() &&
            user.mailboxProvisioningStatus ===
              MailboxProvisioningStatus.PROVISIONED
          ) {
            await this.mailcowService.deleteMailbox(user.email);
          }

          await this.prisma.$transaction(async (tx) => {
            await this.transferArchivedKnowledgePages(tx, {
              userId: user.id,
            });

            await tx.user.delete({
              where: { id: user.id },
            });
          });
        } catch (error) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              mailboxLastError:
                error instanceof Error ? error.message : '归档清理失败',
            },
          });
        }
      }
    } finally {
      this.purgeRunning = false;
    }
  }

  private async findRestoreContentRecipientId(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      target: RestoreArchivedContentTarget;
      memberships?: ArchivedKnowledgeMembership[];
    },
  ) {
    if (input.target === RestoreArchivedContentTarget.LAB_ADMIN) {
      return this.findLabAdminUserId(tx, input.userId);
    }

    return this.findDirectionAdminUserId(tx, {
      userId: input.userId,
      memberships: input.memberships,
    });
  }

  private async findLabAdminUserId(
    tx: Prisma.TransactionClient,
    excludeUserId: string,
  ) {
    const candidates = await tx.user.findMany({
      where: {
        id: {
          not: excludeUserId,
        },
        status: UserStatus.ACTIVE,
        archivedAt: null,
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
        createdAt: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (candidates.length === 0) {
      throw new ConflictException('未找到可接收内容的实验室管理员账号');
    }

    const rolePriority = {
      LAB_ADMIN: 0,
      SUPER_ADMIN: 1,
    } as const;

    const bestCandidate = [...candidates].sort((left, right) => {
      const leftPriority = Math.min(
        ...left.roles.map(
          ({ role }) => rolePriority[role.code as keyof typeof rolePriority],
        ),
      );
      const rightPriority = Math.min(
        ...right.roles.map(
          ({ role }) => rolePriority[role.code as keyof typeof rolePriority],
        ),
      );

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];

    return bestCandidate.id;
  }

  private async findDirectionAdminUserId(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      memberships?: ArchivedKnowledgeMembership[];
    },
  ) {
    const pages = await tx.knowledgePage.findMany({
      where: {
        OR: [{ authorId: input.userId }, { editorId: input.userId }],
      },
      select: {
        space: {
          select: {
            ownerGroup: {
              select: {
                id: true,
                type: true,
              },
            },
          },
        },
      },
    });

    const directionGroupIds = this.collectArchiveGroupIds(
      GroupType.DIRECTION,
      pages,
      input.memberships,
    );

    if (directionGroupIds.length === 0) {
      throw new BadRequestException(
        '该用户未归属任何方向，无法恢复到方向管理员名下',
      );
    }

    const archivedGradeMembership = this.pickArchivedGradeMembership(
      input.memberships,
    );

    if (!archivedGradeMembership) {
      throw new BadRequestException(
        '该用户未归属任何年级，无法按年级恢复到方向管理员名下',
      );
    }

    const archivedGradeValue = this.extractGradeValueFromGroup(
      archivedGradeMembership.group,
    );

    if (archivedGradeValue === null) {
      throw new ConflictException('无法识别该用户所属年级，无法恢复到方向管理员名下');
    }

    const directionAdminId = await this.findDirectionAdminRecipientByGrade(tx, {
      excludeUserId: input.userId,
      directionGroupIds,
      targetGradeValue: archivedGradeValue,
    });

    if (!directionAdminId) {
      throw new ConflictException(
        '未找到同年级或上一个年级的方向管理员账号',
      );
    }

    return directionAdminId;
  }

  private async transferArchivedKnowledgePages(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      memberships?: ArchivedKnowledgeMembership[];
      recipientId?: string;
    },
  ) {
    const pages = await tx.knowledgePage.findMany({
      where: {
        OR: [{ authorId: input.userId }, { editorId: input.userId }],
      },
      select: {
        id: true,
        authorId: true,
        editorId: true,
        space: {
          select: {
            ownerGroup: {
              select: {
                id: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (pages.length === 0) {
      return;
    }

    if (input.recipientId) {
      for (const page of pages) {
        const data: {
          authorId?: string;
          editorId?: string;
        } = {};

        if (page.authorId === input.userId) {
          data.authorId = input.recipientId;
        }

        if (page.editorId === input.userId) {
          data.editorId = input.recipientId;
        }

        await tx.knowledgePage.update({
          where: { id: page.id },
          data,
        });
      }

      return;
    }

    const directionGroupIds = this.collectArchiveGroupIds(
      GroupType.DIRECTION,
      pages,
      input.memberships,
    );
    const gradeGroupIds = this.collectArchiveGroupIds(
      GroupType.GRADE,
      pages,
      input.memberships,
    );

    const [directionAdminsByGroupId, gradeAdminsByGroupId, fallbackAdminId] =
      await Promise.all([
        this.findScopedArchiveAdminsByGroup(tx, {
          excludeUserId: input.userId,
          roleCode: 'DIRECTION_ADMIN',
          groupIds: directionGroupIds,
        }),
        this.findScopedArchiveAdminsByGroup(tx, {
          excludeUserId: input.userId,
          roleCode: 'GRADE_ADMIN',
          groupIds: gradeGroupIds,
        }),
        this.findArchiveFallbackAdminId(tx, input.userId),
      ]);

    const preferredDirectionAdminId = this.pickFirstArchiveAdmin(
      directionGroupIds,
      directionAdminsByGroupId,
    );
    const preferredGradeAdminId = this.pickFirstArchiveAdmin(
      gradeGroupIds,
      gradeAdminsByGroupId,
    );

    for (const page of pages) {
      const recipientId = this.resolveArchivedKnowledgeRecipientId({
        page,
        directionAdminsByGroupId,
        gradeAdminsByGroupId,
        preferredDirectionAdminId,
        preferredGradeAdminId,
        fallbackAdminId,
      });

      if (!recipientId) {
        throw new ConflictException('未找到可接管知识内容的管理员账号');
      }

      const data: {
        authorId?: string;
        editorId?: string;
      } = {};

      if (page.authorId === input.userId) {
        data.authorId = recipientId;
      }

      if (page.editorId === input.userId) {
        data.editorId = recipientId;
      }

      await tx.knowledgePage.update({
        where: { id: page.id },
        data,
      });
    }
  }

  private collectArchiveGroupIds(
    groupType: GroupType,
    pages: Array<{
      space: {
        ownerGroup: {
          id: string;
          type: GroupType;
        } | null;
      };
    }>,
    memberships?: ArchivedKnowledgeMembership[],
  ) {
    const groupIds = new Set<string>();

    for (const membership of memberships ?? []) {
      if (membership.group.type === groupType) {
        groupIds.add(membership.groupId);
      }
    }

    for (const page of pages) {
      if (page.space.ownerGroup?.type === groupType) {
        groupIds.add(page.space.ownerGroup.id);
      }
    }

    return [...groupIds].sort();
  }

  private async findScopedArchiveAdminsByGroup(
    tx: Prisma.TransactionClient,
    input: {
      excludeUserId: string;
      roleCode: 'DIRECTION_ADMIN' | 'GRADE_ADMIN';
      groupIds: string[];
    },
  ) {
    const recipientsByGroupId = new Map<string, string>();

    if (input.groupIds.length === 0) {
      return recipientsByGroupId;
    }

    const candidates = await tx.user.findMany({
      where: {
        id: {
          not: input.excludeUserId,
        },
        status: UserStatus.ACTIVE,
        archivedAt: null,
        roles: {
          some: {
            role: {
              code: input.roleCode,
            },
          },
        },
        memberships: {
          some: {
            groupId: {
              in: input.groupIds,
            },
          },
        },
      },
      select: {
        id: true,
        createdAt: true,
        memberships: {
          where: {
            groupId: {
              in: input.groupIds,
            },
          },
          select: {
            groupId: true,
            membershipRole: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const candidateByGroupId = new Map<
      string,
      {
        id: string;
        createdAt: Date;
        isManager: boolean;
      }
    >();

    for (const candidate of candidates) {
      for (const membership of candidate.memberships) {
        const existing = candidateByGroupId.get(membership.groupId);
        const next = {
          id: candidate.id,
          createdAt: candidate.createdAt,
          isManager: membership.membershipRole === MembershipRole.MANAGER,
        };

        if (!existing) {
          candidateByGroupId.set(membership.groupId, next);
          continue;
        }

        if (next.isManager && !existing.isManager) {
          candidateByGroupId.set(membership.groupId, next);
          continue;
        }

        if (
          next.isManager === existing.isManager &&
          next.createdAt.getTime() < existing.createdAt.getTime()
        ) {
          candidateByGroupId.set(membership.groupId, next);
        }
      }
    }

    for (const [groupId, candidate] of candidateByGroupId.entries()) {
      recipientsByGroupId.set(groupId, candidate.id);
    }

    return recipientsByGroupId;
  }

  private async findArchiveFallbackAdminId(
    tx: Prisma.TransactionClient,
    excludeUserId: string,
  ) {
    const candidates = await tx.user.findMany({
      where: {
        id: {
          not: excludeUserId,
        },
        status: UserStatus.ACTIVE,
        archivedAt: null,
        roles: {
          some: {
            role: {
              code: {
                in: [...ADMIN_ROLE_CODES],
              },
            },
          },
        },
      },
      select: {
        id: true,
        createdAt: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (candidates.length === 0) {
      return null;
    }

    const rolePriority = {
      LAB_ADMIN: 0,
      SUPER_ADMIN: 1,
      DIRECTION_ADMIN: 2,
      GRADE_ADMIN: 3,
    } satisfies Record<(typeof ADMIN_ROLE_CODES)[number], number>;

    const bestCandidate = [...candidates].sort((left, right) => {
      const leftPriority = Math.min(
        ...left.roles.map(
          ({ role }) => rolePriority[role.code as keyof typeof rolePriority],
        ),
      );
      const rightPriority = Math.min(
        ...right.roles.map(
          ({ role }) => rolePriority[role.code as keyof typeof rolePriority],
        ),
      );

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];

    return bestCandidate?.id ?? null;
  }

  private pickFirstArchiveAdmin(
    groupIds: string[],
    recipientsByGroupId: Map<string, string>,
  ) {
    for (const groupId of groupIds) {
      const recipientId = recipientsByGroupId.get(groupId);

      if (recipientId) {
        return recipientId;
      }
    }

    return null;
  }

  private pickArchivedGradeMembership(
    memberships?: ArchivedKnowledgeMembership[],
  ) {
    const gradeMemberships = (memberships ?? []).filter(
      (membership) => membership.group.type === GroupType.GRADE,
    );

    if (gradeMemberships.length === 0) {
      return null;
    }

    return [...gradeMemberships].sort((left, right) => {
      const leftGradeValue = this.extractGradeValueFromGroup(left.group);
      const rightGradeValue = this.extractGradeValueFromGroup(right.group);

      if (leftGradeValue !== null && rightGradeValue !== null) {
        return rightGradeValue - leftGradeValue;
      }

      if (leftGradeValue !== null) {
        return -1;
      }

      if (rightGradeValue !== null) {
        return 1;
      }

      return left.group.id.localeCompare(right.group.id);
    })[0];
  }

  private extractGradeValueFromGroup(input: {
    id: string;
    code?: string | null;
    name?: string | null;
  }) {
    const patterns = [
      /(?:^|[^0-9])GRADE[_-]?(\d{2,4})(?:[^0-9]|$)/i,
      /(?:^|[^0-9])(\d{2,4})级(?:[^0-9]|$)/,
      /(?:^|[^0-9])grade[-_](\d{2,4})(?:[^0-9]|$)/i,
    ];

    for (const value of [input.code, input.name, input.id]) {
      if (!value) {
        continue;
      }

      for (const pattern of patterns) {
        const match = value.match(pattern);

        if (match) {
          return Number.parseInt(match[1], 10);
        }
      }
    }

    return null;
  }

  private async findDirectionAdminRecipientByGrade(
    tx: Prisma.TransactionClient,
    input: {
      excludeUserId: string;
      directionGroupIds: string[];
      targetGradeValue: number;
    },
  ) {
    const recipientsByGroupId = new Map<string, string>();

    if (input.directionGroupIds.length === 0) {
      return null;
    }

    const candidates = await tx.user.findMany({
      where: {
        id: {
          not: input.excludeUserId,
        },
        status: UserStatus.ACTIVE,
        archivedAt: null,
        roles: {
          some: {
            role: {
              code: 'DIRECTION_ADMIN',
            },
          },
        },
        memberships: {
          some: {
            groupId: {
              in: input.directionGroupIds,
            },
          },
        },
      },
      select: {
        id: true,
        createdAt: true,
        memberships: {
          select: {
            groupId: true,
            membershipRole: true,
            group: {
              select: {
                id: true,
                code: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const candidateByGroupId = new Map<
      string,
      {
        id: string;
        createdAt: Date;
        isManager: boolean;
        gradePriority: number;
      }
    >();

    for (const candidate of candidates) {
      const gradePriority = this.resolveDirectionAdminGradePriority(
        candidate.memberships,
        input.targetGradeValue,
      );

      if (gradePriority === null) {
        continue;
      }

      for (const membership of candidate.memberships) {
        if (
          membership.group.type !== GroupType.DIRECTION ||
          !input.directionGroupIds.includes(membership.groupId)
        ) {
          continue;
        }

        const existing = candidateByGroupId.get(membership.groupId);
        const next = {
          id: candidate.id,
          createdAt: candidate.createdAt,
          isManager: membership.membershipRole === MembershipRole.MANAGER,
          gradePriority,
        };

        if (!existing) {
          candidateByGroupId.set(membership.groupId, next);
          continue;
        }

        if (next.gradePriority !== existing.gradePriority) {
          if (next.gradePriority < existing.gradePriority) {
            candidateByGroupId.set(membership.groupId, next);
          }
          continue;
        }

        if (next.isManager && !existing.isManager) {
          candidateByGroupId.set(membership.groupId, next);
          continue;
        }

        if (
          next.isManager === existing.isManager &&
          next.createdAt.getTime() < existing.createdAt.getTime()
        ) {
          candidateByGroupId.set(membership.groupId, next);
        }
      }
    }

    for (const [groupId, candidate] of candidateByGroupId.entries()) {
      recipientsByGroupId.set(groupId, candidate.id);
    }

    return this.pickFirstArchiveAdmin(input.directionGroupIds, recipientsByGroupId);
  }

  private resolveDirectionAdminGradePriority(
    memberships: ArchivedKnowledgeMembership[],
    targetGradeValue: number,
  ) {
    const gradeValues = memberships
      .filter((membership) => membership.group.type === GroupType.GRADE)
      .map((membership) => this.extractGradeValueFromGroup(membership.group))
      .filter((value): value is number => value !== null);

    if (gradeValues.includes(targetGradeValue)) {
      return 0;
    }

    if (gradeValues.includes(targetGradeValue - 1)) {
      return 1;
    }

    return null;
  }

  private resolveArchivedKnowledgeRecipientId(input: {
    page: {
      space: {
        ownerGroup: {
          id: string;
          type: GroupType;
        } | null;
      };
    };
    directionAdminsByGroupId: Map<string, string>;
    gradeAdminsByGroupId: Map<string, string>;
    preferredDirectionAdminId: string | null;
    preferredGradeAdminId: string | null;
    fallbackAdminId: string | null;
  }) {
    const ownerGroup = input.page.space.ownerGroup;

    if (ownerGroup?.type === GroupType.DIRECTION) {
      return (
        input.directionAdminsByGroupId.get(ownerGroup.id) ??
        input.preferredDirectionAdminId ??
        input.preferredGradeAdminId ??
        input.fallbackAdminId
      );
    }

    if (ownerGroup?.type === GroupType.GRADE) {
      return (
        input.gradeAdminsByGroupId.get(ownerGroup.id) ??
        input.preferredGradeAdminId ??
        input.preferredDirectionAdminId ??
        input.fallbackAdminId
      );
    }

    return (
      input.preferredDirectionAdminId ??
      input.preferredGradeAdminId ??
      input.fallbackAdminId
    );
  }

  private async transferDraftUserReferences(
    tx: Prisma.TransactionClient,
    fromUserId: string,
    toUserId: string,
  ) {
    const messages = await tx.internalMailMessage.findMany({
      where: {
        OR: [
          {
            draftToUserIds: {
              has: fromUserId,
            },
          },
          {
            draftCcUserIds: {
              has: fromUserId,
            },
          },
        ],
      },
      select: {
        id: true,
        draftToUserIds: true,
        draftCcUserIds: true,
      },
    });

    for (const message of messages) {
      await tx.internalMailMessage.update({
        where: { id: message.id },
        data: {
          draftToUserIds: this.replaceUserIdInList(
            message.draftToUserIds,
            fromUserId,
            toUserId,
          ),
          draftCcUserIds: this.replaceUserIdInList(
            message.draftCcUserIds,
            fromUserId,
            toUserId,
          ),
        },
      });
    }
  }

  private async transferMailboxEntries(
    tx: Prisma.TransactionClient,
    fromUserId: string,
    toUserId: string,
    archivedSource: ArchivedMailSourceSnapshot,
  ) {
    const recipients = await tx.internalMailRecipient.findMany({
      where: {
        userId: fromUserId,
      },
      select: {
        id: true,
        messageId: true,
        recipientType: true,
        archivedSourceUserId: true,
        archivedSourceUserName: true,
        archivedSourceUserEmail: true,
        archivedSourceAt: true,
        readAt: true,
        starredAt: true,
        archivedAt: true,
        deletedAt: true,
      },
    });

    for (const recipient of recipients) {
      const existing = await tx.internalMailRecipient.findUnique({
        where: {
          messageId_userId_recipientType: {
            messageId: recipient.messageId,
            userId: toUserId,
            recipientType: recipient.recipientType,
          },
        },
        select: {
          id: true,
          archivedSourceUserId: true,
          archivedSourceUserName: true,
          archivedSourceUserEmail: true,
          archivedSourceAt: true,
          readAt: true,
          starredAt: true,
          archivedAt: true,
          deletedAt: true,
        },
      });

      if (existing) {
        await tx.internalMailRecipient.update({
          where: { id: existing.id },
          data: {
            archivedSourceUserId:
              existing.archivedSourceUserId ?? archivedSource.userId,
            archivedSourceUserName:
              existing.archivedSourceUserName ?? archivedSource.realName,
            archivedSourceUserEmail:
              existing.archivedSourceUserEmail ?? archivedSource.email ?? null,
            archivedSourceAt:
              existing.archivedSourceAt ?? archivedSource.restoredAt,
            readAt: this.mergeOptionalDate(existing.readAt, recipient.readAt),
            starredAt: this.mergeOptionalDate(
              existing.starredAt,
              recipient.starredAt,
            ),
            archivedAt: this.mergeOptionalDate(
              existing.archivedAt,
              recipient.archivedAt,
            ),
            deletedAt: this.mergeOptionalDate(
              existing.deletedAt,
              recipient.deletedAt,
            ),
          },
        });

        await tx.internalMailRecipient.delete({
          where: { id: recipient.id },
        });
        continue;
      }

      await tx.internalMailRecipient.update({
        where: { id: recipient.id },
        data: {
          userId: toUserId,
          archivedSourceUserId: archivedSource.userId,
          archivedSourceUserName: archivedSource.realName,
          archivedSourceUserEmail: archivedSource.email ?? null,
          archivedSourceAt: archivedSource.restoredAt,
        },
      });
    }
  }

  private replaceUserIdInList(
    userIds: string[],
    fromUserId: string,
    toUserId: string,
  ) {
    return [
      ...new Set(
        userIds.map((userId) => (userId === fromUserId ? toUserId : userId)),
      ),
    ];
  }

  private mergeOptionalDate(
    currentValue: Date | null,
    incomingValue: Date | null,
  ) {
    if (!currentValue) {
      return incomingValue;
    }

    if (!incomingValue) {
      return currentValue;
    }

    return currentValue.getTime() <= incomingValue.getTime()
      ? currentValue
      : incomingValue;
  }
}
