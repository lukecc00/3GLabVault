import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InternalMailDeliverySourceType,
  InternalMailRecipientType,
  Prisma,
  UserStatus,
} from '../generated/prisma';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInternalMailDto } from './dto/create-internal-mail.dto';
import { QueryInternalMailListDto } from './dto/query-internal-mail-list.dto';
import { UpdateInternalMailMailboxDto } from './dto/update-internal-mail-mailbox.dto';

type MailboxFolder = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash';

const internalMailUserSelect = {
  id: true,
  username: true,
  email: true,
  realName: true,
} satisfies Prisma.UserSelect;

const internalMailComposerUserSelect = {
  ...internalMailUserSelect,
  memberships: {
    select: {
      group: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

const internalMailRecipientDetailSelect = {
  id: true,
  userId: true,
  recipientType: true,
  deliverySourceType: true,
  deliverySourceId: true,
  readAt: true,
  starredAt: true,
  archivedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: internalMailUserSelect,
  },
} satisfies Prisma.InternalMailRecipientSelect;

const internalMailMessageReferenceSelect = {
  id: true,
  threadId: true,
  subject: true,
  senderId: true,
  sentAt: true,
  isDraft: true,
  sender: {
    select: internalMailUserSelect,
  },
} satisfies Prisma.InternalMailMessageSelect;

const internalMailDetailSelect = {
  id: true,
  threadId: true,
  subject: true,
  bodyMarkdown: true,
  draftToUserIds: true,
  draftCcUserIds: true,
  draftToGroupIds: true,
  draftCcGroupIds: true,
  sentAt: true,
  isDraft: true,
  createdAt: true,
  updatedAt: true,
  senderId: true,
  sender: {
    select: internalMailUserSelect,
  },
  replyToMessageId: true,
  forwardOfMessageId: true,
  replyToMessage: {
    select: internalMailMessageReferenceSelect,
  },
  forwardOfMessage: {
    select: internalMailMessageReferenceSelect,
  },
  recipients: {
    orderBy: [{ recipientType: 'asc' }, { createdAt: 'asc' }],
    select: internalMailRecipientDetailSelect,
  },
} satisfies Prisma.InternalMailMessageSelect;

@Injectable()
export class InternalMailService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(currentUser: AuthenticatedUser) {
    const [inbox, unread, sent, drafts, archive, trash, starred] =
      await Promise.all([
        this.countMailboxEntries('inbox', currentUser.id),
        this.countMailboxEntries('inbox', currentUser.id, {
          read: 'unread',
        }),
        this.countMailboxEntries('sent', currentUser.id),
        this.countMailboxEntries('drafts', currentUser.id),
        this.countMailboxEntries('archive', currentUser.id),
        this.countMailboxEntries('trash', currentUser.id),
        this.prisma.internalMailRecipient.count({
          where: {
            userId: currentUser.id,
            starredAt: {
              not: null,
            },
            deletedAt: null,
          },
        }),
      ]);

    return {
      inbox,
      unread,
      sent,
      drafts,
      archive,
      trash,
      starred,
    };
  }

  async getComposerOptions() {
    const [users, groups] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          archivedAt: null,
        },
        select: internalMailComposerUserSelect,
        orderBy: [{ realName: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.group.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
        },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      users,
      groups,
    };
  }

  getInbox(currentUser: AuthenticatedUser, query: QueryInternalMailListDto) {
    return this.getMailboxEntries('inbox', currentUser, query);
  }

  getSent(currentUser: AuthenticatedUser, query: QueryInternalMailListDto) {
    return this.getMailboxEntries('sent', currentUser, query);
  }

  getDrafts(currentUser: AuthenticatedUser, query: QueryInternalMailListDto) {
    return this.getMailboxEntries('drafts', currentUser, query);
  }

  getArchive(currentUser: AuthenticatedUser, query: QueryInternalMailListDto) {
    return this.getMailboxEntries('archive', currentUser, query);
  }

  getTrash(currentUser: AuthenticatedUser, query: QueryInternalMailListDto) {
    return this.getMailboxEntries('trash', currentUser, query);
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    return this.findAccessibleMessage(id, currentUser, true);
  }

  async markMailboxEntryAsRead(
    mailboxEntryId: string,
    currentUser: AuthenticatedUser,
  ) {
    const mailboxEntry = await this.prisma.internalMailRecipient.findUnique({
      where: { id: mailboxEntryId },
      select: {
        id: true,
        messageId: true,
        userId: true,
        recipientType: true,
        readAt: true,
      },
    });

    if (!mailboxEntry || mailboxEntry.userId !== currentUser.id) {
      throw new NotFoundException('邮件不存在或当前用户无权访问');
    }

    if (mailboxEntry.recipientType === InternalMailRecipientType.SENDER) {
      throw new BadRequestException('发件箱或草稿箱邮件无需标记为已读');
    }

    if (!mailboxEntry.readAt) {
      await this.prisma.internalMailRecipient.update({
        where: { id: mailboxEntryId },
        data: {
          readAt: new Date(),
        },
      });
    }

    return this.findAccessibleMessage(
      mailboxEntry.messageId,
      currentUser,
      false,
    );
  }

  async updateMailboxEntry(
    mailboxEntryId: string,
    dto: UpdateInternalMailMailboxDto,
    currentUser: AuthenticatedUser,
  ) {
    const mailboxEntry = await this.prisma.internalMailRecipient.findUnique({
      where: { id: mailboxEntryId },
      select: {
        id: true,
        messageId: true,
        userId: true,
      },
    });

    if (!mailboxEntry || mailboxEntry.userId !== currentUser.id) {
      throw new NotFoundException('邮件不存在或当前用户无权访问');
    }

    const now = new Date();
    const data: Prisma.InternalMailRecipientUpdateInput = {};

    switch (dto.action) {
      case 'STAR':
        data.starredAt = now;
        break;
      case 'UNSTAR':
        data.starredAt = null;
        break;
      case 'ARCHIVE':
        data.archivedAt = now;
        data.deletedAt = null;
        break;
      case 'DELETE':
        data.deletedAt = now;
        break;
      case 'RESTORE':
        data.deletedAt = null;
        data.archivedAt = null;
        break;
      default:
        break;
    }

    await this.prisma.internalMailRecipient.update({
      where: { id: mailboxEntryId },
      data,
    });

    return this.findAccessibleMessage(
      mailboxEntry.messageId,
      currentUser,
      false,
    );
  }

  async create(dto: CreateInternalMailDto, currentUser: AuthenticatedUser) {
    const subject = dto.subject.trim() || '无主题';
    const bodyMarkdown = dto.bodyMarkdown.trim();
    const saveAsDraft = dto.saveAsDraft ?? false;
    const toUserIds = this.normalizeIds(dto.toUserIds);
    const ccUserIds = this.normalizeIds(dto.ccUserIds);
    const toGroupIds = this.normalizeIds(dto.toGroupIds);
    const ccGroupIds = this.normalizeIds(dto.ccGroupIds);

    if (
      !saveAsDraft &&
      toUserIds.length === 0 &&
      ccUserIds.length === 0 &&
      toGroupIds.length === 0 &&
      ccGroupIds.length === 0
    ) {
      throw new BadRequestException('请至少选择一个内部收件人或群组');
    }

    const directUserIds = [...new Set([...toUserIds, ...ccUserIds])];
    const groupIds = [...new Set([...toGroupIds, ...ccGroupIds])];

    const [directUsers, , replyToMessage, forwardOfMessage] = await Promise.all(
      [
        this.getActiveUsersByIds(directUserIds),
        this.getGroupsByIds(groupIds),
        this.getMessageReference(dto.replyToMessageId),
        this.getMessageReference(dto.forwardOfMessageId),
      ],
    );

    const groupMembers =
      !saveAsDraft && groupIds.length > 0
        ? await this.prisma.userGroupMembership.findMany({
            where: {
              groupId: {
                in: groupIds,
              },
              user: {
                status: UserStatus.ACTIVE,
                archivedAt: null,
              },
            },
            select: {
              groupId: true,
              user: {
                select: internalMailUserSelect,
              },
            },
          })
        : [];

    const recipientMap = this.buildRecipientMap(
      directUsers,
      groupMembers,
      toUserIds,
      ccUserIds,
      toGroupIds,
      ccGroupIds,
    );

    if (!saveAsDraft && recipientMap.size === 0) {
      throw new BadRequestException('目标群组下没有可接收内部邮件的有效成员');
    }

    const now = new Date();
    const threadId =
      dto.threadId?.trim() ||
      replyToMessage?.threadId ||
      (await this.createThread(subject, currentUser.id)).id;

    const draftTargetSnapshot = {
      draftToUserIds: toUserIds,
      draftCcUserIds: ccUserIds,
      draftToGroupIds: toGroupIds,
      draftCcGroupIds: ccGroupIds,
    };

    if (dto.draftId?.trim()) {
      const existingDraft = await this.prisma.internalMailMessage.findFirst({
        where: {
          id: dto.draftId.trim(),
          senderId: currentUser.id,
          isDraft: true,
        },
        select: {
          id: true,
          threadId: true,
        },
      });

      if (!existingDraft) {
        throw new NotFoundException('草稿不存在或当前用户无权编辑');
      }

      const targetThreadId =
        dto.threadId?.trim() || existingDraft.threadId || threadId;

      await this.prisma.$transaction(async (tx) => {
        await tx.internalMailMessage.update({
          where: { id: existingDraft.id },
          data: {
            threadId: targetThreadId,
            subject,
            bodyMarkdown,
            ...draftTargetSnapshot,
            isDraft: saveAsDraft,
            sentAt: saveAsDraft ? null : now,
            replyToMessageId: replyToMessage?.id ?? null,
            forwardOfMessageId: forwardOfMessage?.id ?? null,
          },
        });

        await tx.internalMailRecipient.upsert({
          where: {
            messageId_userId_recipientType: {
              messageId: existingDraft.id,
              userId: currentUser.id,
              recipientType: InternalMailRecipientType.SENDER,
            },
          },
          create: {
            messageId: existingDraft.id,
            userId: currentUser.id,
            recipientType: InternalMailRecipientType.SENDER,
            deliverySourceType: InternalMailDeliverySourceType.USER,
            deliverySourceId: currentUser.id,
            readAt: now,
          },
          update: {
            deletedAt: null,
            readAt: now,
          },
        });

        await tx.internalMailRecipient.deleteMany({
          where: {
            messageId: existingDraft.id,
            recipientType: {
              not: InternalMailRecipientType.SENDER,
            },
          },
        });

        if (!saveAsDraft && recipientMap.size > 0) {
          await tx.internalMailRecipient.createMany({
            data: Array.from(recipientMap.entries()).map(
              ([userId, recipient]) => ({
                messageId: existingDraft.id,
                userId,
                recipientType: recipient.recipientType,
                deliverySourceType: recipient.deliverySourceType,
                deliverySourceId: recipient.deliverySourceId,
              }),
            ),
          });
        }

        await tx.internalMailThread.update({
          where: { id: targetThreadId },
          data: {
            subject,
            lastMessageAt: now,
          },
        });
      });

      return this.findAccessibleMessage(existingDraft.id, currentUser, false);
    }

    const createdMessage = await this.prisma.$transaction(async (tx) => {
      const message = await tx.internalMailMessage.create({
        data: {
          threadId,
          senderId: currentUser.id,
          subject,
          bodyMarkdown,
          ...draftTargetSnapshot,
          isDraft: saveAsDraft,
          sentAt: saveAsDraft ? null : now,
          replyToMessageId: replyToMessage?.id ?? null,
          forwardOfMessageId: forwardOfMessage?.id ?? null,
          recipients: {
            create: [
              {
                userId: currentUser.id,
                recipientType: InternalMailRecipientType.SENDER,
                deliverySourceType: InternalMailDeliverySourceType.USER,
                deliverySourceId: currentUser.id,
                readAt: now,
              },
              ...(!saveAsDraft
                ? Array.from(recipientMap.entries()).map(
                    ([userId, recipient]) => ({
                      userId,
                      recipientType: recipient.recipientType,
                      deliverySourceType: recipient.deliverySourceType,
                      deliverySourceId: recipient.deliverySourceId,
                    }),
                  )
                : []),
            ],
          },
        },
        select: {
          id: true,
        },
      });

      await tx.internalMailThread.update({
        where: { id: threadId },
        data: {
          subject,
          lastMessageAt: now,
        },
      });

      return message;
    });

    return this.findAccessibleMessage(createdMessage.id, currentUser, false);
  }

  private async getMailboxEntries(
    folder: MailboxFolder,
    currentUser: AuthenticatedUser,
    query: QueryInternalMailListDto,
  ) {
    const entries = await this.prisma.internalMailRecipient.findMany({
      where: this.buildMailboxWhere(folder, currentUser.id, query),
      orderBy:
        folder === 'drafts'
          ? { message: { updatedAt: 'desc' } }
          : { message: { sentAt: 'desc' } },
      select: {
        ...internalMailRecipientDetailSelect,
        message: {
          select: {
            id: true,
            threadId: true,
            subject: true,
            bodyMarkdown: true,
            sentAt: true,
            isDraft: true,
            updatedAt: true,
            sender: {
              select: internalMailUserSelect,
            },
            recipients: {
              where: {
                recipientType: {
                  not: InternalMailRecipientType.SENDER,
                },
              },
              orderBy: [{ recipientType: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                recipientType: true,
                user: {
                  select: internalMailUserSelect,
                },
              },
            },
          },
        },
      },
    });

    return entries.map((entry) => ({
      id: entry.message.id,
      threadId: entry.message.threadId,
      subject: entry.message.subject,
      preview: this.buildPreview(entry.message.bodyMarkdown),
      sentAt: entry.message.sentAt,
      updatedAt: entry.message.updatedAt,
      isDraft: entry.message.isDraft,
      sender: entry.message.sender,
      mailboxEntry: {
        id: entry.id,
        recipientType: entry.recipientType,
        readAt: entry.readAt,
        starredAt: entry.starredAt,
        archivedAt: entry.archivedAt,
        deletedAt: entry.deletedAt,
      },
      recipientCount: entry.message.recipients.length,
      recipients: entry.message.recipients,
    }));
  }

  private async countMailboxEntries(
    folder: MailboxFolder,
    userId: string,
    query: QueryInternalMailListDto = {},
  ) {
    return this.prisma.internalMailRecipient.count({
      where: this.buildMailboxWhere(folder, userId, query),
    });
  }

  private buildMailboxWhere(
    folder: MailboxFolder,
    userId: string,
    query: QueryInternalMailListDto,
  ): Prisma.InternalMailRecipientWhereInput {
    const where: Prisma.InternalMailRecipientWhereInput = {
      userId,
    };

    switch (folder) {
      case 'inbox':
        where.recipientType = {
          in: [InternalMailRecipientType.TO, InternalMailRecipientType.CC],
        };
        where.archivedAt = null;
        where.deletedAt = null;
        where.message = {
          isDraft: false,
        };
        break;
      case 'sent':
        where.recipientType = InternalMailRecipientType.SENDER;
        where.archivedAt = null;
        where.deletedAt = null;
        where.message = {
          isDraft: false,
        };
        break;
      case 'drafts':
        where.recipientType = InternalMailRecipientType.SENDER;
        where.deletedAt = null;
        where.message = {
          isDraft: true,
        };
        break;
      case 'archive':
        where.archivedAt = {
          not: null,
        };
        where.deletedAt = null;
        break;
      case 'trash':
        where.deletedAt = {
          not: null,
        };
        break;
      default:
        break;
    }

    if (query.starred === 'true') {
      where.starredAt = {
        not: null,
      };
    } else if (query.starred === 'false') {
      where.starredAt = null;
    }

    if (query.read === 'read') {
      where.readAt = {
        not: null,
      };
    } else if (query.read === 'unread') {
      where.readAt = null;
    }

    const keyword = query.keyword?.trim();

    if (keyword) {
      const contains = {
        contains: keyword,
        mode: 'insensitive' as const,
      };

      where.AND = [
        {
          OR: [
            {
              message: {
                subject: contains,
              },
            },
            {
              message: {
                bodyMarkdown: contains,
              },
            },
            {
              message: {
                sender: {
                  realName: contains,
                },
              },
            },
            {
              message: {
                sender: {
                  email: contains,
                },
              },
            },
            {
              message: {
                recipients: {
                  some: {
                    recipientType: {
                      in: [
                        InternalMailRecipientType.TO,
                        InternalMailRecipientType.CC,
                      ],
                    },
                    user: {
                      OR: [
                        {
                          realName: contains,
                        },
                        {
                          email: contains,
                        },
                        {
                          username: contains,
                        },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      ];
    }

    return where;
  }

  private async findAccessibleMessage(
    id: string,
    currentUser: AuthenticatedUser,
    markRead: boolean,
  ) {
    const message = await this.prisma.internalMailMessage.findUnique({
      where: { id },
      select: internalMailDetailSelect,
    });

    if (!message) {
      throw new NotFoundException('邮件不存在');
    }

    const currentUserMailboxEntries = message.recipients.filter(
      (recipient) => recipient.userId === currentUser.id,
    );

    if (currentUserMailboxEntries.length === 0) {
      throw new NotFoundException('邮件不存在或当前用户无权访问');
    }

    const readTarget = currentUserMailboxEntries.find(
      (entry) =>
        entry.recipientType !== InternalMailRecipientType.SENDER &&
        !entry.readAt,
    );

    if (markRead && readTarget) {
      const readAt = new Date();

      await this.prisma.internalMailRecipient.update({
        where: { id: readTarget.id },
        data: {
          readAt,
        },
      });

      readTarget.readAt = readAt;
    }

    const currentUserMailboxEntry =
      currentUserMailboxEntries.find(
        (entry) => entry.recipientType !== InternalMailRecipientType.SENDER,
      ) ?? currentUserMailboxEntries[0];

    return {
      ...message,
      currentUserMailboxEntry,
      currentUserMailboxEntries,
    };
  }

  private async getActiveUsersByIds(userIds: string[]) {
    if (userIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
        archivedAt: null,
      },
      select: {
        ...internalMailUserSelect,
        status: true,
      },
    });

    const userMap = new Map(users.map((user) => [user.id, user]));

    for (const userId of userIds) {
      const user = userMap.get(userId);

      if (!user) {
        throw new NotFoundException(`收件用户不存在：${userId}`);
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new BadRequestException(`收件用户未启用：${user.realName}`);
      }
    }

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      realName: user.realName,
    }));
  }

  private async getGroupsByIds(groupIds: string[]) {
    if (groupIds.length === 0) {
      return [];
    }

    const groups = await this.prisma.group.findMany({
      where: {
        id: {
          in: groupIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const groupMap = new Map(groups.map((group) => [group.id, group]));

    for (const groupId of groupIds) {
      if (!groupMap.has(groupId)) {
        throw new NotFoundException(`群组不存在：${groupId}`);
      }
    }

    return groups;
  }

  private async getMessageReference(messageId?: string) {
    if (!messageId?.trim()) {
      return null;
    }

    const message = await this.prisma.internalMailMessage.findUnique({
      where: { id: messageId.trim() },
      select: {
        id: true,
        threadId: true,
      },
    });

    if (!message) {
      throw new NotFoundException('引用邮件不存在');
    }

    return message;
  }

  private async createThread(subject: string, createdById: string) {
    return this.prisma.internalMailThread.create({
      data: {
        subject,
        createdById,
        lastMessageAt: new Date(),
      },
      select: {
        id: true,
      },
    });
  }

  private normalizeIds(values?: string[]) {
    if (!values) {
      return [];
    }

    return Array.from(
      new Set(values.map((value) => value.trim()).filter(Boolean)),
    );
  }

  private buildRecipientMap(
    directUsers: Array<{
      id: string;
      username: string | null;
      email: string;
      realName: string;
    }>,
    groupMembers: Array<{
      groupId: string;
      user: {
        id: string;
        username: string | null;
        email: string;
        realName: string;
      };
    }>,
    toUserIds: string[],
    ccUserIds: string[],
    toGroupIds: string[],
    ccGroupIds: string[],
  ) {
    const recipientMap = new Map<
      string,
      {
        recipientType: InternalMailRecipientType;
        deliverySourceType: InternalMailDeliverySourceType;
        deliverySourceId: string | null;
      }
    >();
    const directUserMap = new Map(directUsers.map((user) => [user.id, user]));

    for (const userId of ccUserIds) {
      const user = directUserMap.get(userId);

      if (user) {
        this.upsertRecipient(
          recipientMap,
          user.id,
          InternalMailRecipientType.CC,
          InternalMailDeliverySourceType.USER,
          user.id,
        );
      }
    }

    for (const userId of toUserIds) {
      const user = directUserMap.get(userId);

      if (user) {
        this.upsertRecipient(
          recipientMap,
          user.id,
          InternalMailRecipientType.TO,
          InternalMailDeliverySourceType.USER,
          user.id,
        );
      }
    }

    for (const membership of groupMembers) {
      const recipientType = ccGroupIds.includes(membership.groupId)
        ? InternalMailRecipientType.CC
        : InternalMailRecipientType.TO;
      const groupChosenAsTo = toGroupIds.includes(membership.groupId);

      this.upsertRecipient(
        recipientMap,
        membership.user.id,
        groupChosenAsTo ? InternalMailRecipientType.TO : recipientType,
        InternalMailDeliverySourceType.GROUP,
        membership.groupId,
      );
    }

    return recipientMap;
  }

  private upsertRecipient(
    recipientMap: Map<
      string,
      {
        recipientType: InternalMailRecipientType;
        deliverySourceType: InternalMailDeliverySourceType;
        deliverySourceId: string | null;
      }
    >,
    userId: string,
    recipientType: InternalMailRecipientType,
    deliverySourceType: InternalMailDeliverySourceType,
    deliverySourceId: string | null,
  ) {
    const existing = recipientMap.get(userId);

    if (!existing) {
      recipientMap.set(userId, {
        recipientType,
        deliverySourceType,
        deliverySourceId,
      });
      return;
    }

    const nextRecipientType =
      existing.recipientType === InternalMailRecipientType.TO ||
      recipientType === InternalMailRecipientType.TO
        ? InternalMailRecipientType.TO
        : InternalMailRecipientType.CC;
    const preferDirectUser =
      existing.deliverySourceType !== InternalMailDeliverySourceType.USER &&
      deliverySourceType === InternalMailDeliverySourceType.USER;

    recipientMap.set(userId, {
      recipientType: nextRecipientType,
      deliverySourceType: preferDirectUser
        ? deliverySourceType
        : existing.deliverySourceType,
      deliverySourceId: preferDirectUser
        ? deliverySourceId
        : existing.deliverySourceId,
    });
  }

  private buildPreview(content: string) {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 120);
  }
}
