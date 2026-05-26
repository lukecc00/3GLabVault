const {
  MailboxProvisioningStatus,
  PageStatus,
  PrismaClient,
  GroupType,
  MembershipRole,
  SpaceVisibility,
  UserStatus,
} = require('../src/generated/prisma');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);

  return `${salt}:${derivedKey.toString('hex')}`;
}

function generateTemporaryPassword(length = 18) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

async function main() {
  const mailDomain = process.env.MAIL_DOMAIN || '3glab.local';
  const adminUsername = process.env.ADMIN_INITIAL_USERNAME || 'xiyou3g';
  const adminEmail =
    process.env.ADMIN_INITIAL_EMAIL || `${adminUsername}@${mailDomain}`;
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'xiyou3gfz155';

  const roles = [
    {
      code: 'SUPER_ADMIN',
      name: '超级管理员',
      description: '系统全局管理角色',
      isSystem: true,
    },
    {
      code: 'LAB_ADMIN',
      name: '实验室管理员',
      description: '负责实验室层面的全局事务与成员管理',
      isSystem: true,
    },
    {
      code: 'DIRECTION_ADMIN',
      name: '方向管理员',
      description: '负责方向空间和成员管理',
      isSystem: true,
    },
    {
      code: 'GRADE_ADMIN',
      name: '年级管理员',
      description: '负责年级组织与通知管理',
      isSystem: true,
    },
    {
      code: 'MEMBER',
      name: '普通成员',
      description: '实验室普通成员基础角色',
      isSystem: true,
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      },
      create: role,
    });
  }

  const groups = [
    ['ANDROID', 'Android组', GroupType.DIRECTION],
    ['IOS', 'iOS组', GroupType.DIRECTION],
    ['WEB', 'Web组', GroupType.DIRECTION],
    ['SERVER', 'Server组', GroupType.DIRECTION],
    ['HARMONY', 'HarmonyOS组', GroupType.DIRECTION],
    ['GRADE_22', '22级', GroupType.GRADE],
    ['GRADE_23', '23级', GroupType.GRADE],
    ['GRADE_24', '24级', GroupType.GRADE],
  ];

  for (const [code, name, type] of groups) {
    await prisma.group.upsert({
      where: { code },
      update: {
        name,
        type,
      },
      create: {
        code,
        name,
        type,
      },
    });
  }

  const adminUserData = {
    email: adminEmail,
    realName: '实验室管理员',
    username: adminUsername,
    passwordHash: hashPassword(adminPassword),
    mustChangePassword: false,
    passwordUpdatedAt: new Date(),
    mailboxProvisioningStatus: MailboxProvisioningStatus.PENDING,
    status: UserStatus.ACTIVE,
  };

  const existingAdminUser = await prisma.user.findFirst({
    where: {
      OR: [{ username: adminUsername }, { email: adminEmail }],
    },
    select: {
      id: true,
    },
  });

  const adminUser = existingAdminUser
    ? await prisma.user.update({
        where: {
          id: existingAdminUser.id,
        },
        data: adminUserData,
      })
    : await prisma.user.create({
        data: adminUserData,
      });

  const [superAdminRole, labAdminRole, memberRole, serverGroup] = await Promise.all([
    prisma.role.findUniqueOrThrow({
      where: { code: 'SUPER_ADMIN' },
    }),
    prisma.role.findUniqueOrThrow({
      where: { code: 'LAB_ADMIN' },
    }),
    prisma.role.findUniqueOrThrow({
      where: { code: 'MEMBER' },
    }),
    prisma.group.findUniqueOrThrow({
      where: { code: 'SERVER' },
    }),
  ]);

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: superAdminRole.id,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: labAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: labAdminRole.id,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: memberRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: memberRole.id,
    },
  });

  await prisma.userGroupMembership.upsert({
    where: {
      userId_groupId: {
        userId: adminUser.id,
        groupId: serverGroup.id,
      },
    },
    update: {
      membershipRole: MembershipRole.MANAGER,
    },
    create: {
      userId: adminUser.id,
      groupId: serverGroup.id,
      membershipRole: MembershipRole.MANAGER,
    },
  });

  const publicSpace = await prisma.knowledgeSpace.upsert({
    where: { code: 'COMMON' },
    update: {
      slug: 'common',
      name: '公共空间',
      description: '跨方向共享知识与通用资料',
      visibility: SpaceVisibility.PUBLIC,
    },
    create: {
      code: 'COMMON',
      slug: 'common',
      name: '公共空间',
      description: '跨方向共享知识与通用资料',
      visibility: SpaceVisibility.PUBLIC,
    },
  });

  const directionSpaceMappings = [
    ['ANDROID', 'SPACE_ANDROID', 'android', 'Android 空间'],
    ['IOS', 'SPACE_IOS', 'ios', 'iOS 空间'],
    ['WEB', 'SPACE_WEB', 'web', 'Web 空间'],
    ['SERVER', 'SPACE_SERVER', 'server', 'Server 空间'],
    ['HARMONY', 'SPACE_HARMONYOS', 'harmonyos', 'HarmonyOS 空间'],
  ];

  for (const [groupCode, code, slug, name] of directionSpaceMappings) {
    const ownerGroup = await prisma.group.findUniqueOrThrow({
      where: { code: groupCode },
    });

    await prisma.knowledgeSpace.upsert({
      where: { code },
      update: {
        slug,
        name,
        ownerGroupId: ownerGroup.id,
        visibility: SpaceVisibility.GROUP_RESTRICTED,
      },
      create: {
        code,
        slug,
        name,
        ownerGroupId: ownerGroup.id,
        visibility: SpaceVisibility.GROUP_RESTRICTED,
      },
    });
  }

  await prisma.knowledgePage.upsert({
    where: {
      spaceId_slug: {
        spaceId: publicSpace.id,
        slug: 'welcome',
      },
    },
    update: {
      title: '欢迎使用 3GLabVault',
      summary: '知识库系统的默认欢迎页',
      contentMd: [
        '# 欢迎使用 3GLabVault',
        '',
        '这是实验室知识库的默认首页。',
        '',
        '- 可以按方向建立知识空间',
        '- 可以编写 Markdown 内容',
        '- 后续会接入权限、模板和邮件协同',
      ].join('\n'),
      tags: ['welcome', 'guide'],
      status: PageStatus.PUBLISHED,
      authorId: adminUser.id,
      editorId: adminUser.id,
      publishedAt: new Date(),
    },
    create: {
      spaceId: publicSpace.id,
      authorId: adminUser.id,
      editorId: adminUser.id,
      title: '欢迎使用 3GLabVault',
      slug: 'welcome',
      summary: '知识库系统的默认欢迎页',
      contentMd: [
        '# 欢迎使用 3GLabVault',
        '',
        '这是实验室知识库的默认首页。',
        '',
        '- 可以按方向建立知识空间',
        '- 可以编写 Markdown 内容',
        '- 后续会接入权限、模板和邮件协同',
      ].join('\n'),
      tags: ['welcome', 'guide'],
      status: PageStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
