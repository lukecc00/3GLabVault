"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMailContext } from "../_components/mail-context";
import {
  EntitySelector,
  type EntitySelectorOption,
} from "@/components/ui/entity-selector";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  CreateInternalMailPayload,
  InternalMailComposerOptions,
  InternalMailGroupOption,
  InternalMailMessageDetail,
  InternalMailComposerUserOption,
} from "@/lib/contracts";
import { renderMarkdownToHtml } from "@/lib/markdown";

type ComposeMode = "new" | "reply" | "forward" | "draft";

const groupTypeMap = {
  DIRECTION: "方向组",
  GRADE: "年级组",
  FUNCTIONAL: "功能组",
  SYSTEM: "系统组",
} as const;

const initialForm: CreateInternalMailPayload = {
  subject: "",
  bodyMarkdown: "",
  toUserIds: [],
  ccUserIds: [],
  toGroupIds: [],
  ccGroupIds: [],
};

function formatFullDate(value: string | null) {
  if (!value) {
    return "未发送";
  }

  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildReplyBody(message: InternalMailMessageDetail) {
  return [
    "",
    "",
    "---",
    `原邮件发件人：${message.sender.realName} <${message.sender.email}>`,
    `发送时间：${formatFullDate(message.sentAt)}`,
    `主题：${message.subject}`,
    "",
    message.bodyMarkdown,
  ].join("\n");
}

function buildForwardBody(message: InternalMailMessageDetail) {
  return [
    "",
    "",
    "--- 转发邮件 ---",
    `发件人：${message.sender.realName} <${message.sender.email}>`,
    `发送时间：${formatFullDate(message.sentAt)}`,
    `主题：${message.subject}`,
    "",
    message.bodyMarkdown,
  ].join("\n");
}

function ensurePrefixedSubject(subject: string, prefix: string) {
  return subject.startsWith(prefix) ? subject : `${prefix}${subject}`;
}

function getComposeStateFromLocation() {
  if (typeof window === "undefined") {
    return { mode: "new" as ComposeMode, messageId: "", draftId: "" };
  }

  const params = new URLSearchParams(window.location.search);
  const mode = (params.get("mode") as ComposeMode | null) ?? "new";

  return {
    mode: ["new", "reply", "forward", "draft"].includes(mode) ? mode : "new",
    messageId: params.get("messageId") ?? "",
    draftId: params.get("draftId") ?? "",
  };
}

function filterSelectableIds(values: string[] | undefined, allowedIds: Set<string>) {
  return (values ?? []).filter((value) => allowedIds.has(value));
}

function buildUserSelectorOptions(
  users: InternalMailComposerUserOption[],
): EntitySelectorOption[] {
  return users.map((user) => ({
    id: user.id,
    label: user.realName,
    description: [user.email, user.username ? `账号 ${user.username}` : null]
      .filter(Boolean)
      .join(" / "),
    keywords: [user.email, user.username ?? ""],
    badges: user.username ? [user.username] : undefined,
    filterTags: user.memberships.map(({ group }) => ({
      id: group.id,
      label: group.name,
    })),
  }));
}

function buildGroupSelectorOptions(
  groups: InternalMailGroupOption[],
): EntitySelectorOption[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.name,
    description: group.code,
    keywords: [group.code, groupTypeMap[group.type]],
    filterTags: [
      {
        id: group.type,
        label: groupTypeMap[group.type],
      },
    ],
    section: groupTypeMap[group.type],
  }));
}

