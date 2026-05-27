"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "../_components/admin-shell";
import { ResourceState } from "../_components/resource-state";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ApiError, fetchApi } from "@/lib/api";
import type { AuditLogItem, AuditLogResult, UserSummary } from "@/lib/contracts";
import { hasGlobalAdminRole } from "@/lib/workspace";

type AuditLogQueryState = {
  actorId: string;
  ipAddress: string;
  countryCode: string;
  action: string;
  targetType: string;
  resourceKeyword: string;
  startAt: string;
  endAt: string;
  page: number;
  pageSize: number;
};

const pageSizeOptions = [25, 50, 100];
const targetTypeOptions = [
  { value: "", label: "全部资源" },
  { value: "USER", label: "用户" },
  { value: "USER_BATCH", label: "批量账号" },
  { value: "KNOWLEDGE_PAGE", label: "知识页" },
  { value: "KNOWLEDGE_SPACE", label: "知识空间" },
  { value: "KNOWLEDGE_ASSET", label: "知识资源" },
  { value: "INTERNAL_MAIL_MESSAGE", label: "内部邮件" },
  { value: "INTERNAL_MAIL_MAILBOX", label: "邮件邮箱项" },
];

const initialQueryState: AuditLogQueryState = {
  actorId: "",
  ipAddress: "",
  countryCode: "",
  action: "",
  targetType: "",
  resourceKeyword: "",
  startAt: "",
  endAt: "",
  page: 1,
  pageSize: 25,
};

const statusToneClassMap: Record<AuditLogItem["status"], string> = {
  SUCCESS: "app-eyebrow app-eyebrow-emerald",
  FAILURE: "app-eyebrow app-eyebrow-amber",
  DENIED: "app-eyebrow app-eyebrow-neutral",
};

const statusLabelMap: Record<AuditLogItem["status"], string> = {
  SUCCESS: "成功",
  FAILURE: "失败",
  DENIED: "已拒绝",
};

const actionLabelMap: Record<string, string> = {
  AUTH_LOGIN: "账号登录",
  AUTH_CHANGE_PASSWORD: "修改密码",
  USER_BATCH_GENERATE: "批量生成账号",
  USER_REVIEW: "审核用户",
  USER_RESET_PASSWORD: "重置密码",
  USER_UPDATE_ROLES: "调整角色",
  USER_UPDATE_GROUPS: "调整群组",
  USER_ARCHIVE: "归档用户",
  USER_RESTORE_CONTENT: "恢复归档内容",
  USER_REACTIVATE: "重新启用用户",
  KNOWLEDGE_UPLOAD_IMAGE: "上传知识库图片",
  KNOWLEDGE_VIEW_ASSET: "访问知识库资源",
  KNOWLEDGE_CREATE_PAGE: "创建知识页",
  KNOWLEDGE_UPDATE_PAGE: "更新知识页",
  KNOWLEDGE_DELETE_PAGE: "删除知识页",
  KNOWLEDGE_RESTORE_PAGE: "恢复知识页",
  KNOWLEDGE_GRANT_PERMISSION: "授予编辑权限",
  KNOWLEDGE_REVOKE_PERMISSION: "移除编辑权限",
  INTERNAL_MAIL_VIEW_MESSAGE: "查看内部邮件",
  INTERNAL_MAIL_SEND: "发送内部邮件",
  INTERNAL_MAIL_SAVE_DRAFT: "保存邮件草稿",
  INTERNAL_MAIL_UPDATE_MAILBOX: "更新邮件状态",
  INTERNAL_MAIL_BULK_DELETE: "批量删除邮件",
  INTERNAL_MAIL_PURGE: "彻底删除邮件",
  INTERNAL_MAIL_EMPTY_TRASH: "清空邮件回收站",
};

const targetTypeLabelMap: Record<string, string> = {
  USER: "用户账号",
  USER_BATCH: "批量账号任务",
  KNOWLEDGE_PAGE: "知识页",
  KNOWLEDGE_SPACE: "知识空间",
  KNOWLEDGE_ASSET: "知识库图片资源",
  INTERNAL_MAIL_MESSAGE: "内部邮件",
  INTERNAL_MAIL_MAILBOX: "邮件邮箱项",
};

const workspaceLabelMap: Record<string, string> = {
  "system-admin": "系统管理员",
  "lab-admin": "实验室管理员",
  "direction-admin": "方向管理员",
  "grade-admin": "年级管理员",
  member: "普通成员",
};

