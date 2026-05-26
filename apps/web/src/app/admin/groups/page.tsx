"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../_components/admin-shell";
import { ResourceState } from "../_components/resource-state";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import {
  EntitySelector,
  type EntitySelectorOption,
} from "@/components/ui/entity-selector";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  AddGroupMemberPayload,
  BootstrapDirectionGroupsResult,
  CreateGroupPayload,
  GroupSummary,
  MembershipRole,
  UserSummary,
} from "@/lib/contracts";

const groupTypeMap: Record<GroupSummary["type"], string> = {
  DIRECTION: "方向组",
  GRADE: "年级组",
  FUNCTIONAL: "功能组",
  SYSTEM: "系统组",
};

function buildGroupSelectorOptions(groups: GroupSummary[]): EntitySelectorOption[] {
  return groups.map((group) => ({
    id: group.id,
    label: group.name,
    description: [group.code, group.description].filter(Boolean).join(" / "),
    keywords: [group.code, groupTypeMap[group.type]],
    badges:
      group._count.memberships > 0
        ? [`${group._count.memberships} 位成员`]
        : undefined,
    filterTags: [
      {
        id: group.type,
        label: groupTypeMap[group.type],
      },
    ],
    section: groupTypeMap[group.type],
  }));
}

function buildUserSelectorOptions(users: UserSummary[]): EntitySelectorOption[] {
  return users.map((user) => ({
    id: user.id,
    label: user.realName,
    description: [user.email, user.username ? `账号 ${user.username}` : null]
      .filter(Boolean)
      .join(" / "),
    keywords: [user.email, user.username ?? "", user.studentId ?? ""],
    filterTags: user.memberships.map(({ group }) => ({
      id: group.id,
      label: group.name,
    })),
  }));
}

