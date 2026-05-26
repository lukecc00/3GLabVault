"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMailContext } from "./mail-context";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  InternalMailListItem,
  InternalMailMessageDetail,
  UpdateInternalMailMailboxPayload,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

type FolderKey = "inbox" | "sent" | "drafts" | "archive" | "trash";

interface MailFolderPageProps {
  folder: FolderKey;
  title: string;
  description: string;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "未发送";
  }

  return new Date(value).toLocaleString("zh-CN", {
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

export function MailFolderPage({
  folder,
  title,
  description,
}: MailFolderPageProps) {
  const { refreshSummary } = useMailContext();
  const [items, setItems] = useState<InternalMailListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<InternalMailMessageDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [pendingDeleteMail, setPendingDeleteMail] = useState<{
    mailboxEntryId: string;
    subject: string;
  } | null>(null);
  const [keyword, setKeyword] = useState("");
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all");
  const [starredFilter, setStarredFilter] = useState<"all" | "starred" | "unstarred">(
    "all",
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (keyword.trim()) {
      params.set("keyword", keyword.trim());
    }

    if (readFilter !== "all") {
      params.set("read", readFilter);
    }

    if (starredFilter !== "all") {
      params.set("starred", starredFilter === "starred" ? "true" : "false");
    }

    return params.toString();
  }, [keyword, readFilter, starredFilter]);

  async function loadList() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchApi<InternalMailListItem[]>(
        `/internal-mail/${folder}${queryString ? `?${queryString}` : ""}`,
      );
      setItems(data);

      if (!data.some((item) => item.id === selectedId)) {
        const nextSelectedId = data[0]?.id ?? null;
        setSelectedId(nextSelectedId);

        if (!nextSelectedId) {
          setSelectedMessage(null);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "无法获取邮件列表");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(messageId: string) {
    setLoadingDetail(true);

    try {
      const detail = await fetchApi<InternalMailMessageDetail>(
        `/internal-mail/messages/${messageId}`,
      );
      setSelectedMessage(detail);
      await refreshSummary();
    } catch (loadError) {
      setMessage(loadError instanceof ApiError ? loadError.message : "无法获取邮件详情");
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await loadList();
    })();
    // queryString already captures keyword/filter state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, queryString]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    void (async () => {
      await loadDetail(selectedId);
    })();
    // selectedId change is the intended fetch trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleMailboxAction(
    mailboxEntryId: string,
    payload: UpdateInternalMailMailboxPayload,
  ) {
    setBusyActionId(mailboxEntryId);
    setMessage(null);

    try {
      const detail = await sendJson<
        InternalMailMessageDetail,
        UpdateInternalMailMailboxPayload
      >(`/internal-mail/mailbox/${mailboxEntryId}`, "PATCH", payload);

      setSelectedMessage(detail);
      await Promise.all([loadList(), refreshSummary()]);
    } catch (actionError) {
      setMessage(actionError instanceof ApiError ? actionError.message : "邮件操作失败");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleMarkRead(mailboxEntryId: string) {
    setBusyActionId(mailboxEntryId);
    setMessage(null);

    try {
      const detail = await sendJson<InternalMailMessageDetail, Record<string, never>>(
        `/internal-mail/mailbox/${mailboxEntryId}/read`,
        "PATCH",
        {},
      );
      setSelectedMessage(detail);
      await Promise.all([loadList(), refreshSummary()]);
    } catch (actionError) {
      setMessage(
        actionError instanceof ApiError ? actionError.message : "标记已读失败",
      );
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleConfirmDeleteMail() {
    if (!pendingDeleteMail) {
      return;
    }

    await handleMailboxAction(pendingDeleteMail.mailboxEntryId, {
      action: "DELETE",
    });
    setPendingDeleteMail(null);
  }

  function renderEmptyState() {
    const actionMap: Record<FolderKey, { title: string; actionLabel: string; href: string }> =
      {
        inbox: {
          title: "收件箱目前为空",
          actionLabel: "去写第一封内部邮件",
          href: "/portal/mail/compose",
        },
        sent: {
          title: "还没有已发送邮件",
          actionLabel: "开始写邮件",
          href: "/portal/mail/compose",
        },
        drafts: {
          title: "当前没有草稿",
          actionLabel: "新建草稿",
          href: "/portal/mail/compose",
        },
        archive: {
          title: "还没有归档邮件",
          actionLabel: "查看收件箱",
          href: "/portal/mail/inbox",
        },
        trash: {
          title: "回收站是空的",
          actionLabel: "查看收件箱",
          href: "/portal/mail/inbox",
        },
      };

    const current = actionMap[folder];

    return (
      <div className="app-panel-muted flex min-h-[260px] flex-col items-center justify-center px-6 py-10 text-center">
        <div className="app-eyebrow app-eyebrow-neutral">Mailbox Empty</div>
        <h2 className="mt-5 text-2xl font-semibold text-balance text-slate-50">
          {current.title}
        </h2>
        <p className="mt-3 max-w-[48ch] text-sm leading-7 text-slate-300 text-pretty">
          你可以切换箱体继续处理邮件，或直接新建一封内部邮件开始新的沟通。
        </p>
        <Link href={current.href} className="app-button-primary mt-6">
          {current.actionLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pendingDeleteMail ? (
        <DangerConfirmDialog
          open
          title="删除邮件"
          description="该操作会将当前邮件移入回收站。为防止误操作，请输入确认文案后继续。"
          confirmText="确认删除该邮件"
          confirmLabel="请输入确认文案"
          actionLabel="确认删除"
          busy={busyActionId === pendingDeleteMail.mailboxEntryId}
          onClose={() => {
            if (busyActionId !== pendingDeleteMail.mailboxEntryId) {
              setPendingDeleteMail(null);
            }
          }}
          onConfirm={handleConfirmDeleteMail}
        />
      ) : null}
      <section className="app-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="app-eyebrow app-eyebrow-neutral">{title}</div>
            <h2 className="mt-4 text-2xl font-semibold text-balance text-slate-50">
              {title}
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-7 text-slate-300 text-pretty">
              {description}
            </p>
          </div>
          <Link href="/portal/mail/compose" className="app-button-primary">
            写邮件
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="text-sm">
            <div className="mb-2 text-slate-300">搜索主题 / 内容 / 人员</div>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="app-input"
              placeholder="输入关键词搜索"
            />
          </label>
          <label className="text-sm">
            <div className="mb-2 text-slate-300">已读状态</div>
            <select
              value={readFilter}
              onChange={(event) =>
                setReadFilter(event.target.value as "all" | "read" | "unread")
              }
              className="app-select"
            >
              <option value="all">全部</option>
              <option value="read">已读</option>
              <option value="unread">未读</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="mb-2 text-slate-300">星标状态</div>
            <select
              value={starredFilter}
              onChange={(event) =>
                setStarredFilter(
                  event.target.value as "all" | "starred" | "unstarred",
                )
              }
              className="app-select"
            >
              <option value="all">全部</option>
              <option value="starred">仅星标</option>
              <option value="unstarred">仅未星标</option>
            </select>
          </label>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </section>

      {loading ? (
        <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="app-panel p-4">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="app-panel-muted h-24 animate-pulse" />
              ))}
            </div>
          </div>
          <div className="app-panel-muted min-h-[480px] animate-pulse" />
        </section>
      ) : items.length === 0 ? (
        renderEmptyState()
      ) : (
        <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="app-panel p-4">
            <div className="space-y-3">
              {items.map((item) => {
                const selected = item.id === selectedId;
                const busy = item.mailboxEntry.id === busyActionId;
                const recipientsText = item.recipients
                  .slice(0, 3)
                  .map((recipient) => recipient.user.realName)
                  .join("、");

                return (
                  <button
                    key={item.mailboxEntry.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "block w-full rounded-[24px] border px-4 py-4 text-left transition-colors duration-200",
                      selected
                        ? "border-sky-400/25 bg-sky-400/10"
                        : "border-white/8 bg-white/3 hover:bg-white/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.mailboxEntry.readAt ? null : (
                            <span className="app-eyebrow app-eyebrow-sky">未读</span>
                          )}
                          {item.mailboxEntry.starredAt ? (
                            <span className="app-eyebrow app-eyebrow-amber">星标</span>
                          ) : null}
                          {item.isDraft ? (
                            <span className="app-eyebrow app-eyebrow-neutral">草稿</span>
                          ) : null}
                        </div>
                        <div className="mt-3 truncate text-base font-medium text-slate-100">
                          {item.subject}
                        </div>
                        <div className="mt-1 truncate text-sm text-slate-400">
                          {folder === "sent" || folder === "drafts"
                            ? `收件人：${recipientsText || "尚未填写"}`
                            : `发件人：${item.sender.realName}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-400 tabular-nums">
                        {formatDateTime(item.sentAt ?? item.updatedAt)}
                      </div>
                    </div>
                    <div className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
                      {item.preview || "（无正文）"}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {!item.mailboxEntry.readAt &&
                      item.mailboxEntry.recipientType !== "SENDER" ? (
                        <button
                          type="button"
                          className="app-button-ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMarkRead(item.mailboxEntry.id);
                          }}
                        >
                          {busy ? "处理中..." : "标记已读"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="app-button-ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleMailboxAction(item.mailboxEntry.id, {
                            action: item.mailboxEntry.starredAt ? "UNSTAR" : "STAR",
                          });
                        }}
                      >
                        {item.mailboxEntry.starredAt ? "取消星标" : "星标"}
                      </button>
                      {folder !== "archive" && folder !== "trash" ? (
                        <button
                          type="button"
                          className="app-button-ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMailboxAction(item.mailboxEntry.id, {
                              action: "ARCHIVE",
                            });
                          }}
                        >
                          归档
                        </button>
                      ) : null}
                      {folder !== "trash" ? (
                        <button
                          type="button"
                          className="app-button-ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDeleteMail({
                              mailboxEntryId: item.mailboxEntry.id,
                              subject: item.subject,
                            });
                          }}
                        >
                          删除
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="app-button-ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleMailboxAction(item.mailboxEntry.id, {
                              action: "RESTORE",
                            });
                          }}
                        >
                          恢复
                        </button>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="app-panel p-6">
            {selectedMessage && !loadingDetail ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="app-eyebrow app-eyebrow-neutral">
                      {selectedMessage.isDraft ? "草稿" : "邮件详情"}
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold text-balance text-slate-50">
                      {selectedMessage.subject}
                    </h3>
                    <div className="mt-3 text-sm leading-7 text-slate-300 text-pretty">
                      发件人：{selectedMessage.sender.realName}（{selectedMessage.sender.email}）
                    </div>
                    <div className="text-sm leading-7 text-slate-400 tabular-nums">
                      时间：{formatDateTime(selectedMessage.sentAt ?? selectedMessage.updatedAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {!selectedMessage.isDraft ? (
                      <>
                        <Link
                          href={buildComposeHref("reply", selectedMessage)}
                          className="app-button-secondary"
                        >
                          回复
                        </Link>
                        <Link
                          href={buildComposeHref("forward", selectedMessage)}
                          className="app-button-secondary"
                        >
                          转发
                        </Link>
                      </>
                    ) : (
                      <Link
                        href={`/portal/mail/compose?draftId=${selectedMessage.id}`}
                        className="app-button-secondary"
                      >
                        继续编辑
                      </Link>
                    )}
                  </div>
                </div>

                {(selectedMessage.replyToMessage || selectedMessage.forwardOfMessage) ? (
                  <div className="app-panel-muted p-4 text-sm text-slate-300">
                    {selectedMessage.replyToMessage ? (
                      <div>
                        回复自：{selectedMessage.replyToMessage.sender.realName} /{" "}
                        {selectedMessage.replyToMessage.subject}
                      </div>
                    ) : null}
                    {selectedMessage.forwardOfMessage ? (
                      <div className="mt-2">
                        转发自：{selectedMessage.forwardOfMessage.sender.realName} /{" "}
                        {selectedMessage.forwardOfMessage.subject}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="app-panel-muted p-4">
                    <div className="text-sm font-medium text-slate-100">收件人</div>
                    <div className="mt-3 text-sm leading-7 text-slate-300 text-pretty">
                      {selectedMessage.recipients
                        .filter((recipient) => recipient.recipientType === "TO")
                        .map((recipient) => `${recipient.user.realName} <${recipient.user.email}>`)
                        .join("；") || "未填写"}
                    </div>
                  </div>
                  <div className="app-panel-muted p-4">
                    <div className="text-sm font-medium text-slate-100">抄送</div>
                    <div className="mt-3 text-sm leading-7 text-slate-300 text-pretty">
                      {selectedMessage.recipients
                        .filter((recipient) => recipient.recipientType === "CC")
                        .map((recipient) => `${recipient.user.realName} <${recipient.user.email}>`)
                        .join("；") || "未填写"}
                    </div>
                  </div>
                </div>

                <article className="app-panel-muted p-5">
                  <div className="prose prose-invert max-w-none text-pretty">
                    {selectedMessage.bodyMarkdown ? (
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-slate-200">
                        {selectedMessage.bodyMarkdown}
                      </pre>
                    ) : (
                      <div className="text-sm text-slate-400">（无正文）</div>
                    )}
                  </div>
                </article>
              </div>
            ) : (
              <div className="app-panel-muted flex min-h-[420px] items-center justify-center text-center">
                <div>
                  <div className="app-eyebrow app-eyebrow-neutral">
                    {loadingDetail ? "Loading" : "Mail Viewer"}
                  </div>
                  <div className="mt-4 text-xl font-semibold text-slate-50">
                    {loadingDetail ? "正在加载邮件内容..." : "选择左侧邮件查看详情"}
                  </div>
                  <p className="mt-3 max-w-[42ch] text-sm leading-7 text-slate-300 text-pretty">
                    列表支持搜索、已读未读筛选、星标、归档和删除恢复，右侧阅读区会展示完整邮件内容。
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