function buildAuditLogPath(query: AuditLogQueryState) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.actorId) {
    params.set("actorId", query.actorId);
  }

  if (query.ipAddress.trim()) {
    params.set("ipAddress", query.ipAddress.trim());
  }

  if (query.countryCode.trim()) {
    params.set("countryCode", query.countryCode.trim().toUpperCase());
  }

  if (query.action.trim()) {
    params.set("action", query.action.trim());
  }

  if (query.targetType) {
    params.set("targetType", query.targetType);
  }

  if (query.resourceKeyword.trim()) {
    params.set("resourceKeyword", query.resourceKeyword.trim());
  }

  const startAt = normalizeDateTimeInput(query.startAt);
  if (startAt) {
    params.set("startAt", startAt);
  }

  const endAt = normalizeDateTimeInput(query.endAt);
  if (endAt) {
    params.set("endAt", endAt);
  }

  return `/audit-logs?${params.toString()}`;
}

function normalizeDateTimeInput(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function isLoopbackIp(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return value === "::1" || value === "127.0.0.1" || value === "::ffff:127.0.0.1";
}

function formatActionLabel(action: string) {
  return actionLabelMap[action] ?? action;
}

function formatActorLabel(item: AuditLogItem) {
  if (!item.actor) {
    return "未知操作者";
  }

  return item.actor.username
    ? `${item.actor.realName} / ${item.actor.username}`
    : item.actor.realName;
}

function formatActorDescription(item: AuditLogItem) {
  if (!item.actor) {
    return item.actorId ? `用户 ID ${item.actorId}` : "未记录用户信息";
  }

  return [
    item.actor.email,
    item.workspaceId
      ? `${workspaceLabelMap[item.workspaceId] ?? item.workspaceId}身份`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatResourceLabel(item: AuditLogItem) {
  if (!item.targetType) {
    return "未标记资源";
  }

  return targetTypeLabelMap[item.targetType] ?? item.targetType;
}

function formatResourceDescription(item: AuditLogItem) {
  if (!item.targetId) {
    return "未记录资源标识";
  }

  if (item.targetType === "KNOWLEDGE_ASSET") {
    const segments = item.targetId.split("/");
    const fileName = segments[segments.length - 1] ?? item.targetId;
    const dateSegment =
      segments.length >= 4
        ? `${segments[segments.length - 4]}-${segments[segments.length - 3]}-${segments[segments.length - 2]}`
        : null;

    return [
      "知识库图片文件",
      dateSegment ? `上传日期 ${dateSegment}` : null,
      `文件 ${fileName}`,
    ]
      .filter(Boolean)
      .join(" / ");
  }

  if (item.targetType === "KNOWLEDGE_PAGE") {
    return `知识页 ID ${item.targetId}`;
  }

  if (item.targetType === "KNOWLEDGE_SPACE") {
    return `知识空间 ID ${item.targetId}`;
  }

  if (item.targetType === "USER") {
    return `用户 ID ${item.targetId}`;
  }

  if (item.targetType === "INTERNAL_MAIL_MESSAGE") {
    return `内部邮件 ID ${item.targetId}`;
  }

  if (item.targetType === "INTERNAL_MAIL_MAILBOX") {
    return `邮件箱记录 ID ${item.targetId}`;
  }

  return item.targetId;
}

function formatResourceRawIdentifier(item: AuditLogItem) {
  if (!item.targetId) {
    return null;
  }

  if (item.targetType === "KNOWLEDGE_ASSET") {
    return `对象键 ${item.targetId}`;
  }

  return `资源标识 ${item.targetId}`;
}

function formatIpAddress(ipAddress: string | null) {
  if (!ipAddress) {
    return "未记录 IP";
  }

  if (isLoopbackIp(ipAddress)) {
    return "本机回环地址";
  }

  return ipAddress;
}

function formatCountryLabel(item: AuditLogItem) {
  if (item.countryCode) {
    return item.countryCode;
  }

  if (isLoopbackIp(item.ipAddress)) {
    return "本机 / 内网";
  }

  return "未知国家";
}

function buildUserOptions(users: UserSummary[]) {
  return [...users].sort((left, right) => left.realName.localeCompare(right.realName, "zh-CN"));
}

function AuditLogSkeleton() {
  return (
    <section className="grid gap-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[28px] border border-border bg-surface p-6"
        >
          <div className="h-5 w-40 rounded-full bg-surface-muted" />
          <div className="mt-4 h-4 w-2/3 rounded-full bg-surface-muted" />
          <div className="mt-2 h-4 w-1/2 rounded-full bg-surface-muted" />
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="h-20 rounded-2xl bg-surface-muted" />
            <div className="h-20 rounded-2xl bg-surface-muted" />
            <div className="h-20 rounded-2xl bg-surface-muted" />
          </div>
        </div>
      ))}
    </section>
  );
}

