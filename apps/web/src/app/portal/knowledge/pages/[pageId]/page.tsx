"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button, buttonClassName } from "@/components/ui/button";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  GrantKnowledgePagePermissionPayload,
  KnowledgePagePermissionGrantSummary,
  KnowledgePagePermissionManagement,
  KnowledgePageSummary,
  PageStatus,
} from "@/lib/contracts";
import { buildMarkdownHeadingId } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { PortalShell } from "@/app/portal/_components/portal-shell";

const statusMap: Record<PageStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function extractMarkdownHeadings(markdown: string) {
  const headingCounts = new Map<string, number>();

  return markdown
    .split("\n")
    .map((line) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());

      if (!match) {
        return null;
      }

      const title = match[2].replace(/[#*_`]/g, "").trim();
      const baseId = buildMarkdownHeadingId(title) || `heading-${match[1].length}`;
      const currentCount = headingCounts.get(baseId) ?? 0;
      const nextCount = currentCount + 1;
      headingCounts.set(baseId, nextCount);

      return {
        level: match[1].length,
        title,
        id: nextCount > 1 ? `${baseId}-${nextCount}` : baseId,
      };
    })
    .filter((heading): heading is { level: number; title: string; id: string } =>
      Boolean(heading?.title),
    );
}

function countPageWords(markdown: string) {
  const plainText = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~\-|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!plainText) {
    return 0;
  }

  const cjkCount = (plainText.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinWordCount = plainText
    .replace(/[\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return cjkCount + latinWordCount;
}

function buildPermissionManagementPath(pageId: string, keyword: string) {
  const params = new URLSearchParams();
  const trimmedKeyword = keyword.trim();

  if (trimmedKeyword) {
    params.set("q", trimmedKeyword);
  }

  const query = params.toString();
  return query
    ? `/knowledge/pages/${pageId}/permissions?${query}`
    : `/knowledge/pages/${pageId}/permissions`;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

function KnowledgePageSidebar({
  page,
  loading,
  canEditPage,
  canDeletePage,
  submitting,
  headings,
  onDelete,
}: {
  page: KnowledgePageSummary | null;
  loading: boolean;
  canEditPage: boolean;
  canDeletePage: boolean;
  submitting: boolean;
  headings: { level: number; title: string; id: string }[];
  onDelete: () => void;
}) {
  if (loading) {
    return <div className="app-panel p-5 text-sm text-zinc-300">正在加载页面侧栏...</div>;
  }

  if (!page) {
    return (
      <div className="app-panel-muted p-5 text-sm text-zinc-400">
        暂无页面侧栏信息
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <div className="text-sm text-sky-300">{page.space.name}</div>
        {page.parent ? (
          <Link
            href={`/portal/knowledge/pages/${page.parent.id}`}
            className="mt-4 block rounded-2xl border border-border px-3 py-2 text-sm text-zinc-200 transition hover:bg-surface-soft"
          >
            {page.parent.title}
          </Link>
        ) : null}
        <div className="mt-5 flex flex-col gap-3">
          <Link
            href={`/portal/knowledge/spaces/${page.spaceId}`}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            返回目录
          </Link>
          <Link
            href={`/portal/knowledge/pages/${page.id}/edit`}
            className={buttonClassName({ variant: "primary", size: "sm" })}
          >
            {canEditPage ? "编辑页面" : "申请编辑权限"}
          </Link>
          {canDeletePage ? (
            <Button
              type="button"
              onClick={onDelete}
              variant="dangerOutline"
              size="sm"
              disabled={submitting}
            >
              删除页面
            </Button>
          ) : null}
        </div>
        {!canEditPage ? (
          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            当前账号无权直接编辑该页面。你可以向页面所有者、知识库所有者或实验室管理员发起权限审批；审批通过后会获得编辑权限，但不会转移所有权。
          </div>
        ) : null}
      </section>

      <section className="app-panel p-5">
        <h2 className="text-lg font-semibold">目录</h2>
        {headings.length > 0 ? (
          <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto pr-1 text-sm text-zinc-300">
            {headings.map((heading, index) => (
              <a
                key={`${heading.title}-${index}`}
                href={`#${heading.id}`}
                className="block truncate rounded-xl px-2 py-1.5 transition-colors duration-200 hover:bg-surface-soft hover:text-foreground-strong"
                style={{ paddingLeft: `${(heading.level - 1) * 14}px` }}
              >
                {heading.title}
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-zinc-500">暂无标题层级</div>
        )}
      </section>
    </div>
  );
}

interface PermissionManagementDialogProps {
  open: boolean;
  loading: boolean;
  submitting: boolean;
  feedback: {
    tone: "success" | "error";
    message: string;
  } | null;
  highlightedGrantUserId: string | null;
  search: string;
  selectedGrantUserId: string;
  grantComment: string;
  grants: KnowledgePagePermissionGrantSummary[];
  candidates: KnowledgePagePermissionManagement["availableUsers"];
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onMoveSelection: (direction: 1 | -1) => void;
  onSelectedGrantUserIdChange: (value: string) => void;
  onGrantCommentChange: (value: string) => void;
  onGrant: () => Promise<void> | void;
  onRevoke: (grant: KnowledgePagePermissionGrantSummary) => Promise<void> | void;
}

function PermissionManagementDialog({
  open,
  loading,
  submitting,
  feedback,
  highlightedGrantUserId,
  search,
  selectedGrantUserId,
  grantComment,
  grants,
  candidates,
  onClose,
  onSearchChange,
  onMoveSelection,
  onSelectedGrantUserIdChange,
  onGrantCommentChange,
  onGrant,
  onRevoke,
}: PermissionManagementDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const searchInputId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (!containerRef.current) {
        return;
      }

      if (event.key === "Escape" && !submitting) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(containerRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const currentIndex = focusableElements.indexOf(
        document.activeElement as HTMLElement,
      );

      if (event.shiftKey) {
        const previousIndex =
          currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
        focusableElements[previousIndex]?.focus();
        event.preventDefault();
        return;
      }

      const nextIndex =
        currentIndex === -1 || currentIndex === focusableElements.length - 1
          ? 0
          : currentIndex + 1;
      focusableElements[nextIndex]?.focus();
      event.preventDefault();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previousActiveElementRef.current?.focus();
    };
  }, [onClose, open, submitting]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!submitting && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="mx-auto flex max-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-surface shadow-2xl"
      >
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-sky-300">页面权限管理</div>
              <h2 id={titleId} className="mt-2 text-2xl font-semibold text-balance">
                主动授予或移除编辑权限
              </h2>
              <p
                id={descriptionId}
                className="mt-3 max-w-[62ch] text-sm leading-7 text-pretty text-zinc-300"
              >
                页面所有者、知识库所有者和实验室管理员可以直接授予页面编辑权限，也可以在权限生效后随时移除。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/portal/knowledge/approvals"
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                打开权限审批
              </Link>
              <Button
                type="button"
                onClick={onClose}
                variant="secondary"
                size="sm"
                disabled={submitting}
              >
                关闭
              </Button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="min-h-0 border-b border-border bg-surface/70 p-5 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">当前已授权成员</h3>
              <span className="app-pill">{grants.length} 人</span>
            </div>
            <div className="mt-5 max-h-full space-y-3 overflow-y-auto pr-1">
              {grants.length > 0 ? (
                grants.map((grant) => (
                  <article
                    key={grant.id}
                    className={cn(
                      "rounded-2xl border px-4 py-4",
                      highlightedGrantUserId === grant.userId
                        ? "border-emerald-400/35 bg-emerald-400/10 shadow-sm"
                        : "border-border/80 bg-surface-soft",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">
                          {grant.user.realName}
                        </div>
                        <div className="mt-1 text-sm text-zinc-400">
                          {grant.user.email}
                        </div>
                        <div className="mt-3 text-xs leading-6 text-zinc-400">
                          由 {grant.grantedBy.realName} 授权，生效于{" "}
                          {formatDateTime(grant.createdAt)}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void onRevoke(grant)}
                        className="app-button-danger-outline px-4 py-2"
                      >
                        移除权限
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-zinc-400">
                  当前没有额外授予的页面编辑权限成员。
                </div>
              )}
            </div>
          </section>

          <section className="min-h-0 bg-surface/70 p-5">
            <h3 className="text-lg font-semibold">主动授予权限</h3>
            <div className="mt-5 grid gap-4">
              <label htmlFor={searchInputId} className="text-sm">
                <div className="mb-2 text-zinc-300">搜索可授权成员</div>
                <input
                  id={searchInputId}
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      onMoveSelection(1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      onMoveSelection(-1);
                    }
                  }}
                  className="app-input"
                  placeholder="搜索姓名、邮箱或用户名"
                  aria-describedby={feedback ? undefined : descriptionId}
                />
              </label>
              <div className="min-h-5 text-sm text-zinc-400" aria-live="polite">
                {loading
                  ? "正在同步可授权成员..."
                  : "输入关键词后会自动筛选候选成员，可在搜索框中使用上下方向键切换选择。"}
              </div>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">选择成员</div>
                <select
                  value={selectedGrantUserId}
                  onChange={(event) => onSelectedGrantUserIdChange(event.target.value)}
                  className="app-input"
                  disabled={submitting || candidates.length === 0}
                >
                  <option value="">请选择要授予权限的成员</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.realName} · {candidate.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">说明</div>
                <textarea
                  value={grantComment}
                  onChange={(event) => onGrantCommentChange(event.target.value)}
                  className="app-textarea min-h-24"
                  placeholder="可选填写授权原因、范围或备注"
                  disabled={submitting}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={submitting || candidates.length === 0 || !selectedGrantUserId}
                  onClick={() => void onGrant()}
                  className="app-button-primary"
                >
                  {submitting ? "处理中..." : "直接授予编辑权限"}
                </button>
              </div>
              {candidates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-zinc-400">
                  当前搜索条件下没有可直接授权的成员。
                </div>
              ) : null}
              {feedback ? (
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm",
                    feedback.tone === "error"
                      ? "border-red-400/20 bg-red-400/10 text-red-100"
                      : "border-emerald-300/30 bg-emerald-400/15 text-emerald-50 shadow-sm",
                  )}
                  role={feedback.tone === "error" ? "alert" : "status"}
                  aria-live="polite"
                >
                  {feedback.message}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function PortalKnowledgePageDetailPage() {
  const params = useParams<{ pageId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const pageId = params.pageId;
  const [page, setPage] = useState<KnowledgePageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [permissionManagement, setPermissionManagement] =
    useState<KnowledgePagePermissionManagement | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionSubmitting, setPermissionSubmitting] = useState(false);
  const [permissionFeedback, setPermissionFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [highlightedGrantUserId, setHighlightedGrantUserId] = useState<string | null>(
    null,
  );
  const [permissionSearch, setPermissionSearch] = useState("");
  const [selectedGrantUserId, setSelectedGrantUserId] = useState("");
  const [grantComment, setGrantComment] = useState("");

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await fetchApi<KnowledgePageSummary>(
          `/knowledge/pages/${pageId}`,
        );

        if (!active) {
          return;
        }

        setPage(data);
      } catch (error) {
        if (!active) {
          return;
        }

        setError(
          error instanceof ApiError ? error.message : "无法获取知识页面详情",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [pageId]);

  useEffect(() => {
    const nextCanManagePermissions = page?.editPermission?.canManagePermissions ?? false;

    if (!page || !nextCanManagePermissions || !permissionDialogOpen) {
      return;
    }

    let active = true;

    const timer = window.setTimeout(() => {
      void (async () => {
        if (active) {
          setPermissionLoading(true);
        }

        try {
          const data = await fetchApi<KnowledgePagePermissionManagement>(
            buildPermissionManagementPath(page.id, permissionSearch),
          );

          if (!active) {
            return;
          }

          setPermissionManagement(data);
          setSelectedGrantUserId((currentValue) => {
            if (
              currentValue &&
              data.availableUsers.some((candidate) => candidate.id === currentValue)
            ) {
              return currentValue;
            }

            return data.availableUsers[0]?.id ?? "";
          });
        } catch (error) {
          if (!active) {
            return;
          }

          setPermissionFeedback(
            {
              tone: "error",
              message:
                error instanceof ApiError ? error.message : "无法获取页面权限管理数据",
            },
          );
        } finally {
          if (active) {
            setPermissionLoading(false);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, permissionDialogOpen, permissionSearch]);

  const canDeletePage =
    page?.editPermission?.canDelete ??
    Boolean(user && (page?.authorId === user.id || (!page?.authorId && page?.editorId === user.id)));
  const canEditPage =
    page?.editPermission?.canEdit ??
    Boolean(user && (page?.authorId === user.id || page?.editorId === user.id));
  const canManagePermissions = page?.editPermission?.canManagePermissions ?? false;

  const headings = useMemo(
    () => (page ? extractMarkdownHeadings(page.contentMd) : []),
    [page],
  );
  const pageWordCount = useMemo(
    () => (page ? countPageWords(page.contentMd) : 0),
    [page],
  );
  const pageOwnerName = page?.author?.realName || page?.editor?.realName || "未设置";
  const activePermissionGrants = permissionManagement?.grants ?? [];
  const grantCandidates = permissionManagement?.availableUsers ?? [];

  async function handleConfirmDeletePage() {
    if (!page) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await sendJson<KnowledgePageSummary, Record<string, never>>(
        `/knowledge/pages/${page.id}`,
        "DELETE",
        {},
      );
      router.replace(`/portal/knowledge/spaces/${page.spaceId}`);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "删除知识页面失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function reloadPermissionManagement(currentPageId: string) {
    setPermissionLoading(true);

    try {
      const data = await fetchApi<KnowledgePagePermissionManagement>(
        buildPermissionManagementPath(currentPageId, permissionSearch),
      );
      setPermissionManagement(data);
      setSelectedGrantUserId((currentValue) => {
        if (
          currentValue &&
          data.availableUsers.some((candidate) => candidate.id === currentValue)
        ) {
          return currentValue;
        }

        return data.availableUsers[0]?.id ?? "";
      });
    } finally {
      setPermissionLoading(false);
    }
  }

  async function handleGrantPermission() {
    if (!page || !selectedGrantUserId) {
      setPermissionFeedback({
        tone: "error",
        message: "请先选择要授予权限的成员。",
      });
      return;
    }

    const grantedUser = grantCandidates.find(
      (candidate) => candidate.id === selectedGrantUserId,
    );

    setPermissionSubmitting(true);
    setPermissionFeedback(null);

    try {
      await sendJson<KnowledgePagePermissionGrantSummary, GrantKnowledgePagePermissionPayload>(
        `/knowledge/pages/${page.id}/permissions`,
        "POST",
        {
          userId: selectedGrantUserId,
          comment: grantComment.trim() || undefined,
        },
      );
      await reloadPermissionManagement(page.id);
      setHighlightedGrantUserId(selectedGrantUserId);
      setGrantComment("");
      setPermissionFeedback({
        tone: "success",
        message: grantedUser
          ? `已主动授予 ${grantedUser.realName} 页面编辑权限${
              permissionSearch.trim() ? `，并保留当前搜索“${permissionSearch.trim()}”` : ""
            }。`
          : "已主动授予该成员页面编辑权限。",
      });
    } catch (error) {
      setPermissionFeedback({
        tone: "error",
        message:
          error instanceof ApiError ? error.message : "主动授予页面编辑权限失败",
      });
    } finally {
      setPermissionSubmitting(false);
    }
  }

  async function handleRevokePermission(grant: KnowledgePagePermissionGrantSummary) {
    if (!page) {
      return;
    }

    setPermissionSubmitting(true);
    setPermissionFeedback(null);
    setHighlightedGrantUserId(null);

    try {
      await fetchApi<KnowledgePagePermissionGrantSummary>(
        `/knowledge/pages/${page.id}/permissions/${grant.userId}`,
        {
          method: "DELETE",
        },
      );
      await reloadPermissionManagement(page.id);
      setPermissionFeedback({
        tone: "success",
        message: `已移除 ${grant.user.realName} 的页面编辑权限${
          permissionSearch.trim() ? `，并保留当前搜索“${permissionSearch.trim()}”` : ""
        }。`,
      });
    } catch (error) {
      setPermissionFeedback({
        tone: "error",
        message: error instanceof ApiError ? error.message : "移除页面编辑权限失败",
      });
    } finally {
      setPermissionSubmitting(false);
    }
  }

  function handleMoveGrantSelection(direction: 1 | -1) {
    if (grantCandidates.length === 0) {
      return;
    }

    const currentIndex = grantCandidates.findIndex(
      (candidate) => candidate.id === selectedGrantUserId,
    );
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : grantCandidates.length - 1
        : (currentIndex + direction + grantCandidates.length) % grantCandidates.length;

    setSelectedGrantUserId(grantCandidates[nextIndex]?.id ?? "");
  }

  return (
    <PortalShell
      title={page?.title || "知识页面"}
      description={page?.summary || "查看知识正文、标签和所属空间信息。"}
      asideContent={
        <KnowledgePageSidebar
          page={page}
          loading={loading}
          canEditPage={canEditPage}
          canDeletePage={canDeletePage}
          submitting={submitting}
          headings={headings}
          onDelete={() => setConfirmDeleteOpen(true)}
        />
      }
    >
      {confirmDeleteOpen && page ? (
        <DangerConfirmDialog
          open
          title={`删除页面 ${page.title}`}
          description="删除后当前知识页面会立刻对普通用户不可见，并进入 14 天保留期；仅系统管理员可在到期前恢复。为防止误操作，请输入确认文案后继续。"
          confirmText={`确认删除页面 ${page.title}`}
          confirmLabel="请输入确认文案"
          actionLabel="确认删除页面"
          busy={submitting}
          onClose={() => {
            if (!submitting) {
              setConfirmDeleteOpen(false);
            }
          }}
          onConfirm={handleConfirmDeletePage}
        />
      ) : null}
      <PermissionManagementDialog
        open={permissionDialogOpen}
        loading={permissionLoading}
        submitting={permissionSubmitting}
        feedback={permissionFeedback}
        highlightedGrantUserId={highlightedGrantUserId}
        search={permissionSearch}
        selectedGrantUserId={selectedGrantUserId}
        grantComment={grantComment}
        grants={activePermissionGrants}
        candidates={grantCandidates}
        onClose={() => {
          if (!permissionSubmitting) {
            setPermissionDialogOpen(false);
          }
        }}
        onSearchChange={setPermissionSearch}
        onMoveSelection={handleMoveGrantSelection}
        onSelectedGrantUserIdChange={setSelectedGrantUserId}
        onGrantCommentChange={setGrantComment}
        onGrant={handleGrantPermission}
        onRevoke={handleRevokePermission}
      />
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {loading ? (
          <div className="app-panel p-6 text-sm text-zinc-300">
            正在加载知识页面...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
            {error}
          </div>
        ) : page ? (
          <>
            {message ? (
              <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
                {message}
              </div>
            ) : null}
            <section className="app-panel p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-5 flex flex-wrap gap-2 text-xs text-zinc-400">
                    <span className="rounded-full border border-border px-3 py-1">
                      页面所有人：{pageOwnerName}
                    </span>
                    {page.editor ? (
                      <span className="rounded-full border border-border px-3 py-1">
                        最近编辑：{page.editor.realName}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-border px-3 py-1">
                      正文 {pageWordCount} 字
                    </span>
                    <span className="rounded-full border border-border px-3 py-1">
                      创建于 {formatDateTime(page.createdAt)}
                    </span>
                    <span className="rounded-full border border-border px-3 py-1">
                      更新于 {formatDateTime(page.updatedAt)}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-400">{statusMap[page.status]}</div>
                  <h2 className="mt-2 text-4xl font-semibold tracking-tight">
                    {page.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">
                    {page.summary || "暂无摘要"}
                  </p>
                </div>
                {canManagePermissions ? (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPermissionFeedback(null);
                        setHighlightedGrantUserId(null);
                        setPermissionDialogOpen(true);
                      }}
                    >
                      页面权限管理
                    </Button>
                    <Link
                      href="/portal/knowledge/approvals"
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      打开权限审批
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>
            <article className="app-panel p-8">
              <MarkdownContent markdown={page.contentMd} />
              {page.tags.length > 0 ? (
                <div className="mt-8 flex flex-wrap gap-2">
                  {page.tags.map((tag) => (
                    <span key={tag} className="app-pill text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          </>
        ) : null}
      </div>
    </PortalShell>
  );
}
