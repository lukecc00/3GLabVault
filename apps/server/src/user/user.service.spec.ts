import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { GroupType, MembershipRole, UserStatus } from '../generated/prisma';
import { RestoreArchivedContentTarget } from './dto/restore-archived-content.dto';
import { UserService } from './user.service';

describe('UserService', () => {
  const createService = () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
      },
      role: {
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      group: {
        findMany: jest.fn(),
      },
      userRole: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
      },
      userGroupMembership: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      knowledgePage: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      internalMailThread: {
        updateMany: jest.fn(),
      },
      internalMailMessage: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      internalMailRecipient: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const groupService = {};
    const mailcowService = {
      isEnabled: jest.fn().mockReturnValue(false),
      updateMailbox: jest.fn(),
    };

    const service = new UserService(
      prisma as never,
      groupService as never,
      mailcowService as never,
    );

    return {
      service,
      prisma,
      mailcowService,
    };
  };

  it('阻止通过修改身份移除 xiyou3g 的系统管理员权限', async () => {
    const { service, prisma } = createService();

    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        archivedAt: null,
      })
      .mockResolvedValueOnce({
        username: 'xiyou3g',
        roles: [{ role: { code: 'SUPER_ADMIN' } }],
      });
    prisma.role.count.mockResolvedValue(1);
    prisma.role.findUnique.mockResolvedValue({
      id: 'role-super-admin',
    });

    await expect(
      service.updateRoles('user-1', {
        roleIds: ['role-member'],
      }),
    ).rejects.toThrow(
      new ConflictException('账号 xiyou3g 不能被移除系统管理员权限'),
    );
  });

  it('阻止通过审核流程移除 xiyou3g 的系统管理员权限', async () => {
    const { service, prisma } = createService();

    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        username: 'xiyou3g',
        email: 'xiyou3g@3glab',
        realName: '实验室管理员',
        studentId: null,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        archivedAt: null,
        mustChangePassword: false,
        mailboxProvisioningStatus: 'PENDING',
        mailboxLastError: null,
      })
      .mockResolvedValueOnce({
        username: 'xiyou3g',
        roles: [{ role: { code: 'SUPER_ADMIN' } }],
      });
    prisma.role.count.mockResolvedValue(1);
    prisma.role.findUnique.mockResolvedValue({
      id: 'role-super-admin',
    });

    await expect(
      service.review('user-1', {
        status: UserStatus.ACTIVE,
        roleIds: ['role-member'],
      }),
    ).rejects.toThrow(
      new ConflictException('账号 xiyou3g 不能被移除系统管理员权限'),
    );
  });

  it('批量生成账号时会在重名拼音后追加两位随机数字', async () => {
    const { service, prisma } = createService();
    const reservedUsernames = new Set<string>();

    prisma.user.findFirst
      .mockResolvedValueOnce({ id: 'existing-user' })
      .mockResolvedValueOnce(null);

    const identity = await (
      service as unknown as {
        generateUniqueIdentity: (
          tx: unknown,
          realName: string,
          reservedUsernames: Set<string>,
        ) => Promise<{ username: string; email: string }>;
      }
    ).generateUniqueIdentity(prisma, '张三', reservedUsernames);

    expect(identity.username).toMatch(/^zhangsan\d{2}$/);
    expect(identity.email).toBe(`${identity.username}@3glab`);
    expect(reservedUsernames.has(identity.username)).toBe(true);
  });

  it('批量生成账号要求统一初始密码至少 8 位', async () => {
    const { service } = createService();

    await expect(
      service.batchGenerate({
        groupIds: [],
        password: ' 1234567 ',
        users: [
          {
            realName: '张三',
            notificationEmail: 'zhangsan@example.com',
          },
        ],
      }),
    ).rejects.toThrow('统一初始密码至少需要 8 位');
  });

  it('批量生成账号要求至少绑定一个群组', async () => {
    const { service } = createService();

    await expect(
      service.batchGenerate({
        groupIds: [],
        password: 'temporary123',
        users: [
          {
            realName: '张三',
            notificationEmail: 'zhangsan@example.com',
          },
        ],
      }),
    ).rejects.toThrow('请至少绑定一个群组');
  });

  it('年级管理员查询用户列表时只会看到自己所在年级', async () => {
    const { service, prisma } = createService();
    const currentUser = {
      id: 'grade-admin-1',
      username: 'gradeadmin',
      email: 'gradeadmin@3glab',
      realName: '23级管理员',
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      roleCodes: ['GRADE_ADMIN'],
      groupIds: ['grade-23', 'direction-web'],
    };

    jest
      .spyOn(service as unknown as { runExpiredArchiveCleanup: () => Promise<void> }, 'runExpiredArchiveCleanup')
      .mockResolvedValue(undefined);
    prisma.group.findMany.mockResolvedValue([{ id: 'grade-23' }]);
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll(currentUser);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          memberships: {
            some: {
              groupId: {
                in: ['grade-23'],
              },
            },
          },
        },
      }),
    );
  });

  it('年级管理员不能给成员分配更高范围的管理员角色', async () => {
    const { service, prisma } = createService();
    const currentUser = {
      id: 'grade-admin-1',
      username: 'gradeadmin',
      email: 'gradeadmin@3glab',
      realName: '23级管理员',
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      roleCodes: ['GRADE_ADMIN'],
      groupIds: ['grade-23'],
    };

    prisma.group.findMany.mockResolvedValue([{ id: 'grade-23' }]);
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        archivedAt: null,
      })
      .mockResolvedValueOnce({
        username: 'member-1',
        roles: [],
      });
    prisma.role.count.mockResolvedValue(1);
    prisma.role.findMany.mockResolvedValue([{ code: 'LAB_ADMIN' }]);

    await expect(
      service.updateRoles(
        'user-1',
        {
          roleIds: ['role-lab-admin'],
        },
        currentUser,
      ),
    ).rejects.toThrow(
      new ForbiddenException('年级管理员只能分配普通成员或年级管理员角色'),
    );
  });

  it('注册时不允许同时选择多个年级组', async () => {
    const { service, prisma } = createService();

    prisma.group.findMany.mockResolvedValue([
      { id: 'grade-22' },
      { id: 'grade-23' },
    ]);

    await expect(
      service.register({
        realName: '张三',
        namePinyin: 'zhangsan',
        password: 'temporary123',
        notificationEmail: 'zhangsan@example.com',
        groupIds: ['grade-22', 'grade-23'],
      }),
    ).rejects.toThrow(
      new BadRequestException('一个用户只能选择一个年级组'),
    );
  });

  it('审核分组时不允许同时分配多个年级组', async () => {
    const { service, prisma } = createService();

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'member',
      email: 'member@3glab',
      realName: '成员',
      studentId: null,
      passwordHash: 'hash',
      status: UserStatus.PENDING,
      archivedAt: null,
      mustChangePassword: false,
      mailboxProvisioningStatus: 'PENDING',
      mailboxLastError: null,
    });
    prisma.group.findMany.mockResolvedValue([
      { id: 'grade-22' },
      { id: 'grade-23' },
    ]);

    await expect(
      service.review('user-1', {
        status: UserStatus.ACTIVE,
        groupIds: ['grade-22', 'grade-23'],
      }),
    ).rejects.toThrow(
      new BadRequestException('一个用户只能选择一个年级组'),
    );
  });

  it('归档用户时会把知识页作者和编辑转移给对应方向管理员', async () => {
    const { service, prisma } = createService();
    const archivedUserId = 'user-archived';
    const directionGroupId = 'group-android';
    const directionAdminId = 'user-direction-admin';

    jest
      .spyOn(service as any, 'runExpiredArchiveCleanup')
      .mockImplementation(async () => undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: archivedUserId,
    } as never);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: archivedUserId,
      email: 'member@3glab',
      realName: '归档成员',
      status: UserStatus.ACTIVE,
      archivedAt: null,
      mailboxProvisioningStatus: 'PENDING',
      memberships: [
        {
          groupId: directionGroupId,
          membershipRole: MembershipRole.MEMBER,
          group: {
            id: directionGroupId,
            type: GroupType.DIRECTION,
          },
        },
      ],
      roles: [],
    });
    prisma.knowledgePage.findMany.mockResolvedValue([
      {
        id: 'page-1',
        authorId: archivedUserId,
        editorId: archivedUserId,
        space: {
          ownerGroup: {
            id: directionGroupId,
            type: GroupType.DIRECTION,
          },
        },
      },
    ]);
    prisma.user.findMany
      .mockResolvedValueOnce([
        {
          id: directionAdminId,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          memberships: [
            {
              groupId: directionGroupId,
              membershipRole: MembershipRole.MANAGER,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: directionAdminId,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          roles: [{ role: { code: 'DIRECTION_ADMIN' } }],
        },
      ]);

    await service.archive(archivedUserId, {
      id: 'current-admin',
      username: 'admin',
      email: 'admin@3glab',
      realName: '当前管理员',
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      roleCodes: ['SUPER_ADMIN'],
      groupIds: [],
    });

    expect(prisma.knowledgePage.update).toHaveBeenCalledWith({
      where: { id: 'page-1' },
      data: {
        authorId: directionAdminId,
        editorId: directionAdminId,
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: archivedUserId },
      data: expect.objectContaining({
        status: UserStatus.DISABLED,
        archivedAt: expect.any(Date),
        archiveExpiresAt: expect.any(Date),
      }),
    });
  });

  it('恢复归档内容到方向管理员时会转移邮件与知识页', async () => {
    const { service, prisma } = createService();
    const archivedUserId = 'user-archived';
    const directionGroupId = 'group-android';
    const directionAdminId = 'user-direction-admin';

    jest
      .spyOn(service as any, 'runExpiredArchiveCleanup')
      .mockImplementation(async () => undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: archivedUserId,
    } as never);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: archivedUserId,
      realName: '归档成员',
      archivedAt: new Date('2027-01-01T00:00:00.000Z'),
      archiveExpiresAt: new Date('2027-03-02T00:00:00.000Z'),
      contentRestoredAt: null,
      memberships: [
        {
          groupId: directionGroupId,
          membershipRole: MembershipRole.MEMBER,
          group: {
            id: directionGroupId,
            type: GroupType.DIRECTION,
          },
        },
      ],
    });
    prisma.knowledgePage.findMany.mockResolvedValue([
      {
        id: 'page-1',
        authorId: archivedUserId,
        editorId: archivedUserId,
        space: {
          ownerGroup: {
            id: directionGroupId,
            type: GroupType.DIRECTION,
          },
        },
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: directionAdminId,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        memberships: [
          {
            groupId: directionGroupId,
            membershipRole: MembershipRole.MANAGER,
          },
        ],
      },
    ]);
    prisma.internalMailMessage.findMany.mockResolvedValue([]);
    prisma.internalMailRecipient.findMany.mockResolvedValue([]);

    await service.restoreArchivedContent(archivedUserId, {
      target: RestoreArchivedContentTarget.DIRECTION_ADMIN,
    });

    expect(prisma.knowledgePage.update).toHaveBeenCalledWith({
      where: { id: 'page-1' },
      data: {
        authorId: directionAdminId,
        editorId: directionAdminId,
      },
    });
    expect(prisma.internalMailThread.updateMany).toHaveBeenCalledWith({
      where: { createdById: archivedUserId },
      data: { createdById: directionAdminId },
    });
    expect(prisma.internalMailMessage.updateMany).toHaveBeenCalledWith({
      where: { senderId: archivedUserId },
      data: { senderId: directionAdminId },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: archivedUserId },
      data: expect.objectContaining({
        contentRestoredAt: expect.any(Date),
        archiveExpiresAt: expect.any(Date),
      }),
    });
  });

  it('重新启用归档账号时会恢复为可登录状态并补齐成员角色', async () => {
    const { service, prisma } = createService();
    const archivedUserId = 'user-archived';

    jest
      .spyOn(service as any, 'runExpiredArchiveCleanup')
      .mockImplementation(async () => undefined);
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: archivedUserId,
    } as never);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.user.findUnique.mockResolvedValue({
      id: archivedUserId,
      username: 'member',
      email: 'member@3glab',
      realName: '归档成员',
      studentId: null,
      passwordHash: 'hash',
      status: UserStatus.DISABLED,
      archivedAt: new Date('2027-01-01T00:00:00.000Z'),
      archiveExpiresAt: new Date('2027-03-02T00:00:00.000Z'),
      contentRestoredAt: null,
      mustChangePassword: false,
      mailboxProvisioningStatus: 'PENDING',
      mailboxLastError: null,
    });
    prisma.userRole.count.mockResolvedValue(0);
    prisma.role.findUnique.mockResolvedValue({
      id: 'role-member',
    });

    await service.reactivate(archivedUserId);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: archivedUserId },
      data: {
        status: UserStatus.ACTIVE,
        archivedAt: null,
        archiveExpiresAt: null,
        contentRestoredAt: null,
      },
    });
    expect(prisma.userRole.upsert).toHaveBeenCalledWith({
      where: {
        userId_roleId: {
          userId: archivedUserId,
          roleId: 'role-member',
        },
      },
      update: {},
      create: {
        userId: archivedUserId,
        roleId: 'role-member',
      },
    });
  });
});
