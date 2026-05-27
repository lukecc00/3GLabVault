"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { DisabledActionHint } from "@/components/ui/disabled-action-hint";
import { MarkdownContent } from "@/components/ui/markdown-content";
import type {
  CreateKnowledgeSpacePayload,
  GrantKnowledgeSpaceAccessGroupPayload,
  KnowledgePageSummary,
  KnowledgeSpaceDetail,
  PageStatus,
} from "@/lib/contracts";
import {
  buildKnowledgePageTree,
  flattenKnowledgeTree,
  type KnowledgeTreeNode,
  type KnowledgeTreePage,
} from "@/lib/knowledge-tree";
import { Button, buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PortalShell } from "@/app/portal/_components/portal-shell";

const statusMap: Record<PageStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

function getDeleteSpaceBlockedReason(spaceDetail: KnowledgeSpaceDetail) {
  if (spaceDetail.pages.length === 0) {
    return null;
  }

  return `当前仍有 ${spaceDetail.pages.length} 篇页面，请先删除页面后再删除空间。`;
}

function collectCollapsibleNodeIds(nodes: KnowledgeTreeNode[]) {
  const ids: string[] = [];

  function walk(currentNodes: KnowledgeTreeNode[]) {
    for (const node of currentNodes) {
      if (node.children.length > 0) {
        ids.push(node.page.id);
        walk(node.children);
      }
    }
  }

  walk(nodes);

  return ids;
}

