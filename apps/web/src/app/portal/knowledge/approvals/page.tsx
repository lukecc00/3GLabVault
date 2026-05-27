"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PortalShell } from "@/app/portal/_components/portal-shell";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  KnowledgeApprovalSection,
  KnowledgePageAccessApproverKind,
  KnowledgePageAccessRequestDashboard,
  KnowledgePageAccessRequestSummary,
  KnowledgePageAccessRequestStatus,
  ReviewKnowledgePageAccessRequestPayload,
} from "@/lib/contracts";

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

function approverKindLabel(kind: KnowledgePageAccessRequestSummary["reviewerKind"]) {
  if (kind === "PAGE_OWNER") {
    return "页面所有者";
  }

  if (kind === "SPACE_OWNER") {
    return "知识库所有者";
  }

  return "实验室管理员";
}

function statusLabel(status: KnowledgePageAccessRequestSummary["status"]) {
  if (status === "PENDING") {
    return "待审批";
  }

  if (status === "APPROVED") {
    return "已通过";
  }

  if (status === "REJECTED") {
    return "已拒绝";
  }

  return "已取消";
}

function statusToneClassName(
  request: Pick<KnowledgePageAccessRequestSummary, "status" | "grantActive">,
) {
  if (request.status === "APPROVED" && request.grantActive) {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-100";
  }

  if (request.status === "APPROVED") {
    return "border-amber-400/25 bg-amber-400/10 text-amber-100";
  }

  if (request.status === "REJECTED") {
    return "border-red-400/20 bg-red-400/10 text-red-100";
  }

  if (request.status === "PENDING") {
    return "border-sky-400/20 bg-sky-400/10 text-sky-100";
  }

  return "border-zinc-500/20 bg-zinc-500/10 text-zinc-200";
}

const sectionMeta: Record<
  KnowledgeApprovalSection,
  {
    label: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  pendingReviews: {
    label: "待我审批",
    description: "集中处理等待你审批的知识页编辑权限申请。",
    emptyTitle: "暂无待处理的权限审批",
    emptyDescription: "当前没有需要你处理的编辑权限申请。",
  },
  submitted: {
    label: "我提交的申请",
    description: "跟踪自己发起的申请状态与当前权限结果。",
    emptyTitle: "暂无已提交申请",
    emptyDescription: "你还没有提交过知识页编辑权限申请。",
  },
  reviewedByMe: {
    label: "我已处理的权限审批",
    description: "回顾你处理过的权限审批记录，并按需关闭仍生效的权限。",
    emptyTitle: "暂无已处理的权限审批",
    emptyDescription: "当前还没有你处理完成的权限审批记录。",
  },
};

const reviewerKindOptions: Array<{
  value: KnowledgePageAccessApproverKind | "";
  label: string;
}> = [
  { value: "", label: "全部审批角色" },
  { value: "PAGE_OWNER", label: "页面所有者" },
  { value: "SPACE_OWNER", label: "知识库所有者" },
  { value: "LAB_ADMIN", label: "实验室管理员" },
];

