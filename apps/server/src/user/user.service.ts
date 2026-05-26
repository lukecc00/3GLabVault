import {
  BadRequestException,
  ConflictException,
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
import { ADMIN_ROLE_CODES } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GroupService } from '../group/group.service';
import { MailcowService } from '../mailcow/mailcow.service';
import { PrismaService } from '../prisma/prisma.service';
import { BatchGenerateUsersDto } from './dto/batch-generate-users.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterOptionsDto } from './dto/register-options.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
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
  realName: true,
  studentId: true,
  avatarUrl: true,
  bio: true,
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

const USER_ARCHIVE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const USER_ARCHIVE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const PROTECTED_SYSTEM_ADMIN_USERNAME = 'xiyou3g';
const SYSTEM_ADMIN_ROLE_CODE = 'SUPER_ADMIN';

@Injectable()
export class UserService implements OnModuleInit, OnModuleDestroy {
  private purgeTimer: NodeJS.Timeout | null = null;
  private purgeRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupService: GroupService,
    private readonly mailcowService: MailcowService,
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

  async findAll() {
    await this.runExpiredArchiveCleanup();
    return this.prisma.user.findMany({
      where: {
        archivedAt: null,
      },
      select: userDetailSelect,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findArchived() {
    await this.runExpiredArchiveCleanup();
    return this.prisma.user.findMany({
      where: {
        archivedAt: {
          not: null,
        },
      },
      select: userDetailSelect,
      orderBy: [{ archiveExpiresAt: 'asc' }, { archivedAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    await this.runExpiredArchiveCleanup();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userDetailSelect,
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

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
    const groupIds = this.normalizeIds(dto.groupIds);
    const usernamePrefix = createUsernameBaseFromPinyin(dto.namePinyin);
    await this.ensureGroupsExist(groupIds);
    await this.ensureUsernamePrefixAvailable(usernamePrefix);
    const createdUser = await this.createUserRecord({
      realName: dto.realName,
      usernamePrefix,
      password: dto.password,
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

  async batchGenerate(dto: BatchGenerateUsersDto) {
    const groupIds = this.normalizeIds(dto.groupIds);
    await this.ensureGroupsExist(groupIds);
    this.ensureBatchStudentIdsUnique(dto.users);
    const reservedUsernames = new Set<string>();
    const createdUsers: Array<{
      temporaryPassword: string;
      user: UserDetail;
    }> = [];
    const failedUsers: Array<{
      realName: string;
      studentId?: string;
      reason: string;
    }> = [];

    for (const entry of dto.users) {
      const temporaryPassword = generateTemporaryPassword();

      try {
        const createdUser = await this.createUserRecord({
          realName: entry.realName,
          password: temporaryPassword,
          studentId: entry.studentId,
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
            user: await this.findOne(createdUser.id),
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
          studentId: entry.studentId?.trim() || undefined,
          reason: error instanceof Error ? error.message : '未知错误',
        });
      }
    }

    return {
      createdUsers,
      failedUsers,
    };
  }

  async review(id: string, dto: ReviewUserDto) {
    const existingUser = await this.getUserAuthMaterial(id);
    const normalizedRoleIds = dto.roleIds
      ? this.normalizeIds(dto.roleIds)
      : undefined;

    if (dto.status === UserStatus.PENDING) {
      throw new BadRequestException('审核状态不能回退为待审核');
    }

    if (normalizedRoleIds) {
      await this.ensureRolesExist(normalizedRoleIds);
      await this.ensureProtectedSystemAdminRoleRetained(id, normalizedRoleIds);
    }

    if (dto.groupIds) {
      await this.ensureGroupsExist(dto.groupIds);
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

      if (dto.groupIds) {
        await tx.userGroupMembership.deleteMany({
          where: { userId: id },
        });

        if (dto.groupIds.length > 0) {
          await tx.userGroupMembership.createMany({
            data: dto.groupIds.map((groupId) => ({
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

    return this.findOne(id);
  }

  async resetPassword(id: string, dto: ResetUserPasswordDto) {
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

    return {
      temporaryPassword,
      user: await this.findOne(id),
    };
  }

  async updateRoles(id: string, dto: UpdateUserRoleAssignmentsDto) {
    await this.ensureUserNotArchived(id, '不能修改角色');
    const normalizedRoleIds = this.normalizeIds(dto.roleIds);
    await this.ensureRolesExist(normalizedRoleIds);
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

    return this.findOne(id);
  }

  async updateGroups(id: string, dto: UpdateUserGroupAssignmentsDto) {
    await this.ensureUserNotArchived(id, '不能修改群组');
    await this.ensureGroupsExist(dto.groupIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.userGroupMembership.deleteMany({
        where: { userId: id },
      });

      if (dto.groupIds.length > 0) {
        await tx.userGroupMembership.createMany({
          data: dto.groupIds.map((groupId) => ({
            userId: id,
            groupId,
            membershipRole: MembershipRole.MEMBER,
          })),
        });
      }
    });

    return this.findOne(id);
  }

  async archive(id: string, currentUser: AuthenticatedUser) {
    await this.runExpiredArchiveCleanup();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        realName: true,
        status: true,
        archivedAt: true,
        mailboxProvisioningStatus: true,
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
    const archiveExpiresAt = new Date(now.getTime() + USER_ARCHIVE_RETENTION_MS);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: {
          userId: user.id,
        },
      });

      await tx.userGroupMembership.deleteMany({
        where: {
          userId: user.id,
        },
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

    return this.findOne(user.id);
  }

  async restoreArchivedContent(id: string) {
    await this.runExpiredArchiveCleanup();
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        realName: true,
        archivedAt: true,
        archiveExpiresAt: true,
        contentRestoredAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (!user.archivedAt) {
      throw new BadRequestException('当前用户未归档，无法恢复内容');
    }

    if (user.archiveExpiresAt && user.archiveExpiresAt.getTime() <= Date.now()) {
      throw new ConflictException('当前用户归档已到期，内容即将被自动清理');
    }

    if (user.contentRestoredAt) {
      throw new ConflictException('该用户内容已恢复到系统管理员名下');
    }

    const systemAdmin = await this.findSystemAdminUser(user.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgePage.updateMany({
        where: { authorId: user.id },
        data: { authorId: systemAdmin.id },
      });

      await tx.knowledgePage.updateMany({
        where: { editorId: user.id },
        data: { editorId: systemAdmin.id },
      });

      await tx.internalMailThread.updateMany({
        where: { createdById: user.id },
        data: { createdById: systemAdmin.id },
      });

      await tx.internalMailMessage.updateMany({
        where: { senderId: user.id },
        data: { senderId: systemAdmin.id },
      });

      await this.transferDraftUserReferences(tx, user.id, systemAdmin.id);
      await this.transferMailboxEntries(tx, user.id, systemAdmin.id);

      await tx.user.update({
        where: { id: user.id },
        data: {
          contentRestoredAt: new Date(),
        },
      });
    });

    return this.findOne(user.id);
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    return this.archive(id, currentUser);
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
            ? user.mailboxLastError ?? '邮箱停用状态未知'
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

    for (let index = 0; index < 500; index += 1) {
      const suffix = index === 0 ? '' : `${index + 1}`;
      const username = `${base.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`;

      if (reservedUsernames.has(username)) {
        continue;
      }

      const email = createMailboxAddress(username, this.getMailDomain());
      const existing = await tx.user.findFirst({
        where: {
          OR: [{ username }, { email }],
        },
        select: { id: true },
      });

      if (!existing) {
        reservedUsernames.add(username);

        return {
          username,
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
            username: identity.username,
            passwordHash,
            realName: input.realName,
            studentId: input.studentId?.trim() || undefined,
            avatarUrl: input.avatarUrl,
            bio: input.bio,
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

  private ensureBatchStudentIdsUnique(users: BatchGenerateUsersDto['users']) {
    const studentIds = users
      .map((user) => user.studentId?.trim())
      .filter((studentId): studentId is string => Boolean(studentId));

    if (studentIds.length !== new Set(studentIds).size) {
      throw new BadRequestException('批量导入数据中存在重复学号');
    }
  }

  private getMailDomain() {
    return process.env.MAIL_DOMAIN ?? '3glab.local';
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

          await this.prisma.user.delete({
            where: { id: user.id },
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

  private async findSystemAdminUser(excludeUserId?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: excludeUserId
          ? {
              not: excludeUserId,
            }
          : undefined,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        roles: {
          some: {
            role: {
              code: 'SUPER_ADMIN',
            },
          },
        },
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!user) {
      throw new ConflictException('未找到可接收内容的系统管理员账号');
    }

    return user;
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
  ) {
    const recipients = await tx.internalMailRecipient.findMany({
      where: {
        userId: fromUserId,
      },
      select: {
        id: true,
        messageId: true,
        recipientType: true,
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