type PendingDangerAction =
  | {
      type: "bootstrap-directions";
      title: string;
      description: string;
      confirmText: string;
      actionLabel: string;
    }
  | {
      type: "delete-group";
      group: GroupSummary;
      title: string;
      description: string;
      confirmText: string;
      actionLabel: string;
    };

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingDangerAction, setPendingDangerAction] =
    useState<PendingDangerAction | null>(null);
  const [groupForm, setGroupForm] = useState<CreateGroupPayload>({
    code: "",
    name: "",
    type: "FUNCTIONAL",
    description: "",
    parentId: "",
  });
  const [memberForm, setMemberForm] = useState<{
    groupId: string;
    userId: string;
    membershipRole: MembershipRole;
  }>({
    groupId: "",
    userId: "",
    membershipRole: "MEMBER",
  });

  async function fetchGroupAdminData() {
    const [groupsData, usersData] = await Promise.all([
      fetchApi<GroupSummary[]>("/groups"),
      fetchApi<UserSummary[]>("/users"),
    ]);

    return { groupsData, usersData };
  }

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const { groupsData, usersData } = await fetchGroupAdminData();
      setGroups(groupsData);
      setUsers(usersData);
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "无法获取群组列表数据",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { groupsData, usersData } = await fetchGroupAdminData();

        if (!active) {
          return;
        }

        setGroups(groupsData);
        setUsers(usersData);
      } catch (error) {
        if (!active) {
          return;
        }

        setError(
          error instanceof ApiError ? error.message : "无法获取群组列表数据",
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

  async function handleCreateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setActionMessage(null);

    try {
      await sendJson<GroupSummary, CreateGroupPayload>("/groups", "POST", {
        code: groupForm.code.trim(),
        name: groupForm.name.trim(),
        type: groupForm.type,
        description: groupForm.description?.trim() || undefined,
        parentId: groupForm.parentId?.trim() || undefined,
      });

      setGroupForm({
        code: "",
        name: "",
        type: "FUNCTIONAL",
        description: "",
        parentId: "",
      });
      setActionMessage("群组已创建。");
      await loadData();
    } catch (error) {
      setActionMessage(
        error instanceof ApiError ? error.message : "创建群组失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!memberForm.groupId || !memberForm.userId) {
      setActionMessage("请选择群组和用户。");
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      await sendJson<unknown, AddGroupMemberPayload>(
        `/groups/${memberForm.groupId}/members`,
        "POST",
        {
          userId: memberForm.userId,
          membershipRole: memberForm.membershipRole,
        },
      );

      setActionMessage("群组成员已更新。");
      await loadData();
    } catch (error) {
      setActionMessage(
        error instanceof ApiError ? error.message : "添加群组成员失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function executeBootstrapDirections() {
    const result = await sendJson<
      BootstrapDirectionGroupsResult,
      Record<string, never>
    >("/groups/bootstrap-directions", "POST", {});

    setGroups(result.groups);
    setActionMessage(
      `默认方向资源已同步：群组新增 ${result.createdGroupCount} 个、更新 ${result.updatedGroupCount} 个；空间新增 ${result.createdSpaceCount} 个、更新 ${result.updatedSpaceCount} 个。当前方向模板为 Android / Web / iOS / HarmonyOS / Server。`,
    );
  }

  function handleBootstrapDirections() {
    setPendingDangerAction({
      type: "bootstrap-directions",
      title: "初始化方向组与空间",
      description:
        "该操作会批量创建或更新默认方向组与方向知识空间，并兼容历史命名数据。为避免误操作，请输入指定确认文案后继续。",
      confirmText: "确认初始化方向组与空间",
      actionLabel: "确认初始化",
    });
  }

  function handleDeleteGroup(group: GroupSummary) {
    const occupiedReasons = [];

    if (group._count.memberships > 0) {
      occupiedReasons.push(`${group._count.memberships} 个成员`);
    }

    if (group._count.children > 0) {
      occupiedReasons.push(`${group._count.children} 个子群组`);
    }

    if (group._count.knowledgeSpaces > 0) {
      occupiedReasons.push(`${group._count.knowledgeSpaces} 个知识空间`);
    }

    if (occupiedReasons.length > 0) {
      setActionMessage(
        `群组 ${group.name} 当前无法删除：仍关联 ${occupiedReasons.join("、")}。请先解除关联后再删除。`,
      );
      return;
    }

    setPendingDangerAction({
      type: "delete-group",
      group,
      title: `删除群组 ${group.name}`,
      description:
        "删除后该群组将从系统中移除，且无法恢复。为防止误操作，请输入指定确认文案后继续。",
      confirmText: `确认删除 ${group.name}`,
      actionLabel: "确认删除",
    });
  }

  async function handleConfirmDangerAction() {
    if (!pendingDangerAction) {
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      if (pendingDangerAction.type === "bootstrap-directions") {
        await executeBootstrapDirections();
      } else {
        await sendJson<GroupSummary, Record<string, never>>(
          `/groups/${pendingDangerAction.group.id}`,
          "DELETE",
          {},
        );
        setActionMessage(`群组 ${pendingDangerAction.group.name} 已删除。`);
        await loadData();
      }

      setPendingDangerAction(null);
    } catch (error) {
      setActionMessage(
        error instanceof ApiError
          ? error.message
          : pendingDangerAction.type === "bootstrap-directions"
            ? "初始化方向组与空间失败"
            : "删除群组失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const groupSelectorOptions = useMemo(() => buildGroupSelectorOptions(groups), [groups]);
  const userSelectorOptions = useMemo(() => buildUserSelectorOptions(users), [users]);

  return (
    <AdminShell
      title="群组管理"
      description="查看方向组、年级组和功能组的基础信息、成员数量以及层级关系，并支持新增群组与绑定成员。"
    >
      {pendingDangerAction ? (
        <DangerConfirmDialog
          open
          title={pendingDangerAction.title}
          description={pendingDangerAction.description}
          confirmText={pendingDangerAction.confirmText}
          confirmLabel="请输入确认文案"
          actionLabel={pendingDangerAction.actionLabel}
          busy={submitting}
          onClose={() => {
            if (!submitting) {
              setPendingDangerAction(null);
            }
          }}
          onConfirm={handleConfirmDangerAction}
        />
      ) : null}
      {loading ? (
        <ResourceState
          title="正在加载群组列表"
          description="正在读取群组数据，请稍候。"
        />
      ) : error ? (
        <ResourceState title="群组列表加载失败" description={error} tone="error" />
      ) : (
        <div className="space-y-6">
          <section className="app-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">默认方向组模板</h2>
                <p className="mt-2 text-sm leading-7 text-zinc-300">
                  一键生成实验室常用方向组及其知识空间，并兼容历史方向与空间数据。
                </p>
                <div className="mt-3 text-sm text-zinc-400">
                  Android / Web / iOS / HarmonyOS / Server
                </div>
              </div>
              <button
                type="button"
                onClick={handleBootstrapDirections}
                disabled={submitting}
                className="app-button-primary"
              >
                初始化方向组与空间
              </button>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <form
              onSubmit={handleCreateGroup}
              className="app-panel p-6"
            >
              <h2 className="text-xl font-semibold">新增群组</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">群组名称</div>
                  <input
                    required
                    value={groupForm.name}
                    onChange={(event) =>
                      setGroupForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    className="app-input"
                    placeholder="例如：25级"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">群组编码</div>
                  <input
                    required
                    value={groupForm.code}
                    onChange={(event) =>
                      setGroupForm((prev) => ({ ...prev, code: event.target.value }))
                    }
                    className="app-input"
                    placeholder="例如：GRADE_25"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">群组类型</div>
                  <select
                    value={groupForm.type}
                    onChange={(event) =>
                      setGroupForm((prev) => ({
                        ...prev,
                        type: event.target.value as CreateGroupPayload["type"],
                      }))
                    }
                    className="app-input"
                  >
                    <option value="DIRECTION">方向组</option>
                    <option value="GRADE">年级组</option>
                    <option value="FUNCTIONAL">功能组</option>
                    <option value="SYSTEM">系统组</option>
                  </select>
                </label>
                <div className="text-sm">
                  <div className="mb-2 text-zinc-300">父群组</div>
                  <EntitySelector
                    title="父群组"
                    description="支持按群组名称、编码搜索，并按群组类型筛选。"
                    items={groupSelectorOptions}
                    selectedIds={groupForm.parentId ? [groupForm.parentId] : []}
                    onSelectionChange={(nextSelectedIds) =>
                      setGroupForm((prev) => ({
                        ...prev,
                        parentId: nextSelectedIds[0] ?? "",
                      }))
                    }
                    selectionMode="single"
                    searchPlaceholder="搜索父群组名称、编码或类型"
                    selectedTitle="当前父群组"
                    selectedEmptyLabel="当前为顶层群组"
                    tone="neutral"
                  />
                </div>
                <label className="text-sm md:col-span-2">
                  <div className="mb-2 text-zinc-300">描述</div>
                  <textarea
                    value={groupForm.description ?? ""}
                    onChange={(event) =>
                      setGroupForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    className="app-textarea min-h-24"
                    placeholder="可选"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="app-button-primary-emerald mt-6"
              >
                创建群组
              </button>
            </form>

            <form
              onSubmit={handleAddMember}
              className="app-panel p-6"
            >
              <h2 className="text-xl font-semibold">添加群组成员</h2>
              <div className="mt-6 grid gap-4">
                <EntitySelector
                  title="选择群组"
                  description="支持按群组名称、编码搜索，并按群组类型筛选。"
                  items={groupSelectorOptions}
                  selectedIds={memberForm.groupId ? [memberForm.groupId] : []}
                  onSelectionChange={(nextSelectedIds) =>
                    setMemberForm((prev) => ({
                      ...prev,
                      groupId: nextSelectedIds[0] ?? "",
                    }))
                  }
                  selectionMode="single"
                  searchPlaceholder="搜索群组名称、编码或类型"
                  selectedTitle="当前绑定群组"
                  selectedEmptyLabel="暂未选择群组"
                  tone="sky"
                />
                <EntitySelector
                  title="选择用户"
                  description="支持按姓名、邮箱、账号搜索，并按用户已有群组筛选。"
                  items={userSelectorOptions}
                  selectedIds={memberForm.userId ? [memberForm.userId] : []}
                  onSelectionChange={(nextSelectedIds) =>
                    setMemberForm((prev) => ({
                      ...prev,
                      userId: nextSelectedIds[0] ?? "",
                    }))
                  }
                  selectionMode="single"
                  searchPlaceholder="搜索姓名、邮箱、账号或学号"
                  selectedTitle="当前绑定用户"
                  selectedEmptyLabel="暂未选择用户"
                  tone="emerald"
                />
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">成员身份</div>
                  <select
                    value={memberForm.membershipRole}
                    onChange={(event) =>
                      setMemberForm((prev) => ({
                        ...prev,
                        membershipRole: event.target
                          .value as AddGroupMemberPayload["membershipRole"],
                      }))
                    }
                    className="app-input"
                  >
                    <option value="MEMBER">普通成员</option>
                    <option value="MANAGER">管理员</option>
                  </select>
                </label>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="app-button-primary mt-6"
              >
                绑定成员
              </button>
            </form>
          </section>

          {actionMessage ? (
            <ResourceState
              title="操作反馈"
              description={actionMessage}
              tone={actionMessage.includes("失败") || actionMessage.includes("不存在") ? "error" : "default"}
            />
          ) : null}

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/5 text-zinc-300">
                <tr>
                  <th className="px-5 py-4 font-medium">群组名称</th>
                  <th className="px-5 py-4 font-medium">类型</th>
                  <th className="px-5 py-4 font-medium">编码</th>
                  <th className="px-5 py-4 font-medium">父群组</th>
                  <th className="px-5 py-4 font-medium">成员数</th>
                  <th className="px-5 py-4 font-medium">子群组数</th>
                  <th className="px-5 py-4 font-medium">空间数</th>
                  <th className="px-5 py-4 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium">{group.name}</div>
                      <div className="mt-1 text-xs text-zinc-400">
                        {group.description || "暂无描述"}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {groupTypeMap[group.type]}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">{group.code}</td>
                    <td className="px-5 py-4 text-zinc-300">
                      {group.parent?.name || "无"}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {group._count.memberships}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {group._count.children}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {group._count.knowledgeSpaces}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                        disabled={
                          submitting ||
                          group._count.memberships > 0 ||
                          group._count.children > 0 ||
                          group._count.knowledgeSpaces > 0
                        }
                        className="inline-flex cursor-pointer items-center justify-center rounded-full border border-red-400/20 px-4 py-2 text-sm text-red-100 transition-colors duration-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title={
                          group._count.memberships > 0 ||
                          group._count.children > 0 ||
                          group._count.knowledgeSpaces > 0
                            ? "请先移除成员、子群组和绑定空间后再删除"
                            : `删除群组 ${group.name}`
                        }
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
