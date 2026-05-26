"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../../_components/admin-shell";
import { ResourceState } from "../../_components/resource-state";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type { UserSummary } from "@/lib/contracts";

function formatDateTime(value: string | null) {
  if (!value) {
    return "未知";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

export default function ArchivedUsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [pendingRestoreUser, setPendingRestoreUser] = useState<UserSummary | null>(
    null,
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

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

  function handleOpenRestoreDialog(user: UserSummary) {
    if (user.contentRestoredAt) {
      setActionMessage("该用户内容已恢复到系统管理员名下。");
      return;
    }

    setPendingRestoreUser(user);
    setActionMessage(null);
  }

  async function handleConfirmRestore() {
    if (!pendingRestoreUser) {
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      await sendJson<UserSummary, Record<string, never>>(
        `/users/${pendingRestoreUser.id}/restore-content`,
        "POST",
        {},
      );
      setPendingRestoreUser(null);
      setActionMessage(
        `已将 ${pendingRestoreUser.realName} 的内容转移到系统管理员名下。`,
      );
      await loadUsers();
    } catch (restoreError) {
      setActionMessage(
        restoreError instanceof ApiError
          ? restoreError.message
          : "恢复归档内容失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell
      title="归档用户"
      description="集中管理已归档成员，查看保留截止时间，并在 60 天窗口期内将其可恢复内容转移到系统管理员名下。"
    >
      {pendingRestoreUser ? (
        <DangerConfirmDialog
          open
          title={`恢复 ${pendingRestoreUser.realName} 的内容`}
          description="恢复后，该用户名下可恢复的知识页与内部邮件内容会统一转移到系统管理员名下，该操作不可撤销。为防止误操作，请输入指定确认文案后继续。"
          confirmText={`确认恢复 ${pendingRestoreUser.realName} 的内容`}
          confirmLabel="请输入确认文案"
          actionLabel="确认恢复内容"
          busy={submitting}
          onClose={() => {
            if (!submitting) {
              setPendingRestoreUser(null);
            }
          }}
          onConfirm={handleConfirmRestore}
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
              tone={actionMessage.includes("失败") ? "error" : "default"}
            />
          ) : null}

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
              <div className="border-b border-white/10 px-5 py-3 text-xs text-zinc-400">
                左右滑动可查看更多字段，点击整行即可选择归档用户。
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[920px] divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/5 text-zinc-300">
                  <tr>
                    <th className="min-w-44 px-5 py-4 font-medium">姓名</th>
                    <th className="min-w-56 px-5 py-4 font-medium">邮箱</th>
                    <th className="min-w-44 px-5 py-4 font-medium">归档时间</th>
                    <th className="min-w-44 px-5 py-4 font-medium">清理时间</th>
                    <th className="min-w-56 px-5 py-4 font-medium">内容恢复</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      aria-selected={selectedUserId === user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={
                        selectedUserId === user.id
                          ? "cursor-pointer bg-white/5 transition-colors hover:bg-white/10"
                          : "cursor-pointer transition-colors hover:bg-white/5"
                      }
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
                          ? `已于 ${formatDateTime(user.contentRestoredAt)} 恢复`
                          : "尚未恢复"}
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
                选择归档用户后，可在保留窗口内把其内容转移到系统管理员名下。归档用户不会再出现在正常用户列表中。
              </p>

              {selectedUser ? (
                <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
                  <div>姓名：{selectedUser.realName}</div>
                  <div>邮箱：{selectedUser.email}</div>
                  <div>归档时间：{formatDateTime(selectedUser.archivedAt)}</div>
                  <div>清理时间：{formatDateTime(selectedUser.archiveExpiresAt)}</div>
                  <div>
                    内容恢复：
                    {selectedUser.contentRestoredAt
                      ? `已于 ${formatDateTime(selectedUser.contentRestoredAt)} 转移到系统管理员`
                      : "尚未恢复"}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                  请先从左侧列表选择一个归档用户。
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (selectedUser) {
                    handleOpenRestoreDialog(selectedUser);
                  }
                }}
                disabled={
                  submitting ||
                  !selectedUser ||
                  Boolean(selectedUser.contentRestoredAt)
                }
                className="mt-6 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                title={
                  !selectedUser
                    ? "请先选择一个归档用户"
                    : selectedUser.contentRestoredAt
                      ? "该用户内容已恢复"
                      : `恢复 ${selectedUser.realName} 的内容`
                }
              >
                恢复内容到系统管理员
              </button>
            </section>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
