"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../_components/admin-shell";
import { ResourceState } from "../../_components/resource-state";
import { Button } from "@/components/ui/button";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  ArchivedContentRestoreTarget,
  RestoreArchivedContentPayload,
  UserSummary,
} from "@/lib/contracts";

function formatDateTime(value: string | null) {
  if (!value) {
    return "未知";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

type PendingAction =
  | {
      type: "restore";
      target: ArchivedContentRestoreTarget;
      user: UserSummary;
    }
  | {
      type: "reactivate";
      user: UserSummary;
    };

function getDirectionNames(user: UserSummary) {
  return user.memberships
    .filter((membership) => membership.group.type === "DIRECTION")
    .map((membership) => membership.group.name);
}

function getActionCopy(action: PendingAction) {
  if (action.type === "reactivate") {
    return {
      title: `重新启用 ${action.user.realName}`,
      description:
        "重新启用后，该账号会恢复登录能力并退出归档列表；若该用户的内容此前已转移给管理员，重新启用不会自动回收这些已转移内容。",
      confirmText: `确认重新启用 ${action.user.realName}`,
      confirmLabel: "请输入确认文案",
      actionLabel: "确认重新启用",
      successMessage: `已重新启用 ${action.user.realName} 的账号。`,
    };
  }

  if (action.target === "LAB_ADMIN") {
    return {
      title: `转移 ${action.user.realName} 的内容到实验室管理员`,
      description:
        "转移后，该用户名下尚未接管的内容会统一转移到实验室管理员名下。知识页也会一并改挂到该管理员名下。该操作不可撤销，请确认后继续。",
      confirmText: `确认转移 ${action.user.realName} 到实验室管理员`,
      confirmLabel: "请输入确认文案",
      actionLabel: "确认转移到实验室管理员",
      successMessage: `已将 ${action.user.realName} 的内容转移到实验室管理员名下。`,
    };
  }

  return {
    title: `转移 ${action.user.realName} 的内容到方向管理员`,
    description:
      "转移后，该用户名下尚未接管的内容会转移到对应方向管理员名下；系统会优先选择同方向且同年级的方向管理员，若不存在则回退到上一个年级的方向管理员。若缺少方向归属、年级归属或可用管理员，系统会给出错误提示。该操作不可撤销，请确认后继续。",
    confirmText: `确认转移 ${action.user.realName} 到方向管理员`,
    confirmLabel: "请输入确认文案",
    actionLabel: "确认转移到方向管理员",
    successMessage: `已将 ${action.user.realName} 的内容转移到对应方向管理员名下。`,
  };
}

export default function ArchivedUsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageTone, setActionMessageTone] = useState<"default" | "error">(
    "default",
  );
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [dialogErrorMessage, setDialogErrorMessage] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );
  const selectedUserDirectionNames = useMemo(
    () => (selectedUser ? getDirectionNames(selectedUser) : []),
    [selectedUser],
  );
  const pendingActionCopy = pendingAction ? getActionCopy(pendingAction) : null;

  async function fetchArchivedUsers() {
    return fetchApi<UserSummary[]>("/users/archived");
  }

  async function loadUsers(resetSelection = false) {
    setLoading(true);
    setError(null);

    try {
      const archivedUsers = await fetchArchivedUsers();
      setUsers(archivedUsers);

      if (resetSelection) {
        setSelectedUserId("");
      } else if (selectedUserId) {
        const stillExists = archivedUsers.some((user) => user.id === selectedUserId);
        if (!stillExists) {
          setSelectedUserId("");
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof ApiError ? loadError.message : "无法获取归档用户列表",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const archivedUsers = await fetchArchivedUsers();
        if (!active) {
          return;
        }

        setUsers(archivedUsers);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof ApiError ? loadError.message : "无法获取归档用户列表",
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

  function handleOpenRestoreDialog(
    user: UserSummary,
    target: ArchivedContentRestoreTarget,
  ) {
    if (user.contentRestoredAt) {
      setActionMessage("该用户邮件内容已转移，不能重复转移。");
      setActionMessageTone("error");
      return;
    }

    setPendingAction({
      type: "restore",
      target,
      user,
    });
    setActionMessage(null);
    setDialogErrorMessage(null);
  }

  function handleOpenReactivateDialog(user: UserSummary) {
    setPendingAction({
      type: "reactivate",
      user,
    });
    setActionMessage(null);
    setDialogErrorMessage(null);
  }

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    const currentAction = pendingAction;
    const currentActionCopy = getActionCopy(currentAction);
    setSubmitting(true);
    setActionMessage(null);
    setDialogErrorMessage(null);

    try {
      if (currentAction.type === "restore") {
        const updatedUser = await sendJson<UserSummary, RestoreArchivedContentPayload>(
          `/users/${currentAction.user.id}/restore-content`,
          "POST",
          {
            target: currentAction.target,
          },
        );

        setUsers((currentUsers) =>
          currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
        );
      } else {
        const updatedUser = await sendJson<UserSummary, Record<string, never>>(
          `/users/${currentAction.user.id}/reactivate`,
          "POST",
          {},
        );

        setUsers((currentUsers) =>
          currentUsers.filter((user) => user.id !== updatedUser.id),
        );
        setSelectedUserId((currentSelectedUserId) =>
          currentSelectedUserId === updatedUser.id ? "" : currentSelectedUserId,
        );
      }

      setPendingAction(null);
      setDialogErrorMessage(null);
      setActionMessage(currentActionCopy.successMessage);
      setActionMessageTone("default");
    } catch (actionError) {
      const message =
        actionError instanceof ApiError
          ? actionError.message
          : currentAction.type === "restore"
            ? "恢复归档内容失败"
            : "重新启用账号失败";
      setDialogErrorMessage(message);
      setActionMessage(message);
      setActionMessageTone("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell
      title="归档用户"
      description="查看已归档用户。归档后 60 天内若无进一步处理，系统会自动删除账号及对应邮件资源；你可以在保留期内恢复内容给实验室管理员或方向管理员，也可以重新启用账号。若内容已转移，重新启用不会自动回收已转移内容。"
    >
      {pendingAction && pendingActionCopy ? (
        <DangerConfirmDialog
          open
          title={pendingActionCopy.title}
          description={pendingActionCopy.description}
          confirmText={pendingActionCopy.confirmText}
          confirmLabel={pendingActionCopy.confirmLabel}
          actionLabel={pendingActionCopy.actionLabel}
          busy={submitting}
          errorMessage={dialogErrorMessage}
          onClose={() => {
            if (!submitting) {
              setPendingAction(null);
              setDialogErrorMessage(null);
            }
          }}
          onConfirm={handleConfirmAction}
        />
      ) : null}

      {loading ? (
        <ResourceState
          title="正在加载归档用户"
          description="正在读取归档成员信息，请稍候。"
        />
      ) : error ? (
        <ResourceState title="归档用户加载失败" description={error} tone="error" />
      ) : (
        <div className="space-y-6">
          {actionMessage ? (
            <ResourceState
              title="操作反馈"
              description={actionMessage}
              tone={actionMessageTone}
            />
          ) : null}

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="app-table-shell">
              <div className="overflow-x-auto">
                <table className="min-w-[920px] divide-y divide-white/10 text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="min-w-44 px-5 py-4 font-medium">姓名</th>
                    <th className="min-w-56 px-5 py-4 font-medium">邮箱</th>
                    <th className="min-w-44 px-5 py-4 font-medium">归档时间</th>
                    <th className="min-w-44 px-5 py-4 font-medium">清理时间</th>
                    <th className="min-w-56 px-5 py-4 font-medium">内容转移</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      aria-selected={selectedUserId === user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={`app-selectable-row ${
                        selectedUserId === user.id ? "is-active" : ""
                      }`}
                    >
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(user.id)}
                          className="w-full text-left"
                        >
                          <div className="font-medium">{user.realName}</div>
                          <div className="mt-1 text-xs text-zinc-400">
                            {user.studentId || "暂无学号"}
                          </div>
                        </button>
                      </td>
                      <td className="px-5 py-4 text-zinc-300">{user.email}</td>
                      <td className="px-5 py-4 tabular-nums text-zinc-300 whitespace-nowrap">
                        {formatDateTime(user.archivedAt)}
                      </td>
                      <td className="px-5 py-4 tabular-nums text-zinc-300 whitespace-nowrap">
                        {formatDateTime(user.archiveExpiresAt)}
                      </td>
                      <td className="px-5 py-4 tabular-nums text-zinc-300 whitespace-nowrap">
                        {user.contentRestoredAt
                          ? `已于 ${formatDateTime(user.contentRestoredAt)} 转移`
                          : "尚未转移"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            <section className="app-panel p-6">
              <h2 className="text-xl font-semibold">归档操作</h2>
              <p className="mt-2 text-sm leading-7 text-zinc-300">
                归档后，知识页会先自动移交给对应的方向管理员、年级管理员或实验室管理员。保留期内你仍可继续把剩余内容转移给实验室管理员或对应方向管理员；恢复到方向管理员时会优先选择同年级方向管理员，不存在时回退到上一个年级。即使内容已转移，你也仍可重新启用该账号。
              </p>

              {selectedUser ? (
                <div className="mt-6 space-y-4 app-surface-soft p-4 text-sm text-zinc-300">
                  <div>姓名：{selectedUser.realName}</div>
                  <div>邮箱：{selectedUser.email}</div>
                  <div>
                    所属方向：
                    {selectedUserDirectionNames.length > 0
                      ? selectedUserDirectionNames.join("、")
                      : "暂无方向归属记录"}
                  </div>
                  <div>归档时间：{formatDateTime(selectedUser.archivedAt)}</div>
                  <div>清理时间：{formatDateTime(selectedUser.archiveExpiresAt)}</div>
                  <div>
                    内容转移：
                    {selectedUser.contentRestoredAt
                      ? `已于 ${formatDateTime(selectedUser.contentRestoredAt)} 完成内容转移`
                      : "尚未转移"}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border-soft bg-surface p-4 text-sm text-zinc-400">
                  请先从左侧列表选择一个归档用户。
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    if (selectedUser) {
                      handleOpenRestoreDialog(selectedUser, "LAB_ADMIN");
                    }
                  }}
                  variant="softSuccess"
                  disabled={
                    submitting ||
                    !selectedUser ||
                    Boolean(selectedUser.contentRestoredAt)
                  }
                  title={
                    !selectedUser
                      ? "请先选择一个归档用户"
                      : selectedUser.contentRestoredAt
                        ? "该用户内容已转移"
                        : `转移 ${selectedUser.realName} 的内容到实验室管理员`
                  }
                >
                  转移内容到实验室管理员
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    if (selectedUser) {
                      handleOpenRestoreDialog(selectedUser, "DIRECTION_ADMIN");
                    }
                  }}
                  disabled={
                    submitting ||
                    !selectedUser ||
                    Boolean(selectedUser.contentRestoredAt)
                  }
                  title={
                    !selectedUser
                      ? "请先选择一个归档用户"
                      : selectedUser.contentRestoredAt
                        ? "该用户内容已转移"
                        : `转移 ${selectedUser.realName} 的内容到方向管理员`
                  }
                >
                  转移内容到方向管理员
                </Button>

                <Button
                  type="button"
                  onClick={() => {
                    if (selectedUser) {
                      handleOpenReactivateDialog(selectedUser);
                    }
                  }}
                  variant="primary"
                  disabled={submitting || !selectedUser}
                  title={
                    !selectedUser
                      ? "请先选择一个归档用户"
                      : `重新启用 ${selectedUser.realName} 的账号`
                  }
                >
                  重新启用账号
                </Button>
              </div>
            </section>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
