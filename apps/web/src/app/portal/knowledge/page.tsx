"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  CreateKnowledgeSpacePayload,
  GroupSummary,
  KnowledgeSpaceSummary,
  SpaceVisibility,
} from "@/lib/contracts";
import { PortalShell } from "../_components/portal-shell";

const visibilityMap: Record<SpaceVisibility, string> = {
  PUBLIC: "公开",
  PRIVATE: "私有",
  GROUP_RESTRICTED: "群组可见",
};

export default function PortalKnowledgeHomePage() {
  const { isAdmin } = useAuth();
  const [spaces, setSpaces] = useState<KnowledgeSpaceSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeleteSpace, setPendingDeleteSpace] =
    useState<KnowledgeSpaceSummary | null>(null);
  const [form, setForm] = useState<CreateKnowledgeSpacePayload>({
    code: "",
    slug: "",
    name: "",
    description: "",
    visibility: "PUBLIC",
    ownerGroupId: "",
  });

  async function fetchKnowledgeHomeData() {
    const [spacesData, groupsData] = await Promise.all([
      fetchApi<KnowledgeSpaceSummary[]>("/knowledge/spaces"),
      fetchApi<GroupSummary[]>("/groups"),
    ]);

    return { spacesData, groupsData };
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const { spacesData, groupsData } = await fetchKnowledgeHomeData();
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
    let active = true;

    void (async () => {
      try {
        const { spacesData, groupsData } = await fetchKnowledgeHomeData();

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
  }, []);

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
          slug: form.slug.trim(),
          name: form.name.trim(),
          description: form.description?.trim() || undefined,
          visibility: form.visibility,
          ownerGroupId: form.ownerGroupId?.trim() || undefined,
        },
      );

      setForm({
        code: "",
        slug: "",
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
    if (space._count.pages > 0) {
      setMessage(
        `知识空间 ${space.name} 当前无法删除：仍有 ${space._count.pages} 篇页面。请先删除或迁移页面后再删除空间。`,
      );
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
      setMessage(`知识空间 ${pendingDeleteSpace.name} 已删除。`);
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
          description="删除知识空间前必须再次确认。该操作不可撤销，且只有在空间内没有页面时才允许执行。"
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
        {isAdmin ? (
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
                <div className="mb-2 text-zinc-300">Slug</div>
                <input
                  required
                  value={form.slug}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, slug: event.target.value }))
                  }
                  className="app-input"
                  placeholder="例如：android-space"
                />
              </label>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">可见性</div>
                <select
                  value={form.visibility}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      visibility: event.target.value as SpaceVisibility,
                    }))
                  }
                  className="app-input"
                >
                  <option value="PUBLIC">公开</option>
                  <option value="PRIVATE">私有</option>
                  <option value="GROUP_RESTRICTED">群组可见</option>
                </select>
              </label>
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">归属群组</div>
                <select
                  value={form.ownerGroupId ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      ownerGroupId: event.target.value,
                    }))
                  }
                  className="app-input"
                >
                  <option value="">无</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
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
            <button
              type="submit"
              disabled={submitting}
              className="app-button-primary mt-6"
            >
              创建空间
            </button>
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
              {spaces.map((space) => (
                <article
                  key={space.id}
                  className="app-panel p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        {space.code}
                      </div>
                      <h2 className="mt-2 text-2xl font-semibold">{space.name}</h2>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-300">
                        {space.description || "暂无空间描述"}
                      </p>
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
                      className="app-button-primary px-4 py-2"
                    >
                      进入空间
                    </Link>
                    <span className="app-pill px-4 py-2">
                      slug: {space.slug}
                    </span>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSpace(space)}
                        disabled={submitting || space._count.pages > 0}
                        className="inline-flex cursor-pointer items-center justify-center rounded-full border border-red-400/20 px-4 py-2 text-sm text-red-100 transition-colors duration-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          space._count.pages > 0
                            ? "请先删除或迁移该空间下的页面后再删除"
                            : `删除空间 ${space.name}`
                        }
                      >
                        删除空间
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </PortalShell>
  );
}
