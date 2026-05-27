"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { KnowledgeEditor } from "@/app/knowledge/_components/knowledge-editor";
import { PortalShell } from "@/app/portal/_components/portal-shell";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  CreateKnowledgePagePayload,
  KnowledgePageSummary,
  KnowledgeSpaceDetail,
  PageStatus,
} from "@/lib/contracts";
import { buildKnowledgePageTree, flattenKnowledgeTree } from "@/lib/knowledge-tree";

export default function PortalKnowledgeNewPage() {
  const params = useParams<{ spaceId: string }>();
  const router = useRouter();
  const spaceId = params.spaceId;
  const [space, setSpace] = useState<KnowledgeSpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [form, setForm] = useState<CreateKnowledgePagePayload & { contentRawJson?: unknown }>({
    spaceId,
    parentId: "",
    title: "",
    summary: "",
    contentMd: "",
    contentRawJson: null,
    tags: [],
    status: "DRAFT",
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parentId = new URLSearchParams(window.location.search).get("parentId");

      if (parentId) {
        setForm((prev) => ({ ...prev, parentId }));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

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
          error instanceof ApiError ? error.message : "无法获取知识空间数据",
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

  const parentOptions = useMemo(() => {
    if (!space) {
      return [];
    }

    return flattenKnowledgeTree(buildKnowledgePageTree(space.pages));
  }, [space]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const createdPage = await sendJson<
        KnowledgePageSummary,
        CreateKnowledgePagePayload & { contentRawJson?: unknown }
      >("/knowledge/pages", "POST", {
        spaceId,
        parentId: form.parentId?.trim() || undefined,
        title: form.title.trim(),
        summary: form.summary?.trim() || undefined,
        contentMd: form.contentMd,
        contentRawJson: form.contentRawJson,
        tags: tagInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        status: form.status,
      });

      router.replace(`/portal/knowledge/pages/${createdPage.id}/edit`);
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "创建知识页面失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      title={space ? `新建：${space.name}` : "新建知识页面"}
      description={space?.description || "在独立写作页中整理知识内容。"}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {loading ? (
          <div className="app-panel p-6 text-sm text-zinc-300">
            正在打开写作页...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
            {error}
          </div>
        ) : space ? (
          <form
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            <section className="app-panel p-6">
              <div className="grid gap-4">
                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="w-full border-b border-white/10 bg-transparent px-1 pb-4 text-4xl font-semibold text-white outline-none placeholder:text-zinc-600"
                  placeholder="页面标题"
                />
                <textarea
                  value={form.summary ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, summary: event.target.value }))
                  }
                  className="min-h-20 w-full resize-none border-b border-white/10 bg-transparent px-1 py-3 text-sm leading-7 text-zinc-300 outline-none placeholder:text-zinc-600"
                  placeholder="摘要"
                />
              </div>
            </section>

            <section className="app-panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">发布设置</h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    设置页面归属与发布状态后，正文区域会保持更宽的编辑空间。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="app-button-primary"
                  >
                    保存页面
                  </button>
                  <Link
                    href={`/portal/knowledge/spaces/${space.id}`}
                    className="app-button-secondary"
                  >
                    返回目录
                  </Link>
                </div>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">父级页面</div>
                  <select
                    value={form.parentId ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        parentId: event.target.value,
                      }))
                    }
                    className="app-input"
                  >
                    <option value="">作为顶级页面</option>
                    {parentOptions.map(({ page, depth }) => (
                      <option key={page.id} value={page.id}>
                        {"· ".repeat(depth)}
                        {page.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">标签</div>
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    className="app-input"
                    placeholder="android, interview"
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
                    className="app-input"
                  >
                    <option value="DRAFT">草稿</option>
                    <option value="PUBLISHED">已发布</option>
                    <option value="ARCHIVED">已归档</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="app-panel p-6">
              <div className="mb-3">
                <h2 className="text-lg font-semibold">正文编辑器</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  直接以阅读样式编写知识内容，必要时切换到分栏预览核对效果。
                </p>
              </div>
              <KnowledgeEditor
                spaceId={spaceId}
                value={form.contentMd}
                onChange={({ markdown, rawJson }) =>
                  setForm((prev) => ({
                    ...prev,
                    contentMd: markdown,
                    contentRawJson: rawJson,
                  }))
                }
              />
            </section>

            {message ? (
              <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-100">
                {message}
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
    </PortalShell>
  );
}
