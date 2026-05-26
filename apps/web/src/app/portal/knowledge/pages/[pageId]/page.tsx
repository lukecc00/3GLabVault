"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type { KnowledgePageSummary, PageStatus } from "@/lib/contracts";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { PortalShell } from "@/app/portal/_components/portal-shell";

const statusMap: Record<PageStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

export default function PortalKnowledgePageDetailPage() {
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
      title={page?.title || "知识页面"}
      description={page?.summary || "查看知识正文、标签和所属空间信息。"}
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
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
            <section className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-sky-300">{page.space.name}</div>
                  <h2 className="mt-2 text-4xl font-semibold tracking-tight">
                    {page.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">
                    {page.summary || "暂无摘要"}
                  </p>
                </div>
                <div className="text-right text-sm text-zinc-300">
                  <div>{statusMap[page.status]}</div>
                  <div className="mt-2 text-zinc-500">{page.slug}</div>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/portal/knowledge/spaces/${page.spaceId}`}
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/5"
                >
                  返回空间
                </Link>
                <Link
                  href={`/portal/knowledge/pages/${page.id}/edit`}
                  className="rounded-full bg-sky-400 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-sky-300"
                >
                  编辑页面
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
            </section>

            <article className="rounded-3xl border border-white/10 bg-white/5 p-8">
              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(page.contentMd),
                }}
              />
              {page.tags.length > 0 ? (
                <div className="mt-8 flex flex-wrap gap-2">
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
            </article>
          </>
        ) : null}
      </div>
    </PortalShell>
  );
}
