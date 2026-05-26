const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];

  if (!username) {
    throw new Error('请提供用户名，例如：node scripts/grant-lab-admin.cjs xiyou3g');
  }

  const role = await prisma.role.upsert({
    where: { code: 'LAB_ADMIN' },
    update: {
      name: '实验室管理员',
      description: '负责实验室层面的全局事务与成员管理',
      isSystem: true,
    },
    create: {
      code: 'LAB_ADMIN',
      name: '实验室管理员',
      description: '负责实验室层面的全局事务与成员管理',
      isSystem: true,
    },
  });

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user) {
    throw new Error(`未找到用户名为 ${username} 的账号`);
  }

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: role.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: role.id,
    },
  });

  const updatedUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        username: updatedUser.username,
        email: updatedUser.email,
        roleCodes: updatedUser.roles.map((item) => item.role.code).sort(),
        roleNames: updatedUser.roles.map((item) => item.role.name).sort(),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
