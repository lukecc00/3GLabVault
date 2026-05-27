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
        count: jest.fn(),
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
      memberships: [],
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
      memberships: [],
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
    prisma.group.count.mockResolvedValue(2);

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
    prisma.group.count.mockResolvedValue(2);

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
      memberships: [],
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

  it('恢复归档内容到方向管理员时会优先转移给同年级方向管理员', async () => {
    const { service, prisma } = createService();
    const archivedUserId = 'user-archived';
    const directionGroupId = 'group-android';
    const gradeGroupId = 'group-grade-23';
    const directionAdminId = 'user-direction-admin';
    const previousGradeAdminId = 'user-direction-admin-22';

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
            code: 'ANDROID',
            name: 'Android组',
            type: GroupType.DIRECTION,
          },
        },
        {
          groupId: gradeGroupId,
          membershipRole: MembershipRole.MEMBER,
          group: {
            id: gradeGroupId,
            code: 'GRADE_23',
            name: '23级',
            type: GroupType.GRADE,
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
        id: previousGradeAdminId,
        createdAt: new Date('2023-01-01T00:00:00.000Z'),
        memberships: [
          {
            groupId: directionGroupId,
            membershipRole: MembershipRole.MANAGER,
            group: {
              id: directionGroupId,
              code: 'ANDROID',
              name: 'Android组',
              type: GroupType.DIRECTION,
            },
          },
          {
            groupId: 'group-grade-22',
            membershipRole: MembershipRole.MEMBER,
            group: {
              id: 'group-grade-22',
              code: 'GRADE_22',
              name: '22级',
              type: GroupType.GRADE,
            },
          },
        ],
      },
      {
        id: directionAdminId,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        memberships: [
          {
            groupId: directionGroupId,
            membershipRole: MembershipRole.MANAGER,
            group: {
              id: directionGroupId,
              code: 'ANDROID',
              name: 'Android组',
              type: GroupType.DIRECTION,
            },
          },
          {
            groupId: gradeGroupId,
            membershipRole: MembershipRole.MEMBER,
            group: {
              id: gradeGroupId,
              code: 'GRADE_23',
              name: '23级',
              type: GroupType.GRADE,
            },
          },
        ],
      },
    ]);
    prisma.internalMailMessage.findMany.mockResolvedValue([]);
    prisma.internalMailRecipient.findMany.mockResolvedValue([
      {
        id: 'recipient-1',
        messageId: 'message-1',
        recipientType: 'TO',
        archivedSourceUserId: null,
        archivedSourceUserName: null,
        archivedSourceUserEmail: null,
        archivedSourceAt: null,
        readAt: null,
        starredAt: null,
        archivedAt: null,
        deletedAt: null,
      },
    ]);
    prisma.internalMailRecipient.findUnique.mockResolvedValue(null);

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
    expect(prisma.internalMailRecipient.update).toHaveBeenCalledWith({
      where: { id: 'recipient-1' },
      data: expect.objectContaining({
        userId: directionAdminId,
        archivedSourceUserId: archivedUserId,
        archivedSourceUserName: '归档成员',
        archivedSourceUserEmail: null,
        archivedSourceAt: expect.any(Date),
      }),
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: archivedUserId },
      data: expect.objectContaining({
        contentRestoredAt: expect.any(Date),
        archiveExpiresAt: expect.any(Date),
      }),
    });
  });

  it('恢复归档内容到方向管理员时会在缺少同年级管理员时回退到上一个年级', async () => {
    const { service, prisma } = createService();
    const archivedUserId = 'user-archived';
    const directionGroupId = 'group-android';
    const previousGradeAdminId = 'user-direction-admin-22';

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
            code: 'ANDROID',
            name: 'Android组',
            type: GroupType.DIRECTION,
          },
        },
        {
          groupId: 'group-grade-23',
          membershipRole: MembershipRole.MEMBER,
          group: {
            id: 'group-grade-23',
            code: 'GRADE_23',
            name: '23级',
            type: GroupType.GRADE,
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
        id: previousGradeAdminId,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        memberships: [
          {
            groupId: directionGroupId,
            membershipRole: MembershipRole.MANAGER,
            group: {
              id: directionGroupId,
              code: 'ANDROID',
              name: 'Android组',
              type: GroupType.DIRECTION,
            },
          },
          {
            groupId: 'group-grade-22',
            membershipRole: MembershipRole.MEMBER,
            group: {
              id: 'group-grade-22',
              code: 'GRADE_22',
              name: '22级',
              type: GroupType.GRADE,
            },
          },
        ],
      },
    ]);
    prisma.internalMailMessage.findMany.mockResolvedValue([]);
    prisma.internalMailRecipient.findMany.mockResolvedValue([
      {
        id: 'recipient-1',
        messageId: 'message-1',
        recipientType: 'TO',
        archivedSourceUserId: null,
        archivedSourceUserName: null,
        archivedSourceUserEmail: null,
        archivedSourceAt: null,
        readAt: null,
        starredAt: null,
        archivedAt: null,
        deletedAt: null,
      },
    ]);
    prisma.internalMailRecipient.findUnique.mockResolvedValue(null);

    await service.restoreArchivedContent(archivedUserId, {
      target: RestoreArchivedContentTarget.DIRECTION_ADMIN,
    });

    expect(prisma.knowledgePage.update).toHaveBeenCalledWith({
      where: { id: 'page-1' },
      data: {
        authorId: previousGradeAdminId,
        editorId: previousGradeAdminId,
      },
    });
    expect(prisma.internalMailThread.updateMany).toHaveBeenCalledWith({
      where: { createdById: archivedUserId },
      data: { createdById: previousGradeAdminId },
    });
  });

  it('重新启用归档账号时即使内容已转移也会恢复为可登录状态并补齐成员角色', async () => {
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
      contentRestoredAt: new Date('2027-01-05T00:00:00.000Z'),
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
