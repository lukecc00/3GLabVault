"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMailContext } from "./mail-context";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  BulkUpdateInternalMailMailboxPayload,
  InternalMailListItem,
  UpdateInternalMailMailboxPayload,
} from "@/lib/contracts";
import { renderMarkdownToPlainText } from "@/lib/markdown";

type FolderKey = "inbox" | "sent" | "drafts" | "archive" | "trash";
const EMPTY_TRASH_ACTION_ID = "__empty-trash__";

type PendingDangerAction =
  | {
      kind: "delete";
      mailboxEntryId: string;
      subject: string;
    }
  | {
      kind: "purge";
      mailboxEntryId: string;
      subject: string;
    }
  | {
      kind: "emptyTrash";
      itemCount: number;
    }
  | {
      kind: "bulkDeleteArchived";
      itemCount: number;
    };

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
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildMessageViewHref(folder: FolderKey, messageId: string) {
  const params = new URLSearchParams({
    folder,
    messageId,
  });

  return `/portal/mail/view?${params.toString()}`;
}

function buildRecipientSummary(item: InternalMailListItem, folder: FolderKey) {
  if (folder === "sent" || folder === "drafts") {
    const names = item.recipients.slice(0, 3).map((recipient) => recipient.user.realName);
    const remaining = Math.max(item.recipientCount - names.length, 0);

    if (names.length === 0) {
      return "未填写收件人";
    }

    return `收件人：${names.join("、")}${remaining > 0 ? ` 等 ${item.recipientCount} 人` : ""}`;
  }

  return `发件人：${item.sender.realName}`;
}

function buildListPreview(preview: string) {
  const renderedText = renderMarkdownToPlainText(preview || "")
    .replace(/\s+/g, " ")
    .trim();

  return renderedText || "（无正文）";
}

function buildArchivedSourceLabel(item: InternalMailListItem) {
  const name = item.mailboxEntry.archivedSourceUserName?.trim();
  return name ? `来自 ${name} 用户归档内容` : "来自归档用户内容";
}