export default function PortalMailComposePage() {
  const router = useRouter();
  const { refreshSummary } = useMailContext();
  const [options, setOptions] = useState<InternalMailComposerOptions | null>(null);
  const [form, setForm] = useState<CreateInternalMailPayload>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode>("new");

  const selectedEntities = useMemo(() => {
    if (!options) {
      return [];
    }

    const allIds = [
      ...(form.toUserIds ?? []),
      ...(form.ccUserIds ?? []),
      ...(form.toGroupIds ?? []),
      ...(form.ccGroupIds ?? []),
    ];

    return allIds;
  }, [form.ccGroupIds, form.ccUserIds, form.toGroupIds, form.toUserIds, options]);

  const userSelectorOptions = useMemo(
    () => buildUserSelectorOptions(options?.users ?? []),
    [options?.users],
  );
  const groupSelectorOptions = useMemo(
    () => buildGroupSelectorOptions(options?.groups ?? []),
    [options?.groups],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const composeState = getComposeStateFromLocation();
        const nextOptions = await fetchApi<InternalMailComposerOptions>(
          "/internal-mail/composer/options",
        );
        const availableUserIds = new Set(nextOptions.users.map((user) => user.id));
        const availableGroupIds = new Set(nextOptions.groups.map((group) => group.id));

        if (!active) {
          return;
        }

        setOptions(nextOptions);
        setComposeMode(composeState.mode);

        if (composeState.draftId) {
          const draft = await fetchApi<InternalMailMessageDetail>(
            `/internal-mail/messages/${composeState.draftId}`,
          );

          if (!active) {
            return;
          }

          setForm({
            subject: draft.subject,
            bodyMarkdown: draft.bodyMarkdown,
            draftId: draft.id,
            threadId: draft.threadId,
            replyToMessageId: draft.replyToMessageId ?? undefined,
            forwardOfMessageId: draft.forwardOfMessageId ?? undefined,
            toUserIds: filterSelectableIds(draft.draftToUserIds, availableUserIds),
            ccUserIds: filterSelectableIds(draft.draftCcUserIds, availableUserIds),
            toGroupIds: filterSelectableIds(draft.draftToGroupIds, availableGroupIds),
            ccGroupIds: filterSelectableIds(draft.draftCcGroupIds, availableGroupIds),
          });
          setComposeMode("draft");
          return;
        }

        if (composeState.messageId && composeState.mode !== "new") {
          const sourceMessage = await fetchApi<InternalMailMessageDetail>(
            `/internal-mail/messages/${composeState.messageId}`,
          );

          if (!active) {
            return;
          }

          if (composeState.mode === "reply") {
            setForm({
              subject: ensurePrefixedSubject(sourceMessage.subject, "Re: "),
              bodyMarkdown: buildReplyBody(sourceMessage),
              threadId: sourceMessage.threadId,
              replyToMessageId: sourceMessage.id,
              toUserIds: availableUserIds.has(sourceMessage.senderId)
                ? [sourceMessage.senderId]
                : [],
              ccUserIds: [],
              toGroupIds: [],
              ccGroupIds: [],
            });
          } else if (composeState.mode === "forward") {
            setForm({
              subject: ensurePrefixedSubject(sourceMessage.subject, "Fwd: "),
              bodyMarkdown: buildForwardBody(sourceMessage),
              forwardOfMessageId: sourceMessage.id,
              toUserIds: [],
              ccUserIds: [],
              toGroupIds: [],
              ccGroupIds: [],
            });
          }
        }
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof ApiError ? loadError.message : "无法加载写信页面",
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

  async function submitForm(saveAsDraft: boolean) {
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const payload: CreateInternalMailPayload = {
        ...form,
        subject: form.subject.trim(),
        bodyMarkdown: form.bodyMarkdown,
        saveAsDraft,
      };

      const result = await sendJson<InternalMailMessageDetail, CreateInternalMailPayload>(
        "/internal-mail/messages",
        "POST",
        payload,
      );

      await refreshSummary();

      if (saveAsDraft) {
        setMessage("草稿已保存。");
        setForm((prev) => ({
          ...prev,
          draftId: result.id,
          threadId: result.threadId,
        }));
        router.replace(`/portal/mail/compose?draftId=${result.id}`);
      } else {
        router.push("/portal/mail/sent");
      }
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "邮件保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="app-panel-muted min-h-[640px] animate-pulse rounded-[28px]" />
    );
  }

  return (
    <div className="space-y-6">
      <section className="app-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="app-eyebrow app-eyebrow-neutral">Compose</div>
            <h2 className="mt-4 text-2xl font-semibold text-balance text-slate-50">
              {composeMode === "reply"
                ? "回复内部邮件"
                : composeMode === "forward"
                  ? "转发内部邮件"
                  : composeMode === "draft"
                    ? "编辑草稿"
                    : "新建内部邮件"}
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-7 text-slate-300 text-pretty">
              按企业邮箱的写信流程组织内部沟通，支持收件人、抄送、草稿保存、回复和转发。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void submitForm(true)}
              disabled={submitting}
              className="app-button-secondary"
            >
              {submitting ? "处理中..." : "保存草稿"}
            </button>
            <button
              type="button"
              onClick={() => void submitForm(false)}
              disabled={submitting}
              className="app-button-primary"
            >
              {submitting ? "处理中..." : "发送邮件"}
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="app-panel p-6">
            <div className="grid gap-4">
              <label className="text-sm">
                <div className="mb-2 text-slate-300">主题</div>
                <input
                  value={form.subject}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, subject: event.target.value }))
                  }
                  className="app-input"
                  placeholder="输入邮件主题"
                />
              </label>
              <label className="text-sm">
                <div className="mb-2 text-slate-300">正文</div>
                <textarea
                  value={form.bodyMarkdown}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, bodyMarkdown: event.target.value }))
                  }
                  className="app-textarea min-h-[340px]"
                  placeholder="输入内部邮件内容，支持 Markdown 语法。"
                />
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <EntitySelector
              title="收件人（成员）"
              description="支持按姓名、邮箱、账号搜索，并可按成员所属群组快速筛选。"
              items={userSelectorOptions}
              selectedIds={form.toUserIds ?? []}
              onSelectionChange={(nextSelectedIds) =>
                setForm((prev) => ({
                  ...prev,
                  toUserIds: nextSelectedIds,
                }))
              }
              selectedTitle="已选收件成员"
              selectedEmptyLabel="暂未选择成员收件人"
              tone="sky"
            />
            <EntitySelector
              title="抄送（成员）"
              description="支持按姓名、邮箱、账号搜索，并可按成员所属群组快速筛选。"
              items={userSelectorOptions}
              selectedIds={form.ccUserIds ?? []}
              onSelectionChange={(nextSelectedIds) =>
                setForm((prev) => ({
                  ...prev,
                  ccUserIds: nextSelectedIds,
                }))
              }
              selectedTitle="已选抄送成员"
              selectedEmptyLabel="暂未选择成员抄送人"
              tone="amber"
            />
            <EntitySelector
              title="收件人（群组）"
              description="支持按群组名称、编码搜索，并按方向组、年级组、功能组快速筛选。"
              items={groupSelectorOptions}
              selectedIds={form.toGroupIds ?? []}
              onSelectionChange={(nextSelectedIds) =>
                setForm((prev) => ({
                  ...prev,
                  toGroupIds: nextSelectedIds,
                }))
              }
              selectedTitle="已选收件群组"
              selectedEmptyLabel="暂未选择群组收件人"
              tone="sky"
            />
            <EntitySelector
              title="抄送（群组）"
              description="支持按群组名称、编码搜索，并按方向组、年级组、功能组快速筛选。"
              items={groupSelectorOptions}
              selectedIds={form.ccGroupIds ?? []}
              onSelectionChange={(nextSelectedIds) =>
                setForm((prev) => ({
                  ...prev,
                  ccGroupIds: nextSelectedIds,
                }))
              }
              selectedTitle="已选抄送群组"
              selectedEmptyLabel="暂未选择群组抄送人"
              tone="amber"
            />
          </div>
        </div>

        <div className="space-y-6">
          <section className="app-panel-muted p-5">
            <div className="text-sm font-medium text-slate-100">当前选择</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedEntities.length > 0 ? (
                [
                  ...(form.toUserIds ?? []).map((id) => ({
                    id,
                    label:
                      options?.users.find((user) => user.id === id)?.realName ?? id,
                    type: "收件人",
                  })),
                  ...(form.ccUserIds ?? []).map((id) => ({
                    id,
                    label:
                      options?.users.find((user) => user.id === id)?.realName ?? id,
                    type: "抄送",
                  })),
                  ...(form.toGroupIds ?? []).map((id) => ({
                    id,
                    label:
                      options?.groups.find((group) => group.id === id)?.name ?? id,
                    type: "组收件",
                  })),
                  ...(form.ccGroupIds ?? []).map((id) => ({
                    id,
                    label:
                      options?.groups.find((group) => group.id === id)?.name ?? id,
                    type: "组抄送",
                  })),
                ].map((item) => (
                  <span key={`${item.type}-${item.id}`} className="app-pill">
                    {item.type}：{item.label}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400">尚未选择收件人或群组</span>
              )}
            </div>
          </section>

          <section className="app-panel p-5">
            <div className="text-sm font-medium text-slate-100">邮件预览</div>
            <div className="mt-4">
              <div className="text-2xl font-semibold text-balance text-slate-50">
                {form.subject.trim() || "无主题"}
              </div>
              <div
                className="prose prose-invert mt-5 max-w-none text-sm leading-7"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(form.bodyMarkdown || "（无正文）"),
                }}
              />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
