"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KnowledgeEditor } from "@/app/knowledge/_components/knowledge-editor";
import { PortalShell } from "@/app/portal/_components/portal-shell";
import { useAuth } from "@/components/auth/auth-provider";
import { Button, buttonClassName } from "@/components/ui/button";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  CreateKnowledgePageAccessRequestPayload,
  KnowledgePageAccessRequestSummary,
  KnowledgePageApprovalTarget,
  KnowledgePageSummary,
  KnowledgeSpaceDetail,
  PageStatus,
  UpdateKnowledgePagePayload,
} from "@/lib/contracts";
import { buildKnowledgePageTree, flattenKnowledgeTree } from "@/lib/knowledge-tree";

function approverKindLabel(kind: KnowledgePageApprovalTarget["reviewerKind"]) {
  if (kind === "PAGE_OWNER") {
    return "页面所有者";
  }

  if (kind === "SPACE_OWNER") {
    return "知识库所有者";
  }

  return "实验室管理员";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function PortalKnowledgePageEditPage() {
  const params = useParams<{ pageId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const pageId = params.pageId;
  const [page, setPage] = useState<KnowledgePageSummary | null>(null);
  const [space, setSpace] = useState<KnowledgeSpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [selectedApprovalTargetId, setSelectedApprovalTargetId] = useState("");
  const [form, setForm] = useState<UpdateKnowledgePagePayload>({
    parentId: null,
    title: "",
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
    const spaceData = await fetchApi<KnowledgeSpaceDetail>(
      `/knowledge/spaces/${pageData.spaceId}`,
    );

    return { pageData, spaceData };
  }

  function applyEditData(
    pageData: KnowledgePageSummary,
    spaceData: KnowledgeSpaceDetail,
  ) {
    setPage(pageData);
    setSpace(spaceData);
    setForm({
      parentId: pageData.parentId,
      title: pageData.title,
      summary: pageData.summary || "",
      contentMd: pageData.contentMd,
      contentRawJson: pageData.contentRawJson,
      tags: pageData.tags,
      status: pageData.status,
    });
    setTagInput(pageData.tags.join(", "));
    setSelectedApprovalTargetId((currentTargetId) => {
      const targets = pageData.editPermission?.availableApprovalTargets ?? [];
      const pendingReviewerId = pageData.editPermission?.pendingRequest?.reviewerId;

      if (
        pendingReviewerId &&
        targets.some((target) => target.reviewerId === pendingReviewerId)
      ) {
        return pendingReviewerId;
      }

      if (
        currentTargetId &&
        targets.some((target) => target.reviewerId === currentTargetId)
      ) {
        return currentTargetId;
      }

      return targets[0]?.reviewerId ?? "";
    });
  }

  async function reloadEditData(currentPageId: string) {
    const { pageData, spaceData } = await fetchEditData(currentPageId);
    applyEditData(pageData, spaceData);
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { pageData, spaceData } = await fetchEditData(pageId);

        if (!active) {
          return;
        }

        applyEditData(pageData, spaceData);
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
        parentId: form.parentId || null,
        title: form.title?.trim(),
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

      setPage((currentPage) => ({
        ...updatedPage,
        editPermission: updatedPage.editPermission ?? currentPage?.editPermission,
      }));
      setForm({
        parentId: updatedPage.parentId,
        title: updatedPage.title,
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
    page?.editPermission?.canDelete ??
    Boolean(user && (page?.authorId === user.id || (!page?.authorId && page?.editorId === user.id)));
  const canEditPage =
    page?.editPermission?.canEdit ??
    Boolean(user && (page?.authorId === user.id || page?.editorId === user.id));
  const pendingApprovalRequest = page?.editPermission?.pendingRequest ?? null;
  const approvalTargets = page?.editPermission?.availableApprovalTargets ?? [];

  const parentOptions = space
    ? flattenKnowledgeTree(buildKnowledgePageTree(space.pages)).filter(
        ({ page: optionPage }) => optionPage.id !== pageId,
      )
    : [];

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

  async function handleSubmitApprovalRequest(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!page) {
      return;
    }

    const selectedTarget = approvalTargets.find(
      (target) => target.reviewerId === selectedApprovalTargetId,
    );

    if (!selectedTarget) {
      setMessage("请先选择审批人。");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const payload: CreateKnowledgePageAccessRequestPayload = {
        pageId: page.id,
        reviewerId: selectedTarget.reviewerId,
        reviewerKind: selectedTarget.reviewerKind,
        reason: approvalReason.trim() || undefined,
      };

      await sendJson<
        KnowledgePageAccessRequestSummary,
        CreateKnowledgePageAccessRequestPayload
      >("/knowledge/page-access-requests", "POST", payload);
      setApprovalReason("");
      await reloadEditData(page.id);
      setMessage("编辑权限申请已提交，请等待审批。");
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "提交编辑权限申请失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell
      title={page ? `编辑：${page.title}` : "页面编辑"}
      description="整理正文、目录归属和发布状态。"
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        {loading ? (
          <div className="app-panel-muted p-6 text-sm text-zinc-300">
            正在加载编辑器...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
            {error}
          </div>
        ) : page ? (
          canEditPage ? (
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <section className="app-panel-muted p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">编辑内容</h2>
                  <div className="flex gap-3">
                    <Link
                      href={`/portal/knowledge/pages/${page.id}`}
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      查看页面
                    </Link>
                    <Link
                      href={`/portal/knowledge/spaces/${page.spaceId}`}
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      返回空间
                    </Link>
                    {canDeletePage ? (
                      <Button
                        type="button"
                        onClick={() => setConfirmDeleteOpen(true)}
                        variant="dangerOutline"
                        size="sm"
                        disabled={submitting}
                      >
                        删除页面
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
                  <label className="text-sm">
                    <div className="mb-2 text-zinc-300">页面标题</div>
                    <input
                      required
                      value={form.title ?? ""}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                      className="app-input"
                    />
                  </label>
                  <label className="text-sm">
                    <div className="mb-2 text-zinc-300">父级页面</div>
                    <select
                      value={form.parentId ?? ""}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          parentId: event.target.value || null,
                        }))
                      }
                      className="app-input"
                    >
                      <option value="">作为顶级页面</option>
                      {parentOptions.map(({ page: optionPage, depth }) => (
                        <option key={optionPage.id} value={optionPage.id}>
                          {"· ".repeat(depth)}
                          {optionPage.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="mt-4 block text-sm">
                  <div className="mb-2 text-zinc-300">摘要</div>
                  <textarea
                    value={form.summary ?? ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        summary: event.target.value,
                      }))
                    }
                    className="app-textarea min-h-20"
                  />
                </label>
              </section>

              <section className="app-panel-muted p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">发布设置</h2>
                    <p className="mt-2 text-sm text-zinc-400">
                      设置标签与发布状态后，正文区域会获得更完整的可编辑宽度。
                    </p>
                  </div>
                  <div className="flex max-w-full flex-col items-start gap-3">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="app-button-primary"
                      >
                        保存页面
                      </button>
                      <Link
                        href={`/portal/knowledge/spaces/${page.spaceId}`}
                        className={buttonClassName({ variant: "secondary", size: "md" })}
                      >
                        返回空间
                      </Link>
                    </div>
                    {message ? (
                      <div
                        className={`max-w-full rounded-2xl border px-4 py-3 text-sm ${
                          message.includes("失败") || message.includes("存在")
                            ? "border-red-400/20 bg-red-400/10 text-[var(--danger-strong)]"
                            : "border-emerald-300/30 bg-emerald-400/15 text-[var(--success-strong)] shadow-sm"
                        }`}
                        role={message.includes("失败") || message.includes("存在") ? "alert" : "status"}
                        aria-live="polite"
                      >
                        {message}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <label className="text-sm">
                    <div className="mb-2 text-zinc-300">标签</div>
                    <input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      className="app-input"
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
                      className="app-input"
                    >
                      <option value="DRAFT">草稿</option>
                      <option value="PUBLISHED">已发布</option>
                      <option value="ARCHIVED">已归档</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="app-panel-muted p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">正文编辑器</h2>
                    <p className="mt-2 text-sm text-zinc-400">
                      直接按阅读样式写作，支持撤销快捷键和分栏预览。
                    </p>
                  </div>
                </div>
                <KnowledgeEditor
                  spaceId={page.spaceId}
                  value={form.contentMd ?? ""}
                  onChange={({ markdown, rawJson }) =>
                    setForm((prev) => ({
                      ...prev,
                      contentMd: markdown,
                      contentRawJson: rawJson,
                    }))
                  }
                />
              </section>

            </form>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="app-panel-muted p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-sky-300">{page.space.name}</div>
                    <h2 className="mt-2 text-2xl font-semibold">当前账号无权编辑该页面</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-300">
                      你可以向当前页面所有者、当前知识库所有者或实验室管理员发起权限审批。审批通过后，你会获得该页面的编辑权限，但不会获得页面或知识库的所有权。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/portal/knowledge/pages/${page.id}`}
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      查看页面
                    </Link>
                    <Link
                      href={`/portal/knowledge/spaces/${page.spaceId}`}
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      返回空间
                    </Link>
                    <Link
                      href="/portal/knowledge/approvals"
                      className={buttonClassName({ variant: "primary", size: "sm" })}
                    >
                      打开权限审批
                    </Link>
                  </div>
                </div>
                <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
                  <div className="text-sm text-zinc-400">页面标题</div>
                  <div className="mt-2 text-lg font-semibold text-foreground-strong">
                    {page.title}
                  </div>
                  <div className="mt-4 text-sm text-zinc-300">
                    页面所有者：{page.author?.realName || "未设置"}
                    {page.editor && page.editor.id !== page.author?.id
                      ? ` / 当前编辑者：${page.editor.realName}`
                      : ""}
                  </div>
                </div>
                {pendingApprovalRequest ? (
                  <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
                    当前已有一条待处理的权限审批，审批人是
                    {pendingApprovalRequest.reviewer.realName}（
                    {approverKindLabel(pendingApprovalRequest.reviewerKind)}），提交时间为
                    {formatDateTime(pendingApprovalRequest.createdAt)}。
                  </div>
                ) : null}
              </section>

              <section className="space-y-6">
                <form onSubmit={handleSubmitApprovalRequest} className="app-panel-muted p-6">
                  <h2 className="text-xl font-semibold">发起权限审批</h2>
                  <div className="mt-6 grid gap-4">
                    <label className="text-sm">
                      <div className="mb-2 text-zinc-300">选择审批人</div>
                      <select
                        value={selectedApprovalTargetId}
                        onChange={(event) => setSelectedApprovalTargetId(event.target.value)}
                        className="app-input"
                        disabled={Boolean(pendingApprovalRequest) || approvalTargets.length === 0}
                      >
                        <option value="">请选择审批人</option>
                        {approvalTargets.map((target) => (
                          <option key={target.reviewerId} value={target.reviewerId}>
                            {target.reviewerName} · {approverKindLabel(target.reviewerKind)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-2xl border border-border/80 bg-surface-soft px-4 py-3 text-sm text-zinc-300">
                      {selectedApprovalTargetId
                        ? (() => {
                            const selectedTarget = approvalTargets.find(
                              (target) => target.reviewerId === selectedApprovalTargetId,
                            );

                            if (!selectedTarget) {
                              return "当前审批人信息不可用。";
                            }

                            return `将提交给 ${selectedTarget.reviewerName}（${approverKindLabel(
                              selectedTarget.reviewerKind,
                            )}，${selectedTarget.reviewerEmail}）。`;
                          })()
                        : "请选择页面所有者、知识库所有者或实验室管理员作为审批人。"}
                    </div>
                    <label className="text-sm">
                      <div className="mb-2 text-zinc-300">申请说明</div>
                      <textarea
                        value={approvalReason}
                        onChange={(event) => setApprovalReason(event.target.value)}
                        className="app-textarea min-h-28"
                        placeholder="可说明你需要编辑该页面的原因、范围和预期修改内容"
                        disabled={Boolean(pendingApprovalRequest)}
                      />
                    </label>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        Boolean(pendingApprovalRequest) ||
                        approvalTargets.length === 0
                      }
                      className="app-button-primary"
                    >
                      提交审批申请
                    </button>
                    <Link
                      href="/portal/knowledge/approvals"
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      查看审批进度
                    </Link>
                  </div>
                </form>

                {approvalTargets.length === 0 ? (
                  <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-100">
                    当前页面暂未找到可用审批人，请联系实验室管理员补充页面或知识库所有者后再试。
                  </div>
                ) : null}

                {message ? (
                  <div
                    className={`rounded-3xl border p-5 ${
                      message.includes("失败") || message.includes("不存在")
                        ? "border-red-400/20 bg-red-400/10 text-[var(--danger-strong)]"
                        : "border-emerald-400/20 bg-emerald-400/10 text-[var(--success-strong)]"
                    }`}
                  >
                    {message}
                  </div>
                ) : null}
              </section>
            </div>
          )
        ) : null}
      </div>
    </PortalShell>
  );
}
