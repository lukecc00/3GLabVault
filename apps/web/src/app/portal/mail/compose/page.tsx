"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MailMessageBody } from "../_components/mail-message-body";
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

type ComposeMode = "new" | "reply" | "forward" | "draft";
type MailSelectableEntity = "user" | "group";

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

function buildSelectableEntityId(type: MailSelectableEntity, id: string) {
  return `${type}:${id}`;
}

function parseSelectableEntityIds(selectedIds: string[]) {
  return selectedIds.reduce(
    (result, value) => {
      const [type, id] = value.split(":", 2);

      if (!id) {
        return result;
      }

      if (type === "user") {
        result.userIds.push(id);
      } else if (type === "group") {
        result.groupIds.push(id);
      }

      return result;
    },
    { userIds: [] as string[], groupIds: [] as string[] },
  );
}

function buildUserSelectorOptions(
  users: InternalMailComposerUserOption[],
): EntitySelectorOption[] {
  return users.map((user) => ({
    id: buildSelectableEntityId("user", user.id),
    label: user.realName,
    description: [user.email, user.username ? `账号 ${user.username}` : null]
      .filter(Boolean)
      .join(" / "),
    keywords: [user.email, user.username ?? "", "成员", "用户"],
    badges: ["成员", ...(user.username ? [user.username] : [])],
    filterTags: [
      { id: "entity:user", label: "成员" },
      ...(user.memberships ?? []).map(({ group }) => ({
        id: `membership:${group.id}`,
        label: group.name,
      })),
    ],
    section: "成员",
  }));
}

function buildGroupSelectorOptions(
  groups: InternalMailGroupOption[],
): EntitySelectorOption[] {
  return groups.map((group) => ({
    id: buildSelectableEntityId("group", group.id),
    label: group.name,
    description: `${group.code} / ${groupTypeMap[group.type]}`,
    keywords: [group.code, groupTypeMap[group.type], "群组", "组"],
    badges: ["群组"],
    filterTags: [
      {
        id: "entity:group",
        label: "群组",
      },
      {
        id: `group-type:${group.type}`,
        label: groupTypeMap[group.type],
      },
    ],
    section: `群组 / ${groupTypeMap[group.type]}`,
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

  const selectedEntityCount = useMemo(() => {
    const allIds = [
      ...(form.toUserIds ?? []),
      ...(form.ccUserIds ?? []),
      ...(form.toGroupIds ?? []),
      ...(form.ccGroupIds ?? []),
    ];

    return allIds.length;
  }, [form.ccGroupIds, form.ccUserIds, form.toGroupIds, form.toUserIds]);

  const userSelectorOptions = useMemo(
    () => buildUserSelectorOptions(options?.users ?? []),
    [options?.users],
  );
  const groupSelectorOptions = useMemo(
    () => buildGroupSelectorOptions(options?.groups ?? []),
    [options?.groups],
  );
  const recipientSelectorOptions = useMemo(
    () => [...userSelectorOptions, ...groupSelectorOptions],
    [groupSelectorOptions, userSelectorOptions],
  );
  const toSelectedIds = useMemo(
    () => [
      ...(form.toUserIds ?? []).map((id) => buildSelectableEntityId("user", id)),
      ...(form.toGroupIds ?? []).map((id) => buildSelectableEntityId("group", id)),
    ],
    [form.toGroupIds, form.toUserIds],
  );
  const ccSelectedIds = useMemo(
    () => [
      ...(form.ccUserIds ?? []).map((id) => buildSelectableEntityId("user", id)),
      ...(form.ccGroupIds ?? []).map((id) => buildSelectableEntityId("group", id)),
    ],
    [form.ccGroupIds, form.ccUserIds],
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

      void refreshSummary();

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
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-balance text-foreground-strong">
              {composeMode === "reply"
                ? "回复内部邮件"
                : composeMode === "forward"
                  ? "转发内部邮件"
                  : composeMode === "draft"
                    ? "编辑草稿"
                    : "新建内部邮件"}
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-7 text-slate-300 text-pretty">
              填写收件人、主题和正文。
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

        <div className="mt-6 grid gap-4 xl:grid-cols-2 xl:items-start">
          <EntitySelector
            title="收件人"
            items={recipientSelectorOptions}
            selectedIds={toSelectedIds}
            onSelectionChange={(nextSelectedIds) => {
              const nextSelection = parseSelectableEntityIds(nextSelectedIds);

              setForm((prev) => ({
                ...prev,
                toUserIds: nextSelection.userIds,
                toGroupIds: nextSelection.groupIds,
              }));
            }}
            selectedTitle="已选收件人"
            selectedEmptyLabel="选择收件人或群组"
            tone="sky"
            variant="floating"
            floatingLayout="inline"
            floatingActionLabel="选择对象"
            floatingSummaryMaxItems={6}
            floatingSummaryClassName="text-base leading-7 text-foreground-strong"
            searchPlaceholder="搜索成员或群组"
          />
          <EntitySelector
            title="抄送"
            items={recipientSelectorOptions}
            selectedIds={ccSelectedIds}
            onSelectionChange={(nextSelectedIds) => {
              const nextSelection = parseSelectableEntityIds(nextSelectedIds);

              setForm((prev) => ({
                ...prev,
                ccUserIds: nextSelection.userIds,
                ccGroupIds: nextSelection.groupIds,
              }));
            }}
            selectedTitle="已选抄送"
            selectedEmptyLabel="选择抄送对象"
            tone="amber"
            variant="floating"
            floatingLayout="inline"
            floatingActionLabel="选择对象"
            floatingSummaryMaxItems={6}
            floatingSummaryClassName="text-base leading-7 text-foreground-strong"
            searchPlaceholder="搜索成员或群组"
          />
        </div>

        {message ? (
          <div className="mt-5 text-sm text-foreground-muted">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-[var(--danger-strong)]">
            {error}
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="app-panel p-6">
            <div className="grid gap-4">
              <label className="text-sm">
                <div className="mb-2 text-foreground-muted">主题</div>
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
                <div className="mb-2 text-foreground-muted">正文</div>
                <textarea
                  value={form.bodyMarkdown}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, bodyMarkdown: event.target.value }))
                  }
                  className="app-textarea min-h-[340px]"
                  placeholder="输入正文"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="app-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground-strong">邮件预览</div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-foreground-muted">
                投递对象 {selectedEntityCount} 项
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-foreground-subtle">主题</div>
              <div className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-balance text-foreground-strong">
                {form.subject.trim() || "无主题"}
              </div>
              <div className="mt-5 border-t border-white/8 pt-5">
                <MailMessageBody markdown={form.bodyMarkdown} />
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