const statusOptions: Array<{
  value: KnowledgePageAccessRequestStatus | "";
  label: string;
}> = [
  { value: "", label: "全部状态" },
  { value: "PENDING", label: "待审批" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已拒绝" },
  { value: "CANCELLED", label: "已取消" },
];

function buildDashboardPath(query: {
  section: KnowledgeApprovalSection;
  q: string;
  reviewerKind: KnowledgePageAccessApproverKind | "";
  status: KnowledgePageAccessRequestStatus | "";
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({
    section: query.section,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.q.trim()) {
    params.set("q", query.q.trim());
  }

  if (query.reviewerKind) {
    params.set("reviewerKind", query.reviewerKind);
  }

  if (query.section !== "pendingReviews" && query.status) {
    params.set("status", query.status);
  }

  return `/knowledge/page-access-requests?${params.toString()}`;
}

export default function PortalKnowledgeApprovalPage() {
  const [dashboard, setDashboard] =
    useState<KnowledgePageAccessRequestDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] =
    useState<KnowledgeApprovalSection>("pendingReviews");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [reviewerKindFilter, setReviewerKindFilter] =
    useState<KnowledgePageAccessApproverKind | "">("");
  const [statusFilter, setStatusFilter] =
    useState<KnowledgePageAccessRequestStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pendingRevokeRequest, setPendingRevokeRequest] =
    useState<KnowledgePageAccessRequestSummary | null>(null);

  async function loadDashboard(nextQuery?: {
    section: KnowledgeApprovalSection;
    q: string;
    reviewerKind: KnowledgePageAccessApproverKind | "";
    status: KnowledgePageAccessRequestStatus | "";
    page: number;
    pageSize: number;
  }) {
    const resolvedQuery = nextQuery ?? {
      section: activeSection,
      q: query,
      reviewerKind: reviewerKindFilter,
      status: statusFilter,
      page,
      pageSize,
    };
    const data = await fetchApi<KnowledgePageAccessRequestDashboard>(
      buildDashboardPath(resolvedQuery),
    );

    setDashboard(data);
    if (data.filters.page !== resolvedQuery.page) {
      setPage(data.filters.page);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await fetchApi<KnowledgePageAccessRequestDashboard>(
          buildDashboardPath({
            section: activeSection,
            q: query,
            reviewerKind: reviewerKindFilter,
            status: statusFilter,
            page,
            pageSize,
          }),
        );

        if (!active) {
          return;
        }

        setDashboard(data);
      } catch (error) {
        if (!active) {
          return;
        }

        setError(error instanceof ApiError ? error.message : "无法获取审批列表");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [activeSection, page, pageSize, query, reviewerKindFilter, statusFilter]);

  async function handleReview(
    request: KnowledgePageAccessRequestSummary,
    action: "APPROVE" | "REJECT",
  ) {
    setBusyRequestId(request.id);
    setMessage(null);
    setError(null);

    try {
      const payload: ReviewKnowledgePageAccessRequestPayload = {
        action,
        comment: comments[request.id]?.trim() || undefined,
      };

      await sendJson<
        KnowledgePageAccessRequestSummary,
        ReviewKnowledgePageAccessRequestPayload
      >(`/knowledge/page-access-requests/${request.id}/review`, "PATCH", payload);
      setMessage(action === "APPROVE" ? "审批已通过，编辑权限已发放。" : "审批已拒绝。");
      await loadDashboard();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "审批处理失败");
    } finally {
      setBusyRequestId(null);
    }
  }

  async function handleConfirmRevokePermission() {
    if (!pendingRevokeRequest) {
      return;
    }

    setBusyRequestId(pendingRevokeRequest.id);
    setMessage(null);
    setError(null);

    try {
      await fetchApi<unknown>(
        `/knowledge/pages/${pendingRevokeRequest.page.id}/permissions/${pendingRevokeRequest.requester.id}`,
        {
          method: "DELETE",
        },
      );
      setMessage("已关闭该申请对应的页面编辑权限。");
      await loadDashboard();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "关闭页面编辑权限失败");
    } finally {
      setBusyRequestId(null);
      setPendingRevokeRequest(null);
    }
  }

  const recordPage = dashboard?.records ?? {
    items: [],
    total: 0,
    page: 1,
    pageSize,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  };
  const records = recordPage.items;
  const summary = dashboard?.summary ?? {
    pendingReviews: 0,
    submitted: 0,
    reviewedByMe: 0,
  };
  const filters = dashboard?.filters ?? {
    q: query,
    status: statusFilter || null,
    reviewerKind: reviewerKindFilter || null,
    page,
    pageSize,
  };
  const sectionInfo = sectionMeta[activeSection];
  const hasContent = useMemo(
    () => summary.pendingReviews + summary.submitted + summary.reviewedByMe > 0,
    [summary.pendingReviews, summary.reviewedByMe, summary.submitted],
  );

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  function handleSectionChange(section: KnowledgeApprovalSection) {
    setActiveSection(section);
    setPage(1);

    if (section === "pendingReviews") {
      setStatusFilter("");
    }
  }

  return (
    <PortalShell
      title="权限审批"
      description="按主流 OA 工作台方式集中处理权限审批，支持标签切换、搜索筛选与分页浏览。"
    >
      {pendingRevokeRequest ? (
        <DangerConfirmDialog
          open
          title={`关闭 ${pendingRevokeRequest.requester.realName} 的编辑权限`}
          description="关闭后，对方将立即失去当前页面的编辑权限，但审批记录仍会保留。"
          confirmText={`确认关闭 ${pendingRevokeRequest.requester.realName} 的编辑权限`}
          confirmLabel="请输入确认文案"
          actionLabel="确认关闭权限"
          busy={busyRequestId === pendingRevokeRequest.id}
          onClose={() => {
            if (busyRequestId !== pendingRevokeRequest.id) {
              setPendingRevokeRequest(null);
            }
          }}
          onConfirm={handleConfirmRevokePermission}
        />
      ) : null}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        {message ? (
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="app-panel-muted p-6 text-sm text-zinc-300">
            正在加载权限审批数据...
          </div>
        ) : hasContent ? (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              {(
                [
                  "pendingReviews",
                  "submitted",
                  "reviewedByMe",
                ] as KnowledgeApprovalSection[]
              ).map((section) => {
                const count = summary[section];
                const active = section === activeSection;
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() => handleSectionChange(section)}
                    className={`rounded-3xl border p-5 text-left transition ${
                      active
                        ? "border-sky-400/30 bg-sky-400/10"
                        : "border-border bg-surface/70 hover:bg-surface-soft"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">
                          {sectionMeta[section].label}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-pretty text-zinc-400">
                          {sectionMeta[section].description}
                        </p>
                      </div>
                      <div className="rounded-full border border-border px-3 py-1 text-sm tabular-nums text-zinc-200">
                        {count}
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="app-panel-muted p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-balance text-xl font-semibold">{sectionInfo.label}</h2>
                  <p className="mt-2 max-w-3xl text-pretty text-sm text-zinc-400">
                    {sectionInfo.description}
                  </p>
                </div>
                <div className="app-pill tabular-nums">
                  共 {recordPage.total} 条结果
                </div>
              </div>
              <form
                onSubmit={handleSearchSubmit}
                className="mt-6 grid gap-4 rounded-3xl border border-border bg-surface/70 p-4 lg:grid-cols-[minmax(0,1.2fr)_220px_220px_140px]"
              >
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">搜索</div>
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    className="app-input"
                    placeholder="搜索页面、知识库、申请人、审批人或说明"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">审批角色</div>
                  <select
                    value={reviewerKindFilter}
                    onChange={(event) => {
                      setReviewerKindFilter(
                        event.target.value as KnowledgePageAccessApproverKind | "",
                      );
                      setPage(1);
                    }}
                    className="app-input"
                  >
                    {reviewerKindOptions.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">状态</div>
                  <select
                    value={activeSection === "pendingReviews" ? "" : statusFilter}
                    onChange={(event) => {
                      setStatusFilter(
                        event.target.value as KnowledgePageAccessRequestStatus | "",
                      );
                      setPage(1);
                    }}
                    className="app-input"
                    disabled={activeSection === "pendingReviews"}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end gap-3">
                  <button type="submit" className="app-button-primary w-full">
                    搜索
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-400">
                <div className="min-w-0 flex-1 text-pretty">
                  当前筛选：关键词 {filters.q || "全部"}，审批角色{" "}
                  {reviewerKindFilter ? approverKindLabel(reviewerKindFilter) : "全部"}
                  {activeSection !== "pendingReviews"
                    ? `，状态 ${statusFilter ? statusLabel(statusFilter) : "全部"}`
                    : ""}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <span className="whitespace-nowrap tabular-nums">
                    第 {recordPage.page} / {recordPage.totalPages} 页
                  </span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                    className="app-input h-11 min-w-28"
                    aria-label="每页条数"
                  >
                    {[10, 20, 50].map((size) => (
                      <option key={size} value={size}>
                        每页 {size} 条
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {records.length > 0 ? (
                  records.map((request) => (
                    <article
                      key={request.id}
                      className="rounded-3xl border border-border bg-surface/80 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-sky-300">
                            <span>{request.page.space.name}</span>
                            <span className="text-zinc-500">/</span>
                            <span>{approverKindLabel(request.reviewerKind)}</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs ${statusToneClassName(
                                request,
                              )}`}
                            >
                              {statusLabel(request.status)}
                            </span>
                            {request.grantActive ? (
                              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-100">
                                权限生效中
                              </span>
                            ) : null}
                          </div>
                          <h3 className="mt-2 text-balance text-lg font-semibold text-foreground-strong">
                            {request.page.title}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-300">
                            <span>
                              申请人：{request.requester.realName}（{request.requester.email}）
                            </span>
                            <span>
                              审批人：{request.reviewer.realName}（
                              {approverKindLabel(request.reviewerKind)}）
                            </span>
                          </div>
                          <p className="mt-2 text-sm tabular-nums text-zinc-400">
                            提交时间：{formatDateTime(request.createdAt)}
                            {request.reviewedAt
                              ? `，处理时间：${formatDateTime(request.reviewedAt)}`
                              : ""}
                          </p>
                        </div>
                        <Link
                          href={`/portal/knowledge/pages/${request.page.id}`}
                          className="app-button-secondary py-2"
                        >
                          查看页面
                        </Link>
                      </div>

                      <div className="mt-4 rounded-2xl border border-border/80 bg-surface-soft px-4 py-3 text-sm text-zinc-300">
                        申请说明：{request.reason || "未填写"}
                      </div>

                      {request.reviewComment ? (
                        <div className="mt-3 rounded-2xl border border-border/80 bg-surface-soft px-4 py-3 text-sm text-zinc-300">
                          审批备注：{request.reviewComment}
                        </div>
                      ) : null}

                      {activeSection === "pendingReviews" ? (
                        <>
                          <label className="mt-4 block text-sm">
                            <div className="mb-2 text-zinc-300">审批备注</div>
                            <textarea
                              value={comments[request.id] ?? ""}
                              onChange={(event) =>
                                setComments((prev) => ({
                                  ...prev,
                                  [request.id]: event.target.value,
                                }))
                              }
                              className="app-textarea min-h-24"
                              placeholder="可选填写，例如补充授权范围或拒绝原因"
                            />
                          </label>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={busyRequestId === request.id}
                              onClick={() => void handleReview(request, "APPROVE")}
                              className="app-button-primary"
                            >
                              批准并授予编辑权限
                            </button>
                            <button
                              type="button"
                              disabled={busyRequestId === request.id}
                              onClick={() => void handleReview(request, "REJECT")}
                              className="app-button-danger-outline px-4 py-2"
                            >
                              拒绝申请
                            </button>
                          </div>
                        </>
                      ) : null}

                      {activeSection === "submitted" && request.status === "APPROVED" ? (
                        <div
                          className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                            request.grantActive
                              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                              : "border-amber-400/20 bg-amber-400/10 text-amber-100"
                          }`}
                        >
                          {request.grantActive
                            ? "当前仍保留该知识页面的编辑权限。"
                            : "该审批曾通过，但当前页面编辑权限已被关闭。"}
                        </div>
                      ) : null}

                      {activeSection === "reviewedByMe" &&
                      request.status === "APPROVED" &&
                      request.grantActive ? (
                        <div className="mt-4">
                          <button
                            type="button"
                            disabled={busyRequestId === request.id}
                            onClick={() => setPendingRevokeRequest(request)}
                            className="app-button-danger-outline px-4 py-2"
                          >
                            关闭当前权限
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-border px-6 py-10">
                    <h3 className="text-balance text-lg font-semibold text-zinc-100">
                      {sectionInfo.emptyTitle}
                    </h3>
                    <p className="mt-3 max-w-2xl text-pretty text-sm leading-7 text-zinc-400">
                      {sectionInfo.emptyDescription}
                    </p>
                    <div className="mt-5">
                      <Link
                        href="/portal/knowledge"
                        className="app-button-secondary inline-flex py-2"
                      >
                        打开知识库
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
                <div className="text-sm text-zinc-400">
                  共 <span className="tabular-nums">{recordPage.total}</span> 条，
                  当前第{" "}
                  <span className="tabular-nums">{recordPage.page}</span> 页
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!recordPage.hasPreviousPage}
                    onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                    className="app-button-secondary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={!recordPage.hasNextPage}
                    onClick={() => setPage((currentPage) => currentPage + 1)}
                    className="app-button-secondary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : (
          <div className="app-panel-muted p-8 text-sm text-zinc-300">
            当前没有待处理或已提交的权限审批记录。你可以从知识页面详情或编辑页发起新的编辑权限申请。
          </div>
        )}
      </div>
    </PortalShell>
  );
}