export function MailFolderPage({
  folder,
  title,
  description,
}: MailFolderPageProps) {
  const { refreshSummary } = useMailContext();
  const [items, setItems] = useState<InternalMailListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  const [keyword, setKeyword] = useState("");
  const [archivedSourceFilter, setArchivedSourceFilter] = useState<
    "all" | "archived" | "direct"
  >("all");
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all");
  const [starredFilter, setStarredFilter] = useState<"all" | "starred" | "unstarred">(
    "all",
  );
  const latestListRequestIdRef = useRef(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (keyword.trim()) {
      params.set("keyword", keyword.trim());
    }

    if (archivedSourceFilter !== "all") {
      params.set("archivedSource", archivedSourceFilter);
    }

    if (readFilter !== "all") {
      params.set("read", readFilter);
    }

    if (starredFilter !== "all") {
      params.set("starred", starredFilter === "starred" ? "true" : "false");
    }

    return params.toString();
  }, [archivedSourceFilter, keyword, readFilter, starredFilter]);

  async function loadList() {
    const requestId = ++latestListRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await fetchApi<InternalMailListItem[]>(
        `/internal-mail/${folder}${queryString ? `?${queryString}` : ""}`,
      );

      if (latestListRequestIdRef.current !== requestId) {
        return;
      }

      setItems(data);
    } catch (loadError) {
      if (latestListRequestIdRef.current !== requestId) {
        return;
      }

      setError(loadError instanceof ApiError ? loadError.message : "无法获取邮件列表");
    } finally {
      if (latestListRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void (async () => {
      await loadList();
    })();
    // queryString already captures keyword/filter state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, queryString]);

  async function handleMailboxAction(
    mailboxEntryId: string,
    payload: UpdateInternalMailMailboxPayload,
  ) {
    setBusyActionId(mailboxEntryId);
    setMessage(null);
    setError(null);

    try {
      await sendJson<unknown, UpdateInternalMailMailboxPayload>(
        `/internal-mail/mailbox/${mailboxEntryId}`,
        "PATCH",
        payload,
      );
      await Promise.all([loadList(), refreshSummary()]);
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : "邮件操作失败");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleMarkRead(mailboxEntryId: string) {
    setBusyActionId(mailboxEntryId);
    setMessage(null);
    setError(null);

    try {
      await sendJson<unknown, Record<string, never>>(
        `/internal-mail/mailbox/${mailboxEntryId}/read`,
        "PATCH",
        {},
      );
      await Promise.all([loadList(), refreshSummary()]);
    } catch (actionError) {
      setError(
        actionError instanceof ApiError ? actionError.message : "标记已读失败",
      );
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleEmptyTrash() {
    setBusyActionId(EMPTY_TRASH_ACTION_ID);
    setMessage(null);
    setError(null);

    try {
      await fetchApi<{ deletedCount: number }>("/internal-mail/trash", {
        method: "DELETE",
      });
      await Promise.all([loadList(), refreshSummary()]);
      setMessage("回收站已清空。");
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : "清空回收站失败");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleBulkDeleteArchived() {
    if (folder === "trash") {
      return;
    }

    setBusyActionId(EMPTY_TRASH_ACTION_ID);
    setMessage(null);
    setError(null);

    try {
      await sendJson<
        { updatedCount: number },
        BulkUpdateInternalMailMailboxPayload
      >("/internal-mail/mailbox/bulk", "POST", {
        folder,
        action: "DELETE",
        keyword: keyword.trim() || undefined,
        archivedSource: "archived",
        read: readFilter === "all" ? undefined : readFilter,
        starred:
          starredFilter === "all"
            ? undefined
            : starredFilter === "starred"
              ? "true"
              : "false",
      });
      await Promise.all([loadList(), refreshSummary()]);
      setMessage("归档接管邮件已批量移入回收站。");
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : "批量删除失败");
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleConfirmDangerAction() {
    if (!pendingDangerAction) {
      return;
    }

    if (pendingDangerAction.kind === "delete") {
      await handleMailboxAction(pendingDangerAction.mailboxEntryId, {
        action: "DELETE",
      });
    } else if (pendingDangerAction.kind === "purge") {
      await handleMailboxAction(pendingDangerAction.mailboxEntryId, {
        action: "PURGE",
      });
      setMessage("邮件已从回收站彻底删除。");
    } else if (pendingDangerAction.kind === "bulkDeleteArchived") {
      await handleBulkDeleteArchived();
    } else {
      await handleEmptyTrash();
    }

    setPendingDangerAction(null);
  }

  function getDangerDialogConfig() {
    if (!pendingDangerAction) {
      return null;
    }

    if (pendingDangerAction.kind === "delete") {
      return {
        title: "删除邮件",
        description: `该操作会将“${pendingDangerAction.subject}”移入回收站。为防止误操作，请输入确认文案后继续。`,
        confirmText: "确认删除该邮件",
        confirmLabel: "请输入确认文案",
        actionLabel: "确认删除",
        busyId: pendingDangerAction.mailboxEntryId,
      };
    }

    if (pendingDangerAction.kind === "purge") {
      return {
        title: "彻底删除邮件",
        description: `该操作会立即从你的回收站中永久移除“${pendingDangerAction.subject}”，删除后无法恢复。为防止误操作，请输入确认文案后继续。`,
        confirmText: "确认彻底删除该邮件",
        confirmLabel: "请输入确认文案",
        actionLabel: "彻底删除",
        busyId: pendingDangerAction.mailboxEntryId,
      };
    }

    if (pendingDangerAction.kind === "bulkDeleteArchived") {
      return {
        title: "批量删除归档接管邮件",
        description: `该操作会将当前列表中筛选出的 ${pendingDangerAction.itemCount} 封归档接管邮件移入回收站，便于快速清理归档迁移带来的堆积内容。为防止误操作，请输入确认文案后继续。`,
        confirmText: "确认批量删除归档接管邮件",
        confirmLabel: "请输入确认文案",
        actionLabel: "确认批量删除",
        busyId: EMPTY_TRASH_ACTION_ID,
      };
    }

    return {
      title: "清空回收站",
      description: `该操作会立即彻底删除回收站中的 ${pendingDangerAction.itemCount} 封邮件，删除后无法恢复。为防止误操作，请输入确认文案后继续。`,
      confirmText: "确认清空回收站",
      confirmLabel: "请输入确认文案",
      actionLabel: "确认清空",
      busyId: EMPTY_TRASH_ACTION_ID,
    };
  }

  const dangerDialogConfig = getDangerDialogConfig();
  const archivedImportedItems = useMemo(
    () => items.filter((item) => Boolean(item.mailboxEntry.archivedSourceUserId)),
    [items],
  );
  const canBulkDeleteArchived =
    folder !== "trash" && archivedImportedItems.length > 0;

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
        <h2 className="text-2xl font-semibold text-balance text-foreground-strong">
          {current.title}
        </h2>
        <Link href={current.href} className="app-button-primary mt-6">
          {current.actionLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dangerDialogConfig ? (
        <DangerConfirmDialog
          open
          title={dangerDialogConfig.title}
          description={dangerDialogConfig.description}
          confirmText={dangerDialogConfig.confirmText}
          confirmLabel={dangerDialogConfig.confirmLabel}
          actionLabel={dangerDialogConfig.actionLabel}
          busy={busyActionId === dangerDialogConfig.busyId}
          onClose={() => {
            if (busyActionId !== dangerDialogConfig.busyId) {
              setPendingDangerAction(null);
            }
          }}
          onConfirm={handleConfirmDangerAction}
        />
      ) : null}
      <section className="app-panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-balance text-foreground-strong">
              {title}
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-7 text-slate-300 text-pretty">
              {description}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-300">
              共 {items.length} 封
            </div>
            {folder === "trash" ? (
              <button
                type="button"
                disabled={items.length === 0 || busyActionId === EMPTY_TRASH_ACTION_ID}
                className="app-button-secondary"
                onClick={() => {
                  setPendingDangerAction({
                    kind: "emptyTrash",
                    itemCount: items.length,
                  });
                }}
              >
                {busyActionId === EMPTY_TRASH_ACTION_ID ? "清空中..." : "一键清空"}
              </button>
            ) : null}
            <Link href="/portal/mail/compose" className="app-button-secondary">
              写邮件
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
          <label className="text-sm">
            <div className="mb-2 text-slate-300">搜索主题 / 内容 / 人员</div>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="app-input"
              placeholder="搜索邮件"
            />
          </label>
          <label className="text-sm">
            <div className="mb-2 text-slate-300">归档来源</div>
            <select
              value={archivedSourceFilter}
              onChange={(event) =>
                setArchivedSourceFilter(
                  event.target.value as "all" | "archived" | "direct",
                )
              }
              className="app-select"
            >
              <option value="all">全部</option>
              <option value="archived">仅归档接管</option>
              <option value="direct">仅普通邮件</option>
            </select>
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
          <label className="text-sm xl:col-start-4">
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

        {canBulkDeleteArchived ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <div>
              当前列表包含 {archivedImportedItems.length} 封来自其他用户归档接管的邮件，可快速清理。
            </div>
            <button
              type="button"
              disabled={busyActionId === EMPTY_TRASH_ACTION_ID}
              className="app-button-secondary"
              onClick={() => {
                setPendingDangerAction({
                  kind: "bulkDeleteArchived",
                  itemCount: archivedImportedItems.length,
                });
              }}
            >
              {busyActionId === EMPTY_TRASH_ACTION_ID ? "处理中..." : "一键删除归档接管邮件"}
            </button>
          </div>
        ) : null}

        {message ? (
          <div className="mt-5 text-sm text-foreground-muted">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-[var(--danger-strong)]">
            {error}
          </div>
        ) : null}
      </section>

      {loading ? (
        <section className="app-panel p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="app-panel-muted h-32 animate-pulse" />
            ))}
          </div>
        </section>
      ) : items.length === 0 ? (
        renderEmptyState()
      ) : (
        <section>
          <div className="app-panel p-4">
            <div className="flex items-center justify-between gap-3 border-b border-white/8 px-2 pb-4">
              <div className="text-sm font-medium text-foreground-strong">邮件列表</div>
              <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs tabular-nums text-slate-300">
                {items.length}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {items.map((item) => {
                const busy = item.mailboxEntry.id === busyActionId;

                return (
                  <article
                    key={item.mailboxEntry.id}
                    className="group relative isolate rounded-[26px] border border-white/8 bg-white/[0.03] px-4 py-4 transition-colors duration-200 hover:border-white/12 hover:bg-white/[0.05]"
                  >
                    <Link
                      href={buildMessageViewHref(folder, item.id)}
                      aria-label={`查看邮件 ${item.subject}`}
                      className="absolute inset-0 rounded-[26px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    />
                    <div className="pointer-events-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
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
                            {item.mailboxEntry.archivedSourceUserId ? (
                              <span className="app-eyebrow bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/25">
                                归档接管
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 line-clamp-1 text-xl font-semibold leading-7 text-foreground-strong">
                            {item.subject}
                          </div>
                          <div className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-500">
                            {buildRecipientSummary(item, folder)}
                          </div>
                          {item.mailboxEntry.archivedSourceUserId ? (
                            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                              {buildArchivedSourceLabel(item)}
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-400 tabular-nums">
                          <div>{formatDateTime(item.sentAt ?? item.updatedAt)}</div>
                        </div>
                      </div>
                      <div className="mt-2.5 max-w-full xl:max-w-[75%]">
                        <div className="line-clamp-2 text-sm leading-5 text-slate-400">
                          {buildListPreview(item.preview)}
                        </div>
                      </div>
                    </div>

                    <div className="pointer-events-auto relative z-10 mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                      <Link
                        href={buildMessageViewHref(folder, item.id)}
                        className="app-button-secondary text-xs sm:text-sm"
                      >
                        查看邮件
                      </Link>
                      {!item.mailboxEntry.readAt &&
                      item.mailboxEntry.recipientType !== "SENDER" ? (
                        <button
                          type="button"
                          disabled={busy}
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
                        disabled={busy}
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
                          disabled={busy}
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
                          disabled={busy}
                          className="app-button-ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDangerAction({
                              kind: "delete",
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
                          disabled={busy}
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
                      {folder === "trash" ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="app-button-ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDangerAction({
                              kind: "purge",
                              mailboxEntryId: item.mailboxEntry.id,
                              subject: item.subject,
                            });
                          }}
                        >
                          彻底删除
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
