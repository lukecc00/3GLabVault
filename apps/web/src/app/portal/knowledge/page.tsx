"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button, buttonClassName } from "@/components/ui/button";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { DisabledActionHint } from "@/components/ui/disabled-action-hint";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  CreateKnowledgeSpacePayload,
  GroupSummary,
  KnowledgePageSummary,
  KnowledgeSpaceSummary,
  SpaceVisibility,
} from "@/lib/contracts";
import { PortalShell } from "../_components/portal-shell";

const visibilityMap: Record<SpaceVisibility, string> = {
  PUBLIC: "公开",
  PRIVATE: "私有",
  GROUP_RESTRICTED: "群组可见",
};

function getDeleteSpaceBlockedReason(space: KnowledgeSpaceSummary) {
  if (space._count.pages === 0) {
    return null;
  }

  return `当前仍有 ${space._count.pages} 篇页面，请先删除或迁移页面后再删除空间。`;
}

function canDeleteKnowledgeSpace(
  space: KnowledgeSpaceSummary,
  activeRoleCode: string | null,
  userGroupIds: string[],
) {
  if (!space.ownerGroupId) {
    return false;
  }

  if (activeRoleCode === "GRADE_ADMIN") {
    return userGroupIds.includes(space.ownerGroupId) && space.ownerGroup?.type === "GRADE";
  }

  if (activeRoleCode === "DIRECTION_ADMIN") {
    return (
      userGroupIds.includes(space.ownerGroupId) &&
      space.ownerGroup?.type === "DIRECTION"
    );
  }

  return false;
}

