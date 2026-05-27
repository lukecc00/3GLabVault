import { Injectable, Logger } from '@nestjs/common';
import { UserStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import nodemailer from 'nodemailer';

const REMINDER_THROTTLE_MS = 60 * 1000;
const SMTP_CONNECTION_TIMEOUT_MS = 10 * 1000;
const SMTP_GREETING_TIMEOUT_MS = 10 * 1000;
const SMTP_SOCKET_TIMEOUT_MS = 15 * 1000;

@Injectable()
export class ExternalMailReminderService {
  private readonly logger = new Logger(ExternalMailReminderService.name);
  private transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  isEnabled() {
    return (
      this.readBooleanEnv('EXTERNAL_MAIL_REMINDER_ENABLED', true) &&
      this.hasConfiguredValue(process.env.SMTP_USER) &&
      this.hasConfiguredValue(process.env.SMTP_PASS)
    );
  }

  async notifyNewInternalMailRecipients(
    recipientUserIds: string[],
    senderUserId: string,
    internalMailSubject: string,
  ) {
    const reminderSubject = this.formatInternalMailReminderSubject(internalMailSubject);

    await this.notifyUsers(recipientUserIds, senderUserId, {
      subject: `您有新的3GLabVault邮件待处理：${reminderSubject}`,
      buildTextContent: (realName) =>
        this.buildInternalMailTextContent(realName, reminderSubject),
      buildHtmlContent: (realName) =>
        this.buildInternalMailHtmlContent(realName, reminderSubject),
    });
  }

  async notifyKnowledgeApprovalPendingRecipients(input: {
    recipientUserIds: string[];
    senderUserId: string;
    spaceName: string;
    pageTitle: string;
  }) {
    const approvalUrl = this.getKnowledgeApprovalUrl();

    await this.notifyUsers(input.recipientUserIds, input.senderUserId, {
      subject: '您有一个权限审批待处理',
      buildTextContent: (realName) =>
        this.buildExternalReminderTextContent({
          realName,
          intro: '你收到了一条新的权限审批，请及时处理。',
          detail: `知识库「${input.spaceName}」中的页面「${input.pageTitle}」正在等待你的审批。`,
          actionText: '处理入口',
          actionUrl: approvalUrl || undefined,
        }),
      buildHtmlContent: (realName) =>
        this.buildExternalReminderHtmlContent({
          realName,
          intro: '你收到了一条新的权限审批，请及时处理。',
          detail: `知识库「${input.spaceName}」中的页面「${input.pageTitle}」正在等待你的审批。`,
          actionText: '处理入口',
          actionUrl: approvalUrl || undefined,
        }),
    });
  }

  async notifyKnowledgeApprovalReviewedRecipients(input: {
    recipientUserIds: string[];
    senderUserId: string;
    spaceName: string;
    pageTitle: string;
    action: 'APPROVE' | 'REJECT';
  }) {
    const approvalUrl = this.getKnowledgeApprovalUrl();
    const intro =
      input.action === 'APPROVE'
        ? '你的权限审批已经处理完成，结果为通过。'
        : '你的权限审批已经处理完成，结果为拒绝。';
    const detail =
      input.action === 'APPROVE'
        ? `你已获得知识库「${input.spaceName}」中页面「${input.pageTitle}」的编辑权限。`
        : `知识库「${input.spaceName}」中页面「${input.pageTitle}」的编辑权限申请未通过。`;

    await this.notifyUsers(input.recipientUserIds, input.senderUserId, {
      subject: '您的权限审批已处理完成',
      buildTextContent: (realName) =>
        this.buildExternalReminderTextContent({
          realName,
          intro,
          detail,
          actionText: '查看审批结果',
          actionUrl: approvalUrl || undefined,
        }),
      buildHtmlContent: (realName) =>
        this.buildExternalReminderHtmlContent({
          realName,
          intro,
          detail,
          actionText: '查看审批结果',
          actionUrl: approvalUrl || undefined,
        }),
    });
  }

  async notifyUsers(
    recipientUserIds: string[],
    senderUserId: string | undefined,
    message: {
      subject: string;
      buildTextContent: (realName: string) => string;
      buildHtmlContent: (realName: string) => string;
    },
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const uniqueUserIds = [...new Set(recipientUserIds)].filter(
      (userId) => userId && userId !== senderUserId,
    );

    if (uniqueUserIds.length === 0) {
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: uniqueUserIds,
        },
        status: UserStatus.ACTIVE,
        archivedAt: null,
        emailReminderEnabled: true,
        notificationEmail: {
          not: null,
        },
      },
      select: {
        id: true,
        realName: true,
        notificationEmail: true,
        lastExternalMailReminderAt: true,
      },
    });

    for (const user of users) {
      if (!user.notificationEmail) {
        continue;
      }

      const previousReminderAt = user.lastExternalMailReminderAt;
      const now = new Date();

      if (
        previousReminderAt &&
        now.getTime() - previousReminderAt.getTime() < REMINDER_THROTTLE_MS
      ) {
        continue;
      }

      const reserved = await this.prisma.user.updateMany({
        where: {
          id: user.id,
          lastExternalMailReminderAt: previousReminderAt,
        },
        data: {
          lastExternalMailReminderAt: now,
        },
      });

      if (reserved.count === 0) {
        continue;
      }

      try {
        await this.getTransporter().sendMail({
          from: this.getFromAddress(),
          to: user.notificationEmail,
          subject: message.subject,
          text: message.buildTextContent(user.realName),
          html: message.buildHtmlContent(user.realName),
        });
      } catch (error) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            lastExternalMailReminderAt: previousReminderAt,
          },
        });

        this.logger.error(
          `外部邮箱提醒发送失败 userId=${user.id} notificationEmail=${user.notificationEmail}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private buildInternalMailTextContent(realName: string, internalMailSubject: string) {
    const loginUrl = this.getMailPortalUrl();
    const lines = [
      `${realName}，您好：`,
      '',
      '您收到了一封来自3GLabVault新的站内内部邮件，请及时登录系统处理。',
      `站内邮件主题：${internalMailSubject}`,
      '此提醒邮件不包含任何站内邮件正文内容。',
    ];

    if (loginUrl) {
      lines.push('', `登录入口：${loginUrl}`);
    }

    lines.push('', '如非本人操作，请忽略此邮件。', '', '3GLabVault');

    return lines.join('\n');
  }

  private buildInternalMailHtmlContent(realName: string, internalMailSubject: string) {
    const loginUrl = this.getMailPortalUrl();
    const linkBlock = loginUrl
      ? `<p style="margin:16px 0 0;">登录入口：<a href="${loginUrl}">${loginUrl}</a></p>`
      : '';

    return [
      '<div style="font-family:Arial,sans-serif;line-height:1.7;color:#0f172a;">',
      `<p>${this.escapeHtml(realName)}，你好：</p>`,
      '<p>你收到了一封新的站内内部邮件，请及时登录系统处理。</p>',
      `<p>站内邮件主题：<strong>${this.escapeHtml(internalMailSubject)}</strong></p>`,
      '<p>此提醒邮件不包含任何站内邮件正文内容。</p>',
      linkBlock,
      '<p style="margin:16px 0 0;">如非本人操作，请忽略此邮件。</p>',
      '<p style="margin:16px 0 0;">3GLabVault</p>',
      '</div>',
    ].join('');
  }

  buildExternalReminderTextContent(input: {
    realName: string;
    intro: string;
    detail: string;
    actionText: string;
    actionUrl?: string;
  }) {
    const lines = [`${input.realName}，您好：`, '', input.intro, input.detail];

    if (input.actionUrl) {
      lines.push('', `${input.actionText}：${input.actionUrl}`);
    } else {
      lines.push('', input.actionText);
    }

    lines.push(
      '',
      '此提醒不包含站内正文详情，请登录系统查看。',
      '',
      '3GLabVault',
    );

    return lines.join('\n');
  }

  buildExternalReminderHtmlContent(input: {
    realName: string;
    intro: string;
    detail: string;
    actionText: string;
    actionUrl?: string;
  }) {
    const actionBlock = input.actionUrl
      ? `<p style="margin:16px 0 0;">${this.escapeHtml(input.actionText)}：<a href="${input.actionUrl}">${input.actionUrl}</a></p>`
      : `<p style="margin:16px 0 0;">${this.escapeHtml(input.actionText)}</p>`;

    return [
      '<div style="font-family:Arial,sans-serif;line-height:1.7;color:#0f172a;">',
      `<p>${this.escapeHtml(input.realName)}，您好：</p>`,
      `<p>${this.escapeHtml(input.intro)}</p>`,
      `<p>${this.escapeHtml(input.detail)}</p>`,
      actionBlock,
      '<p style="margin:16px 0 0;">此提醒不包含站内正文详情，请登录系统查看。</p>',
      '<p style="margin:16px 0 0;">3GLabVault</p>',
      '</div>',
    ].join('');
  }

  private getTransporter() {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST?.trim() || 'smtp.qq.com',
        port: this.getPort(),
        secure: this.readBooleanEnv('SMTP_SECURE', true),
        connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
        auth: {
          user: this.getAuthUser(),
          pass: this.getAuthPassword(),
        },
      });
    }

    return this.transporter;
  }

  private formatInternalMailReminderSubject(value: string) {
    const normalized = value.replace(/[\r\n]+/g, ' ').trim() || '无主题';

    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
  }

  private getMailPortalUrl() {
    const baseUrl = process.env.APP_BASE_URL?.trim();

    if (!baseUrl) {
      return '';
    }

    return `${baseUrl.replace(/\/$/, '')}/portal/mail`;
  }

  getKnowledgeApprovalUrl() {
    const baseUrl = process.env.APP_BASE_URL?.trim();

    if (!baseUrl) {
      return '';
    }

    return `${baseUrl.replace(/\/$/, '')}/portal/knowledge/approvals`;
  }

  private getFromAddress() {
    return process.env.SMTP_FROM?.trim() || this.getAuthUser();
  }

  private getAuthUser() {
    return process.env.SMTP_USER?.trim() || '';
  }

  private getAuthPassword() {
    return process.env.SMTP_PASS?.trim() || '';
  }

  private getPort() {
    const rawPort = Number(process.env.SMTP_PORT ?? 465);
    return Number.isFinite(rawPort) ? rawPort : 465;
  }

  private readBooleanEnv(name: string, defaultValue: boolean) {
    const rawValue = process.env[name]?.trim().toLowerCase();

    if (!rawValue) {
      return defaultValue;
    }

    return !['0', 'false', 'off', 'no'].includes(rawValue);
  }

  private hasConfiguredValue(value: string | undefined) {
    return Boolean(value?.trim());
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