export default function AuditLogsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState<AuditLogQueryState>(initialQueryState);
  const [formState, setFormState] = useState<AuditLogQueryState>(initialQueryState);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [data, setData] = useState<AuditLogResult | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);

  const userOptions = useMemo(() => buildUserOptions(users), [users]);

  useEffect(() => {
    if (user && !hasGlobalAdminRole(user.roleCodes)) {
      router.replace("/admin/users");
    }
  }, [router, user]);

  useEffect(() => {
    let active = true;

    void (async () => {
      setUsersLoading(true);
      setUsersError(null);

      try {
        const usersData = await fetchApi<UserSummary[]>("/users");
        if (!active) {
          return;
        }

        setUsers(usersData);
      } catch (error) {
        if (!active) {
          return;
        }

        setUsersError(error instanceof ApiError ? error.message : "无法获取用户列表");
      } finally {
        if (active) {
          setUsersLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user && !hasGlobalAdminRole(user.roleCodes)) {
      return;
    }

    let active = true;

    void (async () => {
      setLogsLoading(true);
      setLogsError(null);

      try {
        const auditLogData = await fetchApi<AuditLogResult>(buildAuditLogPath(query));
        if (!active) {
          return;
        }

        setData(auditLogData);
      } catch (error) {
        if (!active) {
          return;
        }

        setLogsError(error instanceof ApiError ? error.message : "无法获取审计日志");
      } finally {
        if (active) {
          setLogsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [query, user]);

  if (user && !hasGlobalAdminRole(user.roleCodes)) {
    return null;
  }

  function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery({
      ...formState,
      page: 1,
    });
  }

  function handleResetFilters() {
    setFormState(initialQueryState);
    setQuery(initialQueryState);
  }

  const activeFilterCount = [
    query.actorId,
    query.ipAddress,
    query.countryCode,
    query.action,
    query.targetType,
    query.resourceKeyword,
    query.startAt,
    query.endAt,
  ].filter((value) => Boolean(value)).length;

  return (
    <AdminShell
      title="安全审计"
      description="集中查看后台高危操作、操作者身份、来源 IP 与国家地区、作用资源和发生时间，默认按最新事件倒序排列。"
    >
      <section className="grid gap-4 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          onSubmit={handleFilterSubmit}
          className="rounded-[28px] border border-border bg-surface p-6"
        >
          <div className="grid gap-3">
            <div>
              <h2 className="text-lg font-medium text-balance text-foreground-strong">
                查询条件
              </h2>
              <p className="mt-2 max-w-[50ch] text-sm leading-7 text-foreground-muted text-pretty">
                支持按操作用户、来源 IP、国家、动作、资源和时间范围组合筛选。
              </p>
            </div>
            <div className="app-pill w-fit tabular-nums">已启用 {activeFilterCount} 项筛选</div>
          </div>

          {usersError ? (
            <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-[var(--danger-strong)]">
              {usersError}
            </p>
          ) : null}

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground-strong">操作用户</span>
              <select
                value={formState.actorId}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    actorId: event.target.value,
                  }))
                }
                disabled={usersLoading}
                className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground-strong"
              >
                <option value="">全部用户</option>
                {userOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.realName} / {option.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground-strong">来源 IP</span>
              <input
                value={formState.ipAddress}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    ipAddress: event.target.value,
                  }))
                }
                placeholder="例如 1.2.3.4"
                className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground-strong"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground-strong">国家码</span>
              <input
                value={formState.countryCode}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    countryCode: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="例如 CN"
                maxLength={16}
                className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm uppercase text-foreground-strong"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground-strong">动作关键词</span>
              <input
                value={formState.action}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                placeholder="例如 RESET_PASSWORD / LOGIN"
                className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground-strong"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground-strong">资源类型</span>
              <select
                value={formState.targetType}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    targetType: event.target.value,
                  }))
                }
                className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground-strong"
              >
                {targetTypeOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium text-foreground-strong">资源关键词</span>
              <input
                value={formState.resourceKeyword}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    resourceKeyword: event.target.value,
                  }))
                }
                placeholder="资源 ID、摘要或动作关键词"
                className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground-strong"
              />
            </label>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-foreground-strong">开始时间</span>
                <input
                  type="datetime-local"
                  value={formState.startAt}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      startAt: event.target.value,
                    }))
                  }
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground-strong"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium text-foreground-strong">结束时间</span>
                <input
                  type="datetime-local"
                  value={formState.endAt}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      endAt: event.target.value,
                    }))
                  }
                  className="min-h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground-strong"
                />
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="submit" variant="success">
              查询审计日志
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleResetFilters}
            >
              重置筛选
            </Button>
          </div>
        </form>

        <section className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="app-stat-card">
              <div className="app-stat-label">命中事件</div>
              <div className="app-stat-value tabular-nums">{data?.total ?? 0}</div>
            </div>
            <div className="app-stat-card">
              <div className="app-stat-label">当前页</div>
              <div className="app-stat-value tabular-nums">
                {data?.page ?? query.page}
              </div>
            </div>
            <div className="app-stat-card">
              <div className="app-stat-label">每页条数</div>
              <div className="app-stat-value tabular-nums">{query.pageSize}</div>
            </div>
          </div>

          <div className="rounded-[28px] border border-border bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-balance text-foreground-strong">
                  高危操作列表
                </h2>
                <p className="mt-2 max-w-[60ch] text-sm leading-7 text-foreground-muted text-pretty">
                  列表始终按最新时间倒序展示，方便管理员直接查看最近的敏感动作和操作者信息。
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-foreground-muted">
                  每页显示
                  <select
                    value={query.pageSize}
                    onChange={(event) => {
                      const nextPageSize = Number(event.target.value);
                      setQuery((current) => ({
                        ...current,
                        page: 1,
                        pageSize: nextPageSize,
                      }));
                      setFormState((current) => ({
                        ...current,
                        pageSize: nextPageSize,
                      }));
                    }}
                    className="ml-2 min-h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground-strong"
                  >
                    {pageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {logsLoading ? (
              <div className="mt-6">
                <AuditLogSkeleton />
              </div>
            ) : logsError ? (
              <div className="mt-6">
                <ResourceState
                  title="审计日志加载失败"
                  description={logsError}
                  tone="error"
                />
              </div>
            ) : data && data.items.length > 0 ? (
              <div className="mt-6 grid gap-4">
                {data.items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[28px] border border-border bg-background p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={statusToneClassMap[item.status]}>
                            {statusLabelMap[item.status]}
                          </span>
                          <span className="app-pill tabular-nums">
                            {formatActionLabel(item.action)}
                          </span>
                        </div>
                        <h3 className="mt-3 text-base font-medium text-balance text-foreground-strong">
                          {item.summary}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-foreground-muted text-pretty">
                          {formatActorLabel(item)} / {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <div className="text-right text-sm tabular-nums text-foreground-muted">
                        <div>{formatIpAddress(item.ipAddress)}</div>
                        <div className="mt-1">{formatCountryLabel(item)}</div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                        <div className="text-xs font-medium uppercase text-foreground-muted">
                          操作用户
                        </div>
                        <div className="mt-2 text-sm font-medium text-foreground-strong">
                          {formatActorLabel(item)}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-foreground-muted text-pretty">
                          {formatActorDescription(item)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                        <div className="text-xs font-medium uppercase text-foreground-muted">
                          作用资源
                        </div>
                        <div className="mt-2 text-sm font-medium text-foreground-strong">
                          {formatResourceLabel(item)}
                        </div>
                        <div className="mt-2 break-all text-sm leading-6 text-foreground-muted text-pretty">
                          {formatResourceDescription(item)}
                        </div>
                        {formatResourceRawIdentifier(item) ? (
                          <div className="mt-2 break-all text-xs leading-6 text-foreground-muted/80 text-pretty">
                            {formatResourceRawIdentifier(item)}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                        <div className="text-xs font-medium uppercase text-foreground-muted">
                          请求来源
                        </div>
                        <div className="mt-2 text-sm font-medium tabular-nums text-foreground-strong">
                          {formatIpAddress(item.ipAddress)}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-foreground-muted text-pretty">
                          {[
                            formatCountryLabel(item),
                            item.userAgent ?? "未记录 User-Agent",
                          ]
                            .filter(Boolean)
                            .join(" / ")}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2">
                  <p className="text-sm tabular-nums text-foreground-muted">
                    第 {data.page} 页，共 {data.totalPages} 页
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="secondary"
                      disabled={!data.hasPreviousPage}
                      onClick={() =>
                        setQuery((current) => ({
                          ...current,
                          page: Math.max(1, current.page - 1),
                        }))
                      }
                    >
                      上一页
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!data.hasNextPage}
                      onClick={() =>
                        setQuery((current) => ({
                          ...current,
                          page: current.page + 1,
                        }))
                      }
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <ResourceState
                  title="没有找到匹配事件"
                  description="当前筛选条件下没有命中审计日志。你可以放宽时间范围、清空资源关键词，或改用用户/IP 维度继续排查。"
                />
              </div>
            )}
          </div>
        </section>
      </section>
    </AdminShell>
  );
}