export default function PortalKnowledgeHomePage() {
  const { user, status, activeWorkspace } = useAuth();
  const activeRoleCode = activeWorkspace?.roleCode ?? null;
  const canManageSpaces = Boolean(
    activeRoleCode &&
      (activeRoleCode === "SUPER_ADMIN" ||
        activeRoleCode === "LAB_ADMIN" ||
        activeRoleCode === "GRADE_ADMIN" ||
        activeRoleCode === "DIRECTION_ADMIN"),
  );
  const isGlobalKnowledgeAdmin =
    activeRoleCode === "SUPER_ADMIN" || activeRoleCode === "LAB_ADMIN";
  const isScopedGradeKnowledgeAdmin = activeRoleCode === "GRADE_ADMIN";
  const isScopedDirectionKnowledgeAdmin = activeRoleCode === "DIRECTION_ADMIN";
  const [spaces, setSpaces] = useState<KnowledgeSpaceSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [pageQuery, setPageQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgePageSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeleteSpace, setPendingDeleteSpace] =
    useState<KnowledgeSpaceSummary | null>(null);
  const [form, setForm] = useState<CreateKnowledgeSpacePayload>({
    code: "",
    name: "",
    description: "",
    visibility: "PUBLIC",
    ownerGroupId: "",
  });
  const deleteSpaceBlockedReasonById = new Map(
    spaces.map((space) => [space.id, getDeleteSpaceBlockedReason(space)]),
  );
  const selectableGroups = groups.filter((group) => {
    if (!user || isGlobalKnowledgeAdmin) {
      return true;
    }

    if (isScopedGradeKnowledgeAdmin) {
      return group.type === "GRADE" && user.groupIds.includes(group.id);
    }

    if (isScopedDirectionKnowledgeAdmin) {
      return group.type === "DIRECTION" && user.groupIds.includes(group.id);
    }

    return false;
  });
  const resolvedVisibility =
    isScopedGradeKnowledgeAdmin || isScopedDirectionKnowledgeAdmin
      ? "GROUP_RESTRICTED"
      : form.visibility;
  const resolvedOwnerGroupId =
    !form.ownerGroupId || selectableGroups.some((group) => group.id === form.ownerGroupId)
      ? form.ownerGroupId
      : isScopedGradeKnowledgeAdmin || isScopedDirectionKnowledgeAdmin
        ? (selectableGroups[0]?.id ?? "")
        : "";

  async function fetchKnowledgeHomeData(adminView: boolean) {
    const spacesData =
      await fetchApi<KnowledgeSpaceSummary[]>("/knowledge/spaces");
    const groupsData = adminView
      ? await fetchApi<GroupSummary[]>("/groups")
      : [];

    return { spacesData, groupsData };
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const { spacesData, groupsData } = await fetchKnowledgeHomeData(canManageSpaces);
      setSpaces(spacesData);
      setGroups(groupsData);
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "无法获取知识库空间数据",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const { spacesData, groupsData } = await fetchKnowledgeHomeData(canManageSpaces);

        if (!active) {
          return;
        }

        setSpaces(spacesData);
        setGroups(groupsData);
      } catch (error) {
        if (!active) {
          return;
        }

        setError(
          error instanceof ApiError ? error.message : "无法获取知识库空间数据",
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
  }, [canManageSpaces, status]);

  useEffect(() => {
    const keyword = pageQuery.trim();

    if (!keyword) {
      return;
    }

    let active = true;

    const timer = window.setTimeout(() => {
      void (async () => {
        if (active) {
          setSearching(true);
        }

        try {
          const results = await fetchApi<KnowledgePageSummary[]>(
            `/knowledge/pages?q=${encodeURIComponent(keyword)}`,
          );

          if (active) {
            setSearchResults(results);
          }
        } catch {
          if (active) {
            setSearchResults([]);
          }
        } finally {
          if (active) {
            setSearching(false);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pageQuery]);

  const visibleSearchResults = pageQuery.trim() ? searchResults : [];

  async function handleCreateSpace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      await sendJson<KnowledgeSpaceSummary, CreateKnowledgeSpacePayload>(
        "/knowledge/spaces",
        "POST",
        {
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description?.trim() || undefined,
          visibility: resolvedVisibility,
          ownerGroupId: resolvedOwnerGroupId?.trim() || undefined,
        },
      );

      setForm({
        code: "",
        name: "",
        description: "",
        visibility: "PUBLIC",
        ownerGroupId: "",
      });
      setMessage("知识库空间已创建。");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "创建知识库空间失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleteSpace(space: KnowledgeSpaceSummary) {
    const blockedReason = getDeleteSpaceBlockedReason(space);

    if (blockedReason) {
      setMessage(`知识空间 ${space.name} 当前无法删除：${blockedReason}`);
      return;
    }

    setPendingDeleteSpace(space);
  }

  async function handleConfirmDeleteSpace() {
    if (!pendingDeleteSpace) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await sendJson<KnowledgeSpaceSummary, Record<string, never>>(
        `/knowledge/spaces/${pendingDeleteSpace.id}`,
        "DELETE",
        {},
      );
      setPendingDeleteSpace(null);
      setMessage(`知识空间 ${pendingDeleteSpace.name} 已删除，14 天内系统管理员可恢复。`);
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "删除知识空间失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      title="知识库空间"
      description="在统一工作台中浏览实验室知识空间，并为方向、年级或公共主题整理知识内容。"
    >
      {pendingDeleteSpace ? (
        <DangerConfirmDialog
          open
          title={`删除空间 ${pendingDeleteSpace.name}`}
          description="删除知识空间前必须再次确认。删除后空间会立即对普通用户不可见，并进入 14 天保留期；仅系统管理员可在到期前恢复。当前仍仅允许删除空空间。"
          confirmText={`确认删除空间 ${pendingDeleteSpace.name}`}
          confirmLabel="请输入确认文案"
          actionLabel="确认删除空间"
          busy={submitting}
          onClose={() => {
            if (!submitting) {
              setPendingDeleteSpace(null);
            }
          }}
          onConfirm={handleConfirmDeleteSpace}
        />
      ) : null}
      <section className="grid gap-6 xl:grid-cols-[1.05fr_1.4fr]">
        {canManageSpaces ? (
          <form
            onSubmit={handleCreateSpace}
            className="app-panel p-6"
          >
            <h2 className="text-xl font-semibold">创建知识库空间</h2>
            <div className="mt-6 grid gap-4">
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">空间名称</div>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="app-input"
                  placeholder="例如：Android 空间"
                />
              </label>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">空间编码</div>
                <input
                  required
                  value={form.code}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, code: event.target.value }))
                  }
                  className="app-input"
                  placeholder="例如：SPACE_ANDROID"
                />
              </label>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">可见性</div>
                <select
                  value={resolvedVisibility}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      visibility: event.target.value as SpaceVisibility,
                    }))
                  }
                  className="app-input"
                >
                  {isScopedGradeKnowledgeAdmin || isScopedDirectionKnowledgeAdmin ? (
                    <option value="GROUP_RESTRICTED">群组可见</option>
                  ) : (
                    <>
                      <option value="PUBLIC">公开</option>
                      <option value="PRIVATE">私有</option>
                      <option value="GROUP_RESTRICTED">群组可见</option>
                    </>
                  )}
                </select>
              </label>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">归属群组</div>
                <select
                  value={resolvedOwnerGroupId ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      ownerGroupId: event.target.value,
                    }))
                  }
                  className="app-input"
                >
                  {isScopedGradeKnowledgeAdmin || isScopedDirectionKnowledgeAdmin ? null : (
                    <option value="">无</option>
                  )}
                  {selectableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                {isScopedDirectionKnowledgeAdmin ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    当前以方向管理员身份创建空间，只能绑定你负责的方向群组。
                  </p>
                ) : null}
                {isScopedGradeKnowledgeAdmin ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    当前以年级管理员身份创建空间，只能绑定你负责的年级群组。
                  </p>
                ) : null}
              </label>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">空间描述</div>
                <textarea
                  value={form.description ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="app-textarea"
                  placeholder="描述空间用途、目标方向和维护方式"
                />
              </label>
            </div>
            <Button
              type="submit"
              disabled={submitting}
              variant="primary"
              className="mt-6"
            >
              创建空间
            </Button>
          </form>
        ) : (
          <section className="app-panel p-6">
            <h2 className="text-xl font-semibold">空间管理说明</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-300">
              当前账号可以浏览有权限的知识空间，并在已开放的空间下新建或编辑知识页面。知识空间本身由管理员统一维护。
            </p>
          </section>
        )}

        <section className="space-y-6">
          <section className="app-panel p-6">
            <h2 className="text-xl font-semibold">搜索文章</h2>
            <input
              value={pageQuery}
              onChange={(event) => setPageQuery(event.target.value)}
              className="app-input mt-4"
              placeholder="搜索标题、正文或标签"
            />
            {pageQuery.trim() ? (
              <div className="mt-4 divide-y divide-white/10">
                {searching ? (
                  <div className="py-4 text-sm text-zinc-400">正在搜索...</div>
                ) : visibleSearchResults.length > 0 ? (
                  visibleSearchResults.slice(0, 8).map((page) => (
                    <article
                      key={page.id}
                      className="group relative isolate py-4 transition-colors duration-200 hover:text-sky-200"
                    >
                      <Link
                        href={`/portal/knowledge/pages/${page.id}`}
                        aria-label={`查看页面 ${page.title}`}
                        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                      />
                      <div className="pointer-events-none">
                        <div className="text-sm text-zinc-500">{page.space.name}</div>
                        <div className="mt-1 font-medium text-foreground-strong transition-colors duration-200 group-hover:text-accent-strong">
                          {page.title}
                        </div>
                        <MarkdownContent
                          markdown={page.summary || page.contentMd}
                          className="markdown-list-preview mt-1 text-sm text-zinc-400"
                          emptyHtml='<p class="text-zinc-500">暂无摘要</p>'
                        />
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="py-4 text-sm text-zinc-400">没有匹配文章</div>
                )}
              </div>
            ) : null}
          </section>

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
              正在加载知识库空间...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
              {error}
            </div>
          ) : (
            <div className="grid gap-4">
              {spaces.map((space) => {
                const deleteBlockedReason =
                  deleteSpaceBlockedReasonById.get(space.id) ?? null;
                const accessGroups = space.accessGroups ?? [];

                return (
                  <article
                    key={space.id}
                    className="app-panel p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          {space.parentSpace ? `子知识库 · ${space.code}` : space.code}
                        </div>
                        <h2 className="mt-2 text-2xl font-semibold">{space.name}</h2>
                        <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-300">
                          {space.description || "暂无空间描述"}
                        </p>
                        {space.parentSpace ? (
                          <div className="mt-3 text-xs text-zinc-500">
                            上级空间：{space.parentSpace.name}
                          </div>
                        ) : null}
                        {accessGroups.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {accessGroups.map((item) => (
                              <span key={item.id} className="app-pill text-xs">
                                {item.group.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right text-sm text-zinc-300">
                        <div>{visibilityMap[space.visibility]}</div>
                        <div className="mt-2">{space._count.pages} 篇页面</div>
                        <div className="mt-2 text-xs text-zinc-500">
                          {space.ownerGroup?.name || "未绑定群组"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link
                        href={`/portal/knowledge/spaces/${space.id}`}
                        className={buttonClassName({ variant: "primary", size: "sm" })}
                      >
                        进入空间
                      </Link>
                      {user &&
                      canDeleteKnowledgeSpace(
                        space,
                        activeRoleCode,
                        user.groupIds,
                      ) ? (
                        <DisabledActionHint
                          disabled={Boolean(deleteBlockedReason)}
                          reason={deleteBlockedReason}
                        >
                          <Button
                            type="button"
                            onClick={() => handleDeleteSpace(space)}
                            variant="dangerOutline"
                            size="sm"
                            disabled={submitting || Boolean(deleteBlockedReason)}
                            title={
                              deleteBlockedReason
                                ? undefined
                                : `删除空间 ${space.name}`
                            }
                          >
                            删除空间
                          </Button>
                        </DisabledActionHint>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </PortalShell>
  );
}
