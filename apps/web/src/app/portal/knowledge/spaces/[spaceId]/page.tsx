"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import type {
  CreateKnowledgePagePayload,
  KnowledgePageSummary,
  KnowledgeSpaceDetail,
  PageStatus,
} from "@/lib/contracts";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { PortalShell } from "@/app/portal/_components/portal-shell";

const statusMap: Record<PageStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

export default function PortalKnowledgeSpaceDetailPage() {
  const params = useParams<{ spaceId: string }>();
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const spaceId = params.spaceId;
  const [space, setSpace] = useState<KnowledgeSpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDangerAction, setPendingDangerAction] = useState<
    | {
        type: "delete-space";
        space: KnowledgeSpaceDetail;
      }
    | {
        type: "delete-page";
        page: KnowledgeSpaceDetail["pages"][number];
      }
    | null
  >(null);
  const [tagInput, setTagInput] = useState("");
  const [form, setForm] = useState<CreateKnowledgePagePayload>({
    spaceId,
    title: "",
    slug: "",
    summary: "",
    contentMd: "",
    tags: [],
    status: "DRAFT",
  });

  async function fetchSpaceData(currentSpaceId: string) {
    const spaceData = await fetchApi<KnowledgeSpaceDetail>(
      `/knowledge/spaces/${currentSpaceId}`,
    );

    return { spaceData };
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const { spaceData } = await fetchSpaceData(spaceId);
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
        const { spaceData } = await fetchSpaceData(spaceId);

        if (!active) {
          return;
        }

        setSpace(spaceData);
        setForm((prev) => ({
          ...prev,
          spaceId,
        }));
        setTagInput("");
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

  async function handleCreatePage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      await sendJson("/knowledge/pages", "POST", {
        spaceId,
        title: form.title.trim(),
        slug: form.slug.trim(),
        summary: form.summary?.trim() || undefined,
        contentMd: form.contentMd,
        tags: tagInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        status: form.status,
      });

      setForm({
        spaceId,
        title: "",
        slug: "",
        summary: "",
        contentMd: "",
        tags: [],
        status: "DRAFT",
      });
      setTagInput("");
      setMessage("知识库页面已创建。");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "创建知识库页面失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function canDeletePage(page: KnowledgeSpaceDetail["pages"][number]) {
    if (isAdmin) {
      return true;
    }

    return Boolean(user && (page.authorId === user.id || page.editorId === user.id));
  }

  function handleDeleteSpace(spaceDetail: KnowledgeSpaceDetail) {
    if (spaceDetail.pages.length > 0) {
      setMessage(
        `知识空间 ${spaceDetail.name} 当前无法删除：仍有 ${spaceDetail.pages.length} 篇页面。请先删除页面后再删除空间。`,
      );
      return;
    }

    setPendingDangerAction({
      type: "delete-space",
      space: spaceDetail,
    });
  }

  function handleDeletePage(page: KnowledgeSpaceDetail["pages"][number]) {
    setPendingDangerAction({
      type: "delete-page",
      page,
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
      setMessage(`知识页面 ${pendingDangerAction.page.title} 已删除。`);
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

  return (
    <PortalShell
      title={space?.name || "知识库空间"}
      description={space?.description || "在该空间下管理知识页面、目录结构和方向内容。"}
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
              ? "该操作会删除当前知识空间。为防止误操作，请输入确认文案后继续。"
              : "该操作会删除当前知识页面，删除后不可恢复。为防止误操作，请输入确认文案后继续。"
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
      <section className="grid gap-6 xl:grid-cols-[1.05fr_1.4fr]">
        <form
          onSubmit={handleCreatePage}
          className="rounded-3xl border border-white/10 bg-white/5 p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">新建知识页面</h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/portal/knowledge"
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-100 transition hover:bg-white/5"
              >
                返回空间列表
              </Link>
              {isAdmin && space ? (
                <button
                  type="button"
                  onClick={() => handleDeleteSpace(space)}
                  disabled={submitting || space.pages.length > 0}
                  className="inline-flex cursor-pointer items-center justify-center rounded-full border border-red-400/20 px-4 py-2 text-sm text-red-100 transition-colors duration-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    space.pages.length > 0
                      ? "请先删除该空间下的页面后再删除空间"
                      : `删除空间 ${space.name}`
                  }
                >
                  删除空间
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-6 grid gap-4">
            <label className="text-sm">
              <div className="mb-2 text-zinc-300">页面标题</div>
              <input
                required
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
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
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
              />
            </label>
            <label className="text-sm">
              <div className="mb-2 text-zinc-300">摘要</div>
              <textarea
                value={form.summary ?? ""}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, summary: event.target.value }))
                }
                className="min-h-20 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
              />
            </label>
            <label className="text-sm">
              <div className="mb-2 text-zinc-300">Markdown 内容</div>
              <textarea
                required
                value={form.contentMd}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    contentMd: event.target.value,
                  }))
                }
                className="min-h-56 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-mono outline-none"
                placeholder={"# 标题\n\n写下你的知识内容"}
              />
            </label>
            <label className="text-sm">
              <div className="mb-2 text-zinc-300">标签</div>
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
                placeholder="用英文逗号分隔，例如：android, guide"
              />
            </label>
            <label className="text-sm">
              <div className="mb-2 text-zinc-300">状态</div>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as PageStatus,
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
              >
                <option value="DRAFT">草稿</option>
                <option value="PUBLISHED">已发布</option>
                <option value="ARCHIVED">已归档</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-6 rounded-full bg-sky-400 px-5 py-3 text-sm font-medium text-zinc-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            创建页面
          </button>
        </form>

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
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
              正在加载空间详情...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
              {error}
            </div>
          ) : space ? (
            <div className="space-y-4">
              {space.pages.length > 0 ? (
                space.pages.map((page) => (
                  <article
                    key={page.id}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold">{page.title}</h2>
                        <p className="mt-2 text-sm text-zinc-400">{page.slug}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-200">
                        {statusMap[page.status]}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-zinc-300">
                      {page.summary || "暂无摘要"}
                    </p>
                    <div
                      className="prose prose-invert mt-4 max-w-none rounded-2xl bg-black/20 p-4 text-sm"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownToHtml(page.contentMd),
                      }}
                    />
                    {page.tags.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {page.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        href={`/portal/knowledge/pages/${page.id}`}
                        className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/5"
                      >
                        查看页面
                      </Link>
                      <Link
                        href={`/portal/knowledge/pages/${page.id}/edit`}
                        className="rounded-full bg-sky-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-sky-300"
                      >
                        编辑页面
                      </Link>
                      {canDeletePage(page) ? (
                        <button
                          type="button"
                          onClick={() => handleDeletePage(page)}
                          disabled={submitting}
                          className="inline-flex cursor-pointer items-center justify-center rounded-full border border-red-400/20 px-4 py-2 text-sm text-red-100 transition-colors duration-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          删除页面
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
                  当前空间还没有页面，先在左侧创建第一篇内容。
                </div>
              )}
            </div>
          ) : null}
        </section>
      </section>
    </PortalShell>
  );
}
