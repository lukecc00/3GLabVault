import { ConflictException } from '@nestjs/common';
import { UserStatus } from '../generated/prisma';
import { UserService } from './user.service';

describe('UserService', () => {
  const createService = () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      role: {
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const groupService = {};
    const mailcowService = {
      isEnabled: jest.fn().mockReturnValue(false),
    };

    const service = new UserService(
      prisma as never,
      groupService as never,
      mailcowService as never,
    );

    return {
      service,
      prisma,
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
    ).rejects.toThrow(new ConflictException('账号 xiyou3g 不能被移除系统管理员权限'));
  });

  it('阻止通过审核流程移除 xiyou3g 的系统管理员权限', async () => {
    const { service, prisma } = createService();

    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        username: 'xiyou3g',
        email: 'xiyou3g@3glab.local',
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
    ).rejects.toThrow(new ConflictException('账号 xiyou3g 不能被移除系统管理员权限'));
  });
});
