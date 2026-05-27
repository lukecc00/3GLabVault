"use client";

import Link from "next/link";
import type { InternalMailMessageDetail } from "@/lib/contracts";
import { MailMessageBody } from "./mail-message-body";

interface MailMessageReaderProps {
  message: InternalMailMessageDetail;
  headerLabel?: string;
  backHref?: string;
  backLabel?: string;
  openHref?: string;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "未发送";
  }

  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildComposeHref(
  mode: "reply" | "forward",
  message: InternalMailMessageDetail,
) {
  const params = new URLSearchParams({
    mode,
    messageId: message.id,
  });

  return `/portal/mail/compose?${params.toString()}`;
}

function renderRecipientLines(
  message: InternalMailMessageDetail,
  recipientType: "TO" | "CC",
) {
  return message.recipients.filter((recipient) => recipient.recipientType === recipientType);
}

function buildArchivedSourceNotice(message: InternalMailMessageDetail) {
  const archivedSourceEntry = message.currentUserMailboxEntries.find((entry) =>
    Boolean(entry.archivedSourceUserId),
  );

  if (!archivedSourceEntry) {
    return null;
  }

  const name = archivedSourceEntry.archivedSourceUserName?.trim();
  return name ? `来自 ${name} 用户归档内容` : "来自归档用户内容";
}

function RecipientChips({
  recipients,
}: {
  recipients: ReturnType<typeof renderRecipientLines>;
}) {
  if (recipients.length === 0) {
    return <div className="text-sm text-slate-400">未填写</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {recipients.map((recipient) => (
        <div
          key={recipient.id}
          className="min-w-0 rounded-xl border border-white/8 bg-slate-950/45 px-3 py-2"
        >
          <div className="text-sm font-medium text-slate-100">{recipient.user.realName}</div>
          <div className="break-all text-xs leading-5 text-slate-400">
            {recipient.user.email}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MailMessageReader({
  message,
  headerLabel,
  backHref,
  backLabel,
  openHref,
}: MailMessageReaderProps) {
  const toRecipients = renderRecipientLines(message, "TO");
  const ccRecipients = renderRecipientLines(message, "CC");
  const archivedSourceNotice = buildArchivedSourceNotice(message);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="app-eyebrow app-eyebrow-neutral">
              {headerLabel ?? (message.isDraft ? "草稿" : "邮件")}
            </div>
            {message.currentUserMailboxEntry?.starredAt ? (
              <div className="app-eyebrow app-eyebrow-amber">已星标</div>
            ) : null}
            {!message.currentUserMailboxEntry?.readAt &&
            message.currentUserMailboxEntry?.recipientType !== "SENDER" ? (
              <div className="app-eyebrow app-eyebrow-sky">未读</div>
            ) : null}
          </div>
          <h2 className="mt-4 max-w-[22ch] text-3xl font-semibold tracking-[-0.03em] text-balance text-foreground-strong">
            {message.subject}
          </h2>
          <div className="mt-4 grid gap-3 text-sm text-foreground-muted sm:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">发件人</div>
              <div className="mt-2 break-all text-sm font-medium text-foreground-strong">
                {message.sender.realName}
              </div>
              <div className="mt-1 break-all text-sm text-foreground-soft">
                {message.sender.email}
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">时间</div>
              <div className="mt-2 text-sm font-medium text-foreground-strong tabular-nums">
                {formatDateTime(message.sentAt ?? message.updatedAt)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {backHref ? (
            <Link href={backHref} className="app-button-ghost">
              {backLabel ?? "返回列表"}
            </Link>
          ) : null}
          {openHref ? (
            <Link href={openHref} className="app-button-secondary">
              打开完整阅读页
            </Link>
          ) : null}
          {!message.isDraft ? (
            <>
              <Link href={buildComposeHref("reply", message)} className="app-button-secondary">
                回复
              </Link>
              <Link
                href={buildComposeHref("forward", message)}
                className="app-button-secondary"
              >
                转发
              </Link>
            </>
          ) : (
            <Link
              href={`/portal/mail/compose?draftId=${message.id}`}
              className="app-button-secondary"
            >
              继续编辑
            </Link>
          )}
        </div>
      </div>

      {(message.replyToMessage || message.forwardOfMessage) ? (
        <div className="text-sm text-foreground-muted">
          {message.replyToMessage ? (
            <div className="break-all">
              回复自：{message.replyToMessage.sender.realName} / {message.replyToMessage.subject}
            </div>
          ) : null}
          {message.forwardOfMessage ? (
            <div className={message.replyToMessage ? "mt-2 break-all" : "break-all"}>
              转发自：{message.forwardOfMessage.sender.realName} /{" "}
              {message.forwardOfMessage.subject}
            </div>
          ) : null}
        </div>
      ) : null}

      {archivedSourceNotice ? (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          <div className="font-medium text-amber-50">归档接管提醒</div>
          <div className="mt-1">{archivedSourceNotice}，请按需筛选、清理或归档，避免管理员邮箱堆积过多历史邮件。</div>
        </section>
      ) : null}

      <section className="app-panel-muted p-4">
        <div className="grid gap-4 md:grid-cols-[72px_minmax(0,1fr)] md:items-start">
          <div className="text-sm font-medium text-foreground-strong md:pt-2">收件人</div>
          <RecipientChips recipients={toRecipients} />
          <div className="text-sm font-medium text-foreground-strong md:pt-2">抄送</div>
          <RecipientChips recipients={ccRecipients} />
        </div>
      </section>

      <article className="app-panel-muted p-6">
        <MailMessageBody markdown={message.bodyMarkdown} />
      </article>
    </div>
  );
}
