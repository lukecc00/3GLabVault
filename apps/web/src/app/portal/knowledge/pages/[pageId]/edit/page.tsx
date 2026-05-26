"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KnowledgeEditor } from "@/app/knowledge/_components/knowledge-editor";
import { PortalShell } from "@/app/portal/_components/portal-shell";
import { useAuth } from "@/components/auth/auth-provider";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  KnowledgePageSummary,
  PageStatus,
  UpdateKnowledgePagePayload,
} from "@/lib/contracts";

export default function PortalKnowledgePageEditPage() {
  const params = useParams<{ pageId: string }>();
  const router = useRouter();
  const { isAdmin, user } = useAuth();
  const pageId = params.pageId;
  const [page, setPage] = useState<KnowledgePageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [form, setForm] = useState<UpdateKnowledgePagePayload>({
    title: "",
    slug: "",
    summary: "",
    contentMd: "",
    contentRawJson: null,
    tags: [],
    status: "DRAFT",
  });

  async function fetchEditData(currentPageId: string) {
    const pageData = await fetchApi<KnowledgePageSummary>(
      `/knowledge/pages/${currentPageId}`,
    );

    return { pageData };
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { pageData } = await fetchEditData(pageId);

        if (!active) {
          return;
        }

        setPage(pageData);
        setForm({
          title: pageData.title,
          slug: pageData.slug,
          summary: pageData.summary || "",
          contentMd: pageData.contentMd,
          contentRawJson: pageData.contentRawJson,
          tags: pageData.tags,
          status: pageData.status,
        });
        setTagInput(pageData.tags.join(", "));
      } catch (error) {
        if (!active) {
          return;
        }

        setError(
          error instanceof ApiError ? error.message : "无法获取页面编辑数据",
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const payload: UpdateKnowledgePagePayload = {
        title: form.title?.trim(),
        slug: form.slug?.trim(),
        summary: form.summary?.trim() || undefined,
        contentMd: form.contentMd,
        contentRawJson: form.contentRawJson,
        tags: tagInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        status: form.status,
      };

      const updatedPage = await sendJson<
        KnowledgePageSummary,
        UpdateKnowledgePagePayload
      >(`/knowledge/pages/${pageId}`, "PATCH", payload);

      setPage(updatedPage);
      setForm({
        title: updatedPage.title,
        slug: updatedPage.slug,
        summary: updatedPage.summary || "",
        contentMd: updatedPage.contentMd,
        contentRawJson: updatedPage.contentRawJson,
        tags: updatedPage.tags,
        status: updatedPage.status,
      });
      setTagInput(updatedPage.tags.join(", "));
      setMessage("知识页面已更新。");
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "更新知识页面失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canDeletePage =
    Boolean(page) &&
    (isAdmin ||
      (user && (page?.authorId === user.id || page?.editorId === user.id)));

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

  return (
    <PortalShell
      title={page ? `编辑：${page.title}` : "页面编辑"}
      description="当前使用 TipTap + Markdown 编辑链路，保存时会同时提交 Markdown 与结构化 JSON。"
    >
      {confirmDeleteOpen && page ? (
        <DangerConfirmDialog
          open
          title={`删除页面 ${page.title}`}
          description="删除后当前知识页面将不可恢复。为防止误操作，请输入确认文案后继续。"
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            正在加载编辑器...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
            {error}
          </div>
        ) : page ? (
          <form
            onSubmit={handleSubmit}
            className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"
          >
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">编辑内容</h2>
                <div className="flex gap-3">
                  <Link
                    href={`/portal/knowledge/pages/${page.id}`}
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/5"
                  >
                    查看页面
                  </Link>
                  <Link
                    href={`/portal/knowledge/spaces/${page.spaceId}`}
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/5"
                  >
                    返回空间
                  </Link>
                  {canDeletePage ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteOpen(true)}
                      disabled={submitting}
                      className="inline-flex cursor-pointer items-center justify-center rounded-full border border-red-400/20 px-4 py-2 text-sm text-red-100 transition-colors duration-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      删除页面
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-6 grid gap-4">
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">页面标题</div>
                  <input
                    required
                    value={form.title ?? ""}
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
                    value={form.slug ?? ""}
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
                      setForm((prev) => ({
                        ...prev,
                        summary: event.target.value,
                      }))
                    }
                    className="min-h-20 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
                  />
                </label>
                <div>
                  <div className="mb-2 text-sm text-zinc-300">正文编辑器</div>
                  <KnowledgeEditor
                    value={form.contentMd ?? ""}
                    onChange={({ markdown, rawJson }) =>
                      setForm((prev) => ({
                        ...prev,
                        contentMd: markdown,
                        contentRawJson: rawJson,
                      }))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-xl font-semibold">发布设置</h2>
                <div className="mt-6 grid gap-4">
                  <label className="text-sm">
                    <div className="mb-2 text-zinc-300">标签</div>
                    <input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none"
                      placeholder="例如：android, guide"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-2 text-zinc-300">状态</div>
                    <select
                      value={form.status ?? "DRAFT"}
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
                  保存页面
                </button>
              </div>

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
            </section>
          </form>
        ) : null}
      </div>
    </PortalShell>
  );
}
