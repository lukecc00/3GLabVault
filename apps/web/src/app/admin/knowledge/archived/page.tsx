"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../_components/admin-shell";
import { ResourceState } from "../../_components/resource-state";
import { Button } from "@/components/ui/button";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type { KnowledgePageSummary, KnowledgeSpaceSummary } from "@/lib/contracts";

type PendingRestoreAction =
  | {
      type: "space";
      item: KnowledgeSpaceSummary;
    }
  | {
      type: "page";
      item: KnowledgePageSummary;
    };

function formatDateTime(value: string | null) {
  if (!value) {
    return "未知";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

function getRestoreCopy(action: PendingRestoreAction) {
  if (action.type === "space") {
    return {
      title: `恢复空间 ${action.item.name}`,
      description:
        "恢复后，该知识库空间会重新对有权限的成员可见。若空间仍在 14 天保留期内，可随时恢复。",
      confirmText: `确认恢复空间 ${action.item.name}`,
      actionLabel: "确认恢复空间",
      successMessage: `知识库空间 ${action.item.name} 已恢复。`,
    };
  }

  return {
    title: `恢复页面 ${action.item.title}`,
    description:
      "恢复后，该知识页面会重新回到原知识库目录中；若其所在空间仍不可用，系统会阻止恢复。",
    confirmText: `确认恢复页面 ${action.item.title}`,
    actionLabel: "确认恢复页面",
    successMessage: `知识页面 ${action.item.title} 已恢复。`,
  };
}

export default function ArchivedKnowledgePage() {
  const [spaces, setSpaces] = useState<KnowledgeSpaceSummary[]>([]);
  const [pages, setPages] = useState<KnowledgePageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"default" | "error">("default");
  const [pendingRestoreAction, setPendingRestoreAction] =
    useState<PendingRestoreAction | null>(null);
  const [dialogErrorMessage, setDialogErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const [archivedSpaces, archivedPages] = await Promise.all([
          fetchApi<KnowledgeSpaceSummary[]>("/knowledge/spaces/archived"),
          fetchApi<KnowledgePageSummary[]>("/knowledge/pages/archived"),
        ]);

        if (!active) {
          return;
        }

        setSpaces(archivedSpaces);
        setPages(archivedPages);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof ApiError ? loadError.message : "无法获取已删除知识内容",
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

  async function handleConfirmRestore() {
    if (!pendingRestoreAction) {
      return;
    }

    const currentAction = pendingRestoreAction;
    const copy = getRestoreCopy(currentAction);
    setSubmitting(true);
    setDialogErrorMessage(null);
    setMessage(null);

    try {
      if (currentAction.type === "space") {
        const restoredSpace = await sendJson<KnowledgeSpaceSummary, Record<string, never>>(
          `/knowledge/spaces/${currentAction.item.id}/restore`,
          "POST",
          {},
        );
        setSpaces((currentSpaces) =>
          currentSpaces.filter((space) => space.id !== restoredSpace.id),
        );
      } else {
        const restoredPage = await sendJson<KnowledgePageSummary, Record<string, never>>(
          `/knowledge/pages/${currentAction.item.id}/restore`,
          "POST",
          {},
        );
        setPages((currentPages) =>
          currentPages.filter((page) => page.id !== restoredPage.id),
        );
      }

      setPendingRestoreAction(null);
      setDialogErrorMessage(null);
      setMessage(copy.successMessage);
      setMessageTone("default");
    } catch (actionError) {
      const nextMessage =
        actionError instanceof ApiError ? actionError.message : "恢复已删除知识内容失败";
      setDialogErrorMessage(nextMessage);
      setMessage(nextMessage);
      setMessageTone("error");
    } finally {
      setSubmitting(false);
    }
  }

  const pendingRestoreCopy = pendingRestoreAction
    ? getRestoreCopy(pendingRestoreAction)
    : null;

  return (
    <AdminShell
      title="已删除知识库"
      description="管理知识库空间和知识页面的 14 天删除保留期。删除后内容对普通用户不可见，只有系统管理员可以在到期前恢复。"
    >
      {pendingRestoreAction && pendingRestoreCopy ? (
        <DangerConfirmDialog
          open
          title={pendingRestoreCopy.title}
          description={pendingRestoreCopy.description}
          confirmText={pendingRestoreCopy.confirmText}
          confirmLabel="请输入确认文案"
          actionLabel={pendingRestoreCopy.actionLabel}
          busy={submitting}
          errorMessage={dialogErrorMessage}
          onClose={() => {
            if (!submitting) {
              setPendingRestoreAction(null);
              setDialogErrorMessage(null);
            }
          }}
          onConfirm={handleConfirmRestore}
        />
      ) : null}

      {loading ? (
        <ResourceState
          title="正在加载已删除知识内容"
          description="正在读取知识库空间和页面的删除保留记录，请稍候。"
        />
      ) : error ? (
        <ResourceState title="已删除知识内容加载失败" description={error} tone="error" />
      ) : (
        <div className="space-y-6">
          {message ? (
            <ResourceState
              title="操作反馈"
              description={message}
              tone={messageTone}
            />
          ) : null}

          <section className="app-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">已删除空间</h2>
                <p className="mt-2 text-sm leading-7 text-foreground-muted">
                  仅展示已进入删除保留期的空知识库空间。到期后系统会自动真实删除。
                </p>
              </div>
              <span className="app-pill">{spaces.length} 个空间</span>
            </div>
            {spaces.length > 0 ? (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-[960px] divide-y divide-border text-left text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="px-5 py-4 font-medium">空间</th>
                      <th className="px-5 py-4 font-medium">归属群组</th>
                      <th className="px-5 py-4 font-medium">删除时间</th>
                      <th className="px-5 py-4 font-medium">清理时间</th>
                      <th className="px-5 py-4 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {spaces.map((space) => (
                      <tr key={space.id}>
                        <td className="px-5 py-4">
                          <div className="font-medium">{space.name}</div>
                          <div className="mt-1 text-xs text-foreground-soft">{space.code}</div>
                        </td>
                        <td className="px-5 py-4 text-foreground-muted">
                          {space.ownerGroup?.name || "未绑定群组"}
                        </td>
                        <td className="px-5 py-4 tabular-nums text-foreground-muted whitespace-nowrap">
                          {formatDateTime(space.deletedAt)}
                        </td>
                        <td className="px-5 py-4 tabular-nums text-foreground-muted whitespace-nowrap">
                          {formatDateTime(space.deleteExpiresAt)}
                        </td>
                        <td className="px-5 py-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="softSuccess"
                            disabled={submitting}
                            onClick={() =>
                              setPendingRestoreAction({
                                type: "space",
                                item: space,
                              })
                            }
                          >
                            恢复空间
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-border-soft bg-surface p-4 text-sm text-foreground-soft">
                当前没有处于删除保留期的知识库空间。
              </div>
            )}
          </section>

          <section className="app-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">已删除页面</h2>
                <p className="mt-2 text-sm leading-7 text-foreground-muted">
                  页面删除后普通成员不可见；若仍在 14 天保留期内，可由系统管理员直接恢复。
                </p>
              </div>
              <span className="app-pill">{pages.length} 篇页面</span>
            </div>
            {pages.length > 0 ? (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-[1120px] divide-y divide-border text-left text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="px-5 py-4 font-medium">页面</th>
                      <th className="px-5 py-4 font-medium">所属空间</th>
                      <th className="px-5 py-4 font-medium">作者</th>
                      <th className="px-5 py-4 font-medium">删除时间</th>
                      <th className="px-5 py-4 font-medium">清理时间</th>
                      <th className="px-5 py-4 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pages.map((page) => (
                      <tr key={page.id}>
                        <td className="px-5 py-4">
                          <div className="font-medium">{page.title}</div>
                          <div className="mt-1 text-xs text-foreground-soft">{page.slug}</div>
                        </td>
                        <td className="px-5 py-4 text-foreground-muted">{page.space.name}</td>
                        <td className="px-5 py-4 text-foreground-muted">
                          {page.author?.realName || page.editor?.realName || "未知"}
                        </td>
                        <td className="px-5 py-4 tabular-nums text-foreground-muted whitespace-nowrap">
                          {formatDateTime(page.deletedAt)}
                        </td>
                        <td className="px-5 py-4 tabular-nums text-foreground-muted whitespace-nowrap">
                          {formatDateTime(page.deleteExpiresAt)}
                        </td>
                        <td className="px-5 py-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="softSuccess"
                            disabled={submitting}
                            onClick={() =>
                              setPendingRestoreAction({
                                type: "page",
                                item: page,
                              })
                            }
                          >
                            恢复页面
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-border-soft bg-surface p-4 text-sm text-foreground-soft">
                当前没有处于删除保留期的知识页面。
              </div>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