export default function PortalKnowledgeSpaceDetailPage() {
  const params = useParams<{ spaceId: string }>();
  const router = useRouter();
  const { user, activeWorkspace } = useAuth();
  const activeRoleCode = activeWorkspace?.roleCode ?? null;
  const spaceId = params.spaceId;
  const [space, setSpace] = useState<KnowledgeSpaceDetail | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [childSpaceForm, setChildSpaceForm] = useState<
    CreateKnowledgeSpacePayload & { accessGroupIds: string[] }
  >({
    code: "",
    name: "",
    description: "",
    parentSpaceId: spaceId,
    accessGroupIds: [],
  });
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingDangerAction, setPendingDangerAction] = useState<
    | {
        type: "delete-space";
        space: KnowledgeSpaceDetail;
      }
    | {
        type: "delete-page";
        page: KnowledgeTreePage;
      }
    | null
  >(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const spaceData = await fetchApi<KnowledgeSpaceDetail>(
        `/knowledge/spaces/${spaceId}`,
      );
      setSpace(spaceData);
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "无法获取知识库空间详情",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const spaceData = await fetchApi<KnowledgeSpaceDetail>(
          `/knowledge/spaces/${spaceId}`,
        );

        if (!active) {
          return;
        }

        setSpace(spaceData);
      } catch (error) {
        if (!active) {
          return;
        }

        setError(
          error instanceof ApiError ? error.message : "无法获取知识库空间详情",
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
  }, [spaceId]);

  const filteredPages = useMemo(() => {
    if (!space) {
      return [];
    }

    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return space.pages;
    }

    return space.pages.filter((page) =>
      [
        page.title,
        page.summary ?? "",
        page.contentMd,
        page.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [query, space]);

  const tree = useMemo(() => buildKnowledgePageTree(filteredPages), [filteredPages]);
  const flattenedPages = useMemo(() => flattenKnowledgeTree(tree), [tree]);
  const collapsibleNodeIds = useMemo(() => collectCollapsibleNodeIds(tree), [tree]);
  const deleteSpaceBlockedReason = space ? getDeleteSpaceBlockedReason(space) : null;
  const hasActiveSearch = query.trim().length > 0;
  const isChildSpace = Boolean(space?.parentSpaceId);
  const canManageSubspaces = space?.management?.canManageSubspaces ?? false;
  const canManageAccess = space?.management?.canManageAccess ?? false;
  const availableGradeGroups = space?.management?.availableGradeGroups ?? [];
  const childSpaces = space?.childSpaces ?? [];
  const currentAccessGroupIds = new Set(
    (space?.accessGroups ?? []).map((item) => item.groupId),
  );
  const unopenedGradeGroups = availableGradeGroups.filter(
    (group) => !currentAccessGroupIds.has(group.id),
  );
  const canDeleteSpace =
    Boolean(space) &&
    Boolean(
      user &&
        ((activeRoleCode === "GRADE_ADMIN" &&
          space?.ownerGroupId &&
          user.groupIds.includes(space.ownerGroupId) &&
          space.ownerGroup?.type === "GRADE") ||
          (activeRoleCode === "DIRECTION_ADMIN" &&
            space?.ownerGroupId &&
            user.groupIds.includes(space.ownerGroupId) &&
            space.ownerGroup?.type === "DIRECTION")),
    );

  function canDeletePage(page: KnowledgeTreePage) {
    return Boolean(user && (page.authorId === user.id || (!page.authorId && page.editorId === user.id)));
  }

  function handleDeleteSpace(spaceDetail: KnowledgeSpaceDetail) {
    const blockedReason = getDeleteSpaceBlockedReason(spaceDetail);

    if (blockedReason) {
      setMessage(`知识空间 ${spaceDetail.name} 当前无法删除：${blockedReason}`);
      return;
    }

    setPendingDangerAction({
      type: "delete-space",
      space: spaceDetail,
    });
  }

  async function handleConfirmDangerAction() {
    if (!pendingDangerAction) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      if (pendingDangerAction.type === "delete-space") {
        await sendJson<KnowledgeSpaceDetail, Record<string, never>>(
          `/knowledge/spaces/${pendingDangerAction.space.id}`,
          "DELETE",
          {},
        );
        router.replace("/portal/knowledge");
        return;
      }

      await sendJson<KnowledgePageSummary, Record<string, never>>(
        `/knowledge/pages/${pendingDangerAction.page.id}`,
        "DELETE",
        {},
      );
      setMessage(
        `知识页面 ${pendingDangerAction.page.title} 已删除，14 天内系统管理员可恢复。`,
      );
      setPendingDangerAction(null);
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : pendingDangerAction.type === "delete-space"
            ? "删除知识空间失败"
            : "删除知识页面失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateChildSpace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!space) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await sendJson<KnowledgeSpaceDetail, CreateKnowledgeSpacePayload>(
        "/knowledge/spaces",
        "POST",
        {
          code: childSpaceForm.code.trim(),
          name: childSpaceForm.name.trim(),
          description: childSpaceForm.description?.trim() || undefined,
          parentSpaceId: space.id,
          accessGroupIds: childSpaceForm.accessGroupIds,
        },
      );
      setChildSpaceForm({
        code: "",
        name: "",
        description: "",
        parentSpaceId: space.id,
        accessGroupIds: [],
      });
      setMessage("子知识库已创建。");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "创建子知识库失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGrantAccessGroup(groupId: string) {
    if (!space) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await sendJson<unknown, GrantKnowledgeSpaceAccessGroupPayload>(
        `/knowledge/spaces/${space.id}/access-groups`,
        "POST",
        { groupId },
      );
      setMessage("已开通新的年级权限。");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "开通年级权限失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeAccessGroup(groupId: string) {
    if (!space) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await sendJson<unknown, Record<string, never>>(
        `/knowledge/spaces/${space.id}/access-groups/${groupId}`,
        "DELETE",
        {},
      );
      setMessage("已关闭该年级的子知识库权限。");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "关闭年级权限失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleToggleNode(nodeId: string) {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);

      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }

      return next;
    });
  }

  function handleExpandAll() {
    setCollapsedNodeIds(new Set());
  }

  function handleCollapseAll() {
    setCollapsedNodeIds(new Set(collapsibleNodeIds));
  }

  function renderTree(nodes: KnowledgeTreeNode[], depth = 0) {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const expanded = hasActiveSearch || !collapsedNodeIds.has(node.page.id);
      const guideOffset = 11 + depth * 18;

      return (
        <div key={node.page.id} className="relative mt-1">
          {depth > 0 ? (
            <span
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-border-soft"
              style={{ left: `${guideOffset - 9}px` }}
            />
          ) : null}
          <div
            className={cn(
              "group relative flex min-h-11 items-center gap-2 rounded-2xl border px-2 py-1.5 text-sm transition-[background-color,border-color,box-shadow] duration-200",
              hasChildren
                ? "border-border bg-surface-soft shadow-[inset_3px_0_0_var(--accent-border)]"
                : "border-transparent hover:border-border-soft hover:bg-surface-soft",
            )}
            style={{ paddingLeft: `${10 + depth * 18}px` }}
          >
            {depth > 0 ? (
              <span
                aria-hidden
                className="absolute h-px w-3 bg-border-soft"
                style={{ left: `${guideOffset - 9}px` }}
              />
            ) : null}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => handleToggleNode(node.page.id)}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-foreground-muted transition-[transform,background-color,color] duration-200 hover:bg-surface-soft hover:text-foreground-strong"
                aria-expanded={expanded}
                aria-label={`${expanded ? "收起" : "展开"} ${node.page.title}`}
              >
                <span
                  aria-hidden
                  className={cn(
                    "text-xs transition-transform duration-200",
                    expanded ? "rotate-90" : "rotate-0",
                  )}
                >
                  ▶
                </span>
              </button>
            ) : (
              <span className="size-7 shrink-0 rounded-xl border border-border-soft bg-surface-soft" />
            )}
            <Link
              href={`/portal/knowledge/pages/${node.page.id}`}
              className="min-w-0 flex-1 truncate text-foreground-strong transition hover:text-accent-strong"
            >
              {node.page.title}
            </Link>
            {hasChildren ? (
              <span className="hidden shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-foreground-soft sm:inline-flex">
                {node.children.length} 子页
              </span>
            ) : null}
            <Link
              href={`/portal/knowledge/spaces/${spaceId}/new?parentId=${node.page.id}`}
              className="shrink-0 rounded-xl border border-border px-2 py-1 text-xs text-foreground-muted opacity-0 transition-[background-color,color,opacity] duration-200 hover:bg-surface-soft hover:text-foreground-strong group-hover:opacity-100 focus:opacity-100"
            >
              新建
            </Link>
          </div>
          {hasChildren ? (
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                {renderTree(node.children, depth + 1)}
              </div>
            </div>
          ) : null}
        </div>
      );
    });
  }

  return (
    <PortalShell
      title={space?.name || "知识库空间"}
      description={space?.description || "在目录树中沉淀方向知识、经验和文档。"}
    >
      {pendingDangerAction ? (
        <DangerConfirmDialog
          open
          title={
            pendingDangerAction.type === "delete-space"
              ? `删除空间 ${pendingDangerAction.space.name}`
              : `删除页面 ${pendingDangerAction.page.title}`
          }
          description={
            pendingDangerAction.type === "delete-space"
              ? "该操作会删除当前空知识空间。删除后空间会立即对普通用户不可见，并进入 14 天保留期；仅系统管理员可在到期前恢复。"
              : "该操作会删除当前知识页面。删除后页面会立即对普通用户不可见，并进入 14 天保留期；仅系统管理员可在到期前恢复。"
          }
          confirmText={
            pendingDangerAction.type === "delete-space"
              ? `确认删除空间 ${pendingDangerAction.space.name}`
              : `确认删除页面 ${pendingDangerAction.page.title}`
          }
          confirmLabel="请输入确认文案"
          actionLabel={
            pendingDangerAction.type === "delete-space"
              ? "确认删除空间"
              : "确认删除页面"
          }
          busy={submitting}
          onClose={() => {
            if (!submitting) {
              setPendingDangerAction(null);
            }
          }}
          onConfirm={handleConfirmDangerAction}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="app-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground-soft">空间概览</div>
                <div className="mt-2 truncate text-lg font-semibold text-foreground-strong">
                  {space?.ownerGroup?.name || "未绑定群组"}
                </div>
                {space?.parentSpace ? (
                  <Link
                    href={`/portal/knowledge/spaces/${space.parentSpace.id}`}
                    className="mt-2 inline-flex text-xs text-sky-200 transition hover:text-sky-100"
                  >
                    上级知识库：{space.parentSpace.name}
                  </Link>
                ) : null}
              </div>
              <span className="app-pill shrink-0">{space?.pages.length ?? 0} 篇页面</span>
            </div>
            <div className="mt-4 grid gap-3">
              <Link
                href="/portal/knowledge"
                className={buttonClassName({
                  variant: "secondary",
                  className: "w-full",
                })}
              >
                返回空间列表
              </Link>
              {canDeleteSpace && space ? (
                <DisabledActionHint
                  disabled={Boolean(deleteSpaceBlockedReason)}
                  reason={deleteSpaceBlockedReason}
                >
                  <Button
                    type="button"
                    onClick={() => handleDeleteSpace(space)}
                    disabled={submitting || Boolean(deleteSpaceBlockedReason)}
                    variant="dangerOutline"
                    title={
                      deleteSpaceBlockedReason
                        ? undefined
                        : `删除空间 ${space.name}`
                    }
                  >
                    删除空间
                  </Button>
                </DisabledActionHint>
              ) : null}
            </div>
          </section>

          {space && (isChildSpace || canManageAccess) ? (
            <section className="app-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground-strong">开放年级</h2>
                  <div className="mt-1 text-xs text-foreground-soft">
                    子知识库需要同时满足方向权限与年级权限才可访问
                  </div>
                </div>
                <span className="app-pill">{space.accessGroups.length} 个年级</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {space.accessGroups.length > 0 ? (
                  space.accessGroups.map((item) => (
                    <span
                      key={item.id}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground-strong"
                    >
                      {item.group.name}
                      {canManageAccess ? (
                        <button
                          type="button"
                          onClick={() => handleRevokeAccessGroup(item.groupId)}
                          disabled={submitting || space.accessGroups.length <= 1}
                          className="text-foreground-soft transition hover:text-foreground-strong disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            space.accessGroups.length <= 1
                              ? "至少保留一个开放年级"
                              : `关闭 ${item.group.name} 权限`
                          }
                        >
                          关闭
                        </button>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-foreground-soft">当前还未配置开放年级</div>
                )}
              </div>
              {canManageAccess ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {unopenedGradeGroups.length > 0 ? (
                    unopenedGradeGroups.map((group) => (
                      <Button
                        key={group.id}
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={submitting}
                        onClick={() => handleGrantAccessGroup(group.id)}
                      >
                        开通 {group.name}
                      </Button>
                    ))
                  ) : (
                    <div className="text-xs text-foreground-soft">所有年级都已开通</div>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}

          {canManageSubspaces && space ? (
            <form onSubmit={handleCreateChildSpace} className="app-panel p-5">
              <h2 className="text-lg font-semibold text-foreground-strong">新建子知识库</h2>
              <div className="mt-4 grid gap-4">
                <label className="text-sm">
                  <div className="mb-2 text-foreground-soft">子知识库名称</div>
                  <input
                    required
                    value={childSpaceForm.name}
                    onChange={(event) =>
                      setChildSpaceForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    className="app-input"
                    placeholder="例如：Android 进阶资料"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-foreground-soft">空间编码</div>
                  <input
                    required
                    value={childSpaceForm.code}
                    onChange={(event) =>
                      setChildSpaceForm((prev) => ({
                        ...prev,
                        code: event.target.value,
                      }))
                    }
                    className="app-input"
                    placeholder="例如：SPACE_ANDROID_22_ADVANCED"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-foreground-soft">开放年级</div>
                  <div className="grid gap-2 rounded-2xl border border-border bg-surface-soft p-3">
                    {availableGradeGroups.map((group) => {
                      const checked = childSpaceForm.accessGroupIds.includes(group.id);

                      return (
                        <label
                          key={group.id}
                          className="flex items-center justify-between gap-3 text-sm text-foreground-strong"
                        >
                          <span>{group.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setChildSpaceForm((prev) => ({
                                ...prev,
                                accessGroupIds: event.target.checked
                                  ? [...prev.accessGroupIds, group.id]
                                  : prev.accessGroupIds.filter((id) => id !== group.id),
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-foreground-soft">说明</div>
                  <textarea
                    value={childSpaceForm.description ?? ""}
                    onChange={(event) =>
                      setChildSpaceForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    className="app-textarea"
                    placeholder="说明适用年级、内容边界与开启时机"
                  />
                </label>
              </div>
              <Button
                type="submit"
                variant="primary"
                className="mt-5"
                disabled={submitting || childSpaceForm.accessGroupIds.length === 0}
              >
                创建子知识库
              </Button>
            </form>
          ) : null}

          <section className="app-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground-strong">目录</h2>
                <div className="mt-1 text-xs text-foreground-soft">
                  {hasActiveSearch
                    ? "搜索结果已自动展开"
                    : `${collapsibleNodeIds.length} 个可折叠节点`}
                </div>
              </div>
              <Link
                href={`/portal/knowledge/spaces/${spaceId}/new`}
                className={buttonClassName({ variant: "primary", size: "xs" })}
              >
                新建页面
              </Link>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="app-input mt-4"
              placeholder="搜索标题或正文"
            />
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                onClick={handleExpandAll}
                disabled={collapsibleNodeIds.length === 0}
                variant="ghost"
                size="xs"
                className="flex-1"
              >
                全部展开
              </Button>
              <Button
                type="button"
                onClick={handleCollapseAll}
                disabled={collapsibleNodeIds.length === 0 || hasActiveSearch}
                variant="ghost"
                size="xs"
                className="flex-1"
                title={hasActiveSearch ? "搜索时目录会自动展开" : undefined}
              >
                全部收起
              </Button>
            </div>
            <div className="mt-4 max-h-[58vh] overflow-y-auto pr-1">
              {loading ? (
                <div className="text-sm text-foreground-soft">正在加载目录...</div>
              ) : tree.length > 0 ? (
                renderTree(tree)
              ) : (
                <div className="text-sm text-foreground-soft">
                  {query.trim() ? "没有匹配内容" : "当前空间还没有页面"}
                </div>
              )}
            </div>
          </section>
        </aside>

        <main className="space-y-6">
          {message ? (
            <div
              className={`rounded-3xl border p-5 ${
                message.includes("失败") || message.includes("存在")
                  ? "border-red-400/20 bg-red-400/10 text-red-100"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
              }`}
            >
              {message}
            </div>
          ) : null}

          {loading ? (
            <div className="app-panel p-6 text-sm text-zinc-300">
              正在加载空间详情...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
              {error}
            </div>
          ) : space ? (
            <>
              {!isChildSpace ? (
                <section className="app-panel p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="mt-2 text-3xl font-semibold">子知识库</h2>
                      <p className="mt-2 text-sm leading-7 text-zinc-300">
                        按年级逐步开放的方向内容会沉淀在子知识库中。
                      </p>
                    </div>
                    <span className="app-pill">{childSpaces.length} 个子知识库</span>
                  </div>
                  {childSpaces.length > 0 ? (
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      {childSpaces.map((childSpace) => (
                        <article key={childSpace.id} className="rounded-3xl border border-border bg-surface-soft p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                                {childSpace.code}
                              </div>
                              <h3 className="mt-2 truncate text-xl font-semibold text-foreground-strong">
                                {childSpace.name}
                              </h3>
                            </div>
                            <span className="app-pill shrink-0">
                              {childSpace._count.pages} 篇
                            </span>
                          </div>
                          <p className="mt-3 line-clamp-3 text-sm leading-7 text-zinc-300">
                            {childSpace.description || "暂无子知识库说明"}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {childSpace.accessGroups.map((item) => (
                              <span key={item.id} className="app-pill text-xs">
                                {item.group.name}
                              </span>
                            ))}
                          </div>
                          <div className="mt-5">
                            <Link
                              href={`/portal/knowledge/spaces/${childSpace.id}`}
                              className={buttonClassName({ variant: "primary", size: "sm" })}
                            >
                              进入子知识库
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6 app-panel-muted p-6 text-sm text-zinc-300">
                      当前方向空间还没有子知识库。
                    </div>
                  )}
                </section>
              ) : null}

              <section className="app-panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="mt-2 text-3xl font-semibold">页面</h2>
                  </div>
                  <span className="app-pill">
                    {query.trim()
                      ? `${flattenedPages.length} 个搜索结果`
                      : `${space.pages.length} 篇页面`}
                  </span>
                </div>

                {flattenedPages.length > 0 ? (
                  <div className="mt-6 divide-y divide-white/10">
                    {flattenedPages.map(({ page, depth }) => (
                      <article
                        key={page.id}
                        className="group relative isolate rounded-3xl border border-dashed border-border/80 transition-[background-color,border-color,box-shadow] duration-200 hover:border-border hover:bg-surface-soft/70"
                      >
                        <Link
                          href={`/portal/knowledge/pages/${page.id}`}
                          aria-label={`查看页面 ${page.title}`}
                          className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                        />
                        <div className="pointer-events-none flex flex-wrap items-start justify-between gap-4 px-5 py-5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <span>{statusMap[page.status]}</span>
                              {depth > 0 ? <span>第 {depth + 1} 层</span> : null}
                            </div>
                            <h3 className="mt-2 text-2xl font-semibold text-foreground-strong transition-colors duration-200 group-hover:text-accent-strong">
                              {page.title}
                            </h3>
                            <MarkdownContent
                              markdown={page.summary || page.contentMd}
                              className="markdown-list-preview mt-2 text-sm text-zinc-300"
                              emptyHtml='<p class="text-zinc-500">暂无摘要</p>'
                            />
                            {page.tags.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {page.tags.map((tag) => (
                                  <span key={tag} className="app-pill text-xs">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="pointer-events-auto relative z-20 flex flex-wrap gap-2">
                            <Link
                              href={`/portal/knowledge/spaces/${space.id}/new?parentId=${page.id}`}
                              className={buttonClassName({
                                variant: "secondary",
                                size: "xs",
                              })}
                            >
                              新建子页
                            </Link>
                            <Link
                              href={`/portal/knowledge/pages/${page.id}/edit`}
                              className={buttonClassName({
                                variant: "primary",
                                size: "xs",
                              })}
                            >
                              编辑
                            </Link>
                            {canDeletePage(page) ? (
                              <Button
                                type="button"
                                onClick={() =>
                                  setPendingDangerAction({
                                    type: "delete-page",
                                    page,
                                  })
                                }
                                disabled={submitting}
                                variant="dangerOutline"
                                size="xs"
                              >
                                删除
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-6 app-panel-muted p-6 text-sm text-zinc-300">
                    {query.trim()
                      ? "没有找到匹配页面。"
                      : "当前空间还没有页面，先新建第一篇内容。"}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </PortalShell>
  );
}
