const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');

loadEnvFile();

const prisma = new PrismaClient();

const DEFAULT_OLD_DOMAIN = '3glab.local';
const DEFAULT_NEW_DOMAIN = process.env.MAIL_DOMAIN || '3glab';

function parseArgs(argv) {
  const options = {
    from: DEFAULT_OLD_DOMAIN,
    to: DEFAULT_NEW_DOMAIN,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length).trim().toLowerCase();
      continue;
    }

    if (arg.startsWith('--to=')) {
      options.to = arg.slice('--to='.length).trim().toLowerCase();
      continue;
    }
  }

  return options;
}

function ensureDomain(domain, label) {
  if (!domain || domain.includes('@') || domain.includes(' ')) {
    throw new Error(`${label} 不合法：${domain || '(empty)'}`);
  }
}

function hasMailcowConfig() {
  const baseUrl = process.env.MAILCOW_API_BASE_URL || '';
  const apiKey = process.env.MAILCOW_API_KEY || '';

  return (
    baseUrl &&
    baseUrl !== 'https://mail.example.com' &&
    apiKey &&
    apiKey !== 'replace-with-read-write-api-key'
  );
}

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDomain(options.from, '旧域名');
  ensureDomain(options.to, '新域名');

  if (options.from === options.to) {
    throw new Error('旧域名和新域名相同，无需迁移');
  }

  const affectedUsers = await prisma.$queryRaw`
    SELECT
      id,
      username,
      "realName",
      email,
      "mailboxProvisioningStatus"
    FROM "User"
    WHERE email LIKE ${`%@${options.from}`}
    ORDER BY email ASC
  `;

  if (affectedUsers.length === 0) {
    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          from: options.from,
          to: options.to,
          updatedCount: 0,
          users: [],
        },
        null,
        2,
      ),
    );
    return;
  }

  const updates = affectedUsers.map((user) => {
    const localPart = user.email.split('@')[0];
    return {
      ...user,
      nextEmail: `${localPart}@${options.to}`,
    };
  });

  const nextEmailCounts = new Map();
  for (const entry of updates) {
    nextEmailCounts.set(
      entry.nextEmail,
      (nextEmailCounts.get(entry.nextEmail) || 0) + 1,
    );
  }

  const duplicateTargets = Array.from(nextEmailCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([email]) => email);

  if (duplicateTargets.length > 0) {
    throw new Error(
      `迁移后将产生重复邮箱：${duplicateTargets.join(', ')}`,
    );
  }

  const targetEmails = updates.map((entry) => entry.nextEmail);
  const conflicts = await prisma.$queryRaw`
    SELECT
      id,
      username,
      "realName",
      email
    FROM "User"
    WHERE email IN (${Prisma.join(targetEmails)})
      AND id NOT IN (${Prisma.join(updates.map((entry) => entry.id))})
    ORDER BY email ASC
  `;

  if (conflicts.length > 0) {
    throw new Error(
      `以下目标邮箱已存在，迁移中止：${conflicts
        .map((user) => user.email)
        .join(', ')}`,
    );
  }

  const mailboxLastError = hasMailcowConfig()
    ? '内部邮箱域名已迁移为新尾缀，请通过重置密码或邮箱同步流程重新创建邮箱账户。'
    : null;

  if (!options.dryRun) {
    await prisma.$transaction(async (tx) => {
      for (const entry of updates) {
        await tx.$executeRaw`
          UPDATE "User"
          SET
            email = ${entry.nextEmail},
            "mailboxProvisioningStatus" = 'PENDING',
            "mailboxProvisionedAt" = NULL,
            "mailboxLastError" = ${mailboxLastError}
          WHERE id = ${entry.id}
        `;
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun: options.dryRun,
        from: options.from,
        to: options.to,
        updatedCount: updates.length,
        users: updates.map((entry) => ({
          id: entry.id,
          username: entry.username,
          realName: entry.realName,
          previousEmail: entry.email,
          nextEmail: entry.nextEmail,
          previousMailboxProvisioningStatus: entry.mailboxProvisioningStatus,
          nextMailboxProvisioningStatus: 'PENDING',
        })),
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
