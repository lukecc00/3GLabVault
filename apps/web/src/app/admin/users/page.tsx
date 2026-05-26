"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../_components/admin-shell";
import { ResourceState } from "../_components/resource-state";
import { useAuth } from "@/components/auth/auth-provider";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import {
  EntitySelector,
  type EntitySelectorOption,
} from "@/components/ui/entity-selector";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  BatchGenerateUsersResult,
  BatchGenerateUsersPayload,
  BatchGeneratedUserResult,
  CreateUserPayload,
  GroupType,
  GroupSummary,
  RegisterOptions,
  RegisterPrefixCheckPayload,
  RegisterPrefixCheckResult,
  ResetUserPasswordPayload,
  ResetUserPasswordResult,
  ReviewUserPayload,
  RoleSummary,
  UserSummary,
  UserStatus,
} from "@/lib/contracts";

const statusMap: Record<UserSummary["status"], string> = {
  PENDING: "待审核",
  ACTIVE: "已启用",
  DISABLED: "已禁用",
  REJECTED: "已驳回",
};

type PrefixCheckState =
  | {
      status: "idle" | "checking";
      message: string | null;
      prefix: string;
      email: string | null;
    }
  | {
      status: "available" | "unavailable";
      message: string;
      prefix: string;
      email: string;
    };

function normalizeNamePinyinInput(value: string) {
  return value.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

const groupTypeMap: Record<GroupType, string> = {
  DIRECTION: "方向组",
  GRADE: "年级组",
  FUNCTIONAL: "功能组",
  SYSTEM: "系统组",
};

function isArchivedUser(user: UserSummary | null | undefined) {
  return Boolean(user?.archivedAt);
}

function getUserStatusLabel(user: UserSummary) {
  return isArchivedUser(user) ? "已归档" : statusMap[user.status];
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}

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
    description: [
      user.email,
      user.username ? `账号 ${user.username}` : "未生成账号",
      user.studentId ? `学号 ${user.studentId}` : null,
    ]
      .filter(Boolean)
      .join(" / "),
    keywords: [
      user.email,
      user.username ?? "",
      user.studentId ?? "",
      getUserStatusLabel(user),
    ],
    badges: [getUserStatusLabel(user)],
    filterTags: user.memberships.map(({ group }) => ({
      id: group.id,
      label: group.name,
    })),
    section: getUserStatusLabel(user),
  }));
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [mailDomain, setMailDomain] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<BatchGeneratedUserResult[]>([]);
  const [registerPrefixCheck, setRegisterPrefixCheck] = useState<PrefixCheckState>({
    status: "idle",
    message: null,
    prefix: "",
    email: null,
  });
  const [pendingArchiveUser, setPendingArchiveUser] = useState<UserSummary | null>(null);
  const [archiveDialogError, setArchiveDialogError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [reviewStatus, setReviewStatus] = useState<UserStatus>("ACTIVE");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [registerForm, setRegisterForm] = useState<CreateUserPayload>({
    realName: "",
    namePinyin: "",
    password: "",
    bio: "",
    groupIds: [],
  });
  const [batchForm, setBatchForm] = useState<{
    rows: string;
    groupIds: string[];
  }>({
    rows: "",
    groupIds: [],
  });

  async function fetchUserAdminData() {
    const [usersData, rolesData, groupsData] = await Promise.all([
      fetchApi<UserSummary[]>("/users"),
      fetchApi<RoleSummary[]>("/roles"),
      fetchApi<GroupSummary[]>("/groups"),
    ]);

    let registerOptionsData: RegisterOptions | null = null;
    try {
      registerOptionsData = await fetchApi<RegisterOptions>("/users/register/options");
    } catch {
      registerOptionsData = null;
    }

    return { usersData, rolesData, groupsData, registerOptionsData };
  }

  function applyUserSelection(user: UserSummary | null) {
    if (!user) {
      setSelectedUserId("");
      setReviewStatus("ACTIVE");
      setSelectedRoleIds([]);
      setSelectedGroupIds([]);
      return;
    }

    setSelectedUserId(user.id);
    setReviewStatus(user.status);
    setSelectedRoleIds(user.roles.map(({ role }) => role.id));
    setSelectedGroupIds(user.memberships.map(({ group }) => group.id));
  }

  async function loadData(options?: { resetSelection?: boolean }) {
    setLoading(true);
    setError(null);

    try {
      const { usersData, rolesData, groupsData, registerOptionsData } =
        await fetchUserAdminData();

      setUsers(usersData);
      setRoles(rolesData);
      setGroups(groupsData);
      setMailDomain(registerOptionsData?.mailDomain ?? "");

      if (options?.resetSelection) {
        applyUserSelection(null);
      } else if (selectedUserId) {
        const nextSelectedUser =
          usersData.find((user) => user.id === selectedUserId) ?? null;
        if (nextSelectedUser) {
          applyUserSelection(nextSelectedUser);
        }
      }
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "无法获取用户管理数据",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { usersData, rolesData, groupsData, registerOptionsData } =
          await fetchUserAdminData();

        if (!active) {
          return;
        }

        setUsers(usersData);
        setRoles(rolesData);
        setGroups(groupsData);
        setMailDomain(registerOptionsData?.mailDomain ?? "");
      } catch (error) {
        if (!active) {
          return;
        }

        setError(
          error instanceof ApiError ? error.message : "无法获取用户管理数据",
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

  useEffect(() => {
    const namePinyin = registerForm.namePinyin.trim();
    const currentMailDomain = mailDomain;

    if (!namePinyin) {
      const timer = window.setTimeout(() => {
        setRegisterPrefixCheck({
          status: "idle",
          message: null,
          prefix: "",
          email: null,
        });
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }

    if (!/^[a-z][a-z0-9]*$/.test(namePinyin)) {
      const timer = window.setTimeout(() => {
        setRegisterPrefixCheck({
          status: "unavailable",
          message: "姓名拼音需以字母开头，且只能包含字母和数字。",
          prefix: namePinyin,
          email: currentMailDomain ? `${namePinyin}@${currentMailDomain}` : "",
        });
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }

    const timer = window.setTimeout(() => {
      setRegisterPrefixCheck({
        status: "checking",
        message: "正在检查邮箱前缀是否可用...",
        prefix: namePinyin,
        email: currentMailDomain ? `${namePinyin}@${currentMailDomain}` : null,
      });

      void (async () => {
        try {
          const result = await sendJson<
            RegisterPrefixCheckResult,
            RegisterPrefixCheckPayload
          >("/users/register/prefix-check", "POST", {
            namePinyin,
          });

          setRegisterPrefixCheck({
            status: result.available ? "available" : "unavailable",
            message: result.message,
            prefix: result.prefix,
            email: result.email,
          });
        } catch (error) {
          setRegisterPrefixCheck({
            status: "unavailable",
            message:
              error instanceof ApiError
                ? error.message
                : "邮箱前缀校验失败，请稍后重试。",
            prefix: namePinyin,
            email: currentMailDomain ? `${namePinyin}@${currentMailDomain}` : "",
          });
        }
      })();
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [mailDomain, registerForm.namePinyin]);

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (registerPrefixCheck.status === "checking") {
      setActionMessage("正在检查邮箱前缀，请稍候后再提交。");
      return;
    }

    if (registerPrefixCheck.status === "unavailable") {
      setActionMessage(
        registerPrefixCheck.message || "当前邮箱前缀不可用，请调整后再提交。",
      );
      return;
    }

    setSubmitting(true);
    setActionMessage(null);
    setBatchResults([]);

    try {
      const payload: CreateUserPayload = {
        realName: registerForm.realName,
        namePinyin: registerForm.namePinyin,
        password: registerForm.password,
        bio: registerForm.bio?.trim() || undefined,
        groupIds: registerForm.groupIds,
      };

      const user = await sendJson<UserSummary, CreateUserPayload>(
        "/users/register",
        "POST",
        payload,
      );

      setRegisterForm({
        realName: "",
        namePinyin: "",
        password: "",
        bio: "",
        groupIds: [],
      });
      setActionMessage(
        `新成员注册信息已提交，系统账号为 ${user.username}，自动邮箱为 ${user.email}。`,
      );
      await loadData({ resetSelection: true });
    } catch (error) {
      setActionMessage(
        error instanceof ApiError ? error.message : "提交注册失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBatchGenerateSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setSubmitting(true);
    setActionMessage(null);
    setBatchResults([]);

    const users = batchForm.rows
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [realName, studentId] = line
          .split(/[，,]/)
          .map((item) => item.trim());

        return {
          realName,
          studentId: studentId || undefined,
        };
      });

    if (users.length === 0 || users.some((user) => !user.realName)) {
      setSubmitting(false);
      setActionMessage("请至少输入一条有效成员信息，格式为：姓名,学号。");
      return;
    }

    try {
      const results = await sendJson<
        BatchGenerateUsersResult,
        BatchGenerateUsersPayload
      >("/users/batch-generate", "POST", {
        groupIds: batchForm.groupIds,
        users,
      });

      setBatchResults(results.createdUsers);
      setBatchForm({
        rows: "",
        groupIds: [],
      });
      setActionMessage(
        results.failedUsers.length > 0
          ? `已生成 ${results.createdUsers.length} 个账号，失败 ${results.failedUsers.length} 个，请检查下方结果。`
          : "已完成批量账号生成，请及时分发临时密码。",
      );
      await loadData({ resetSelection: true });
    } catch (error) {
      setActionMessage(
        error instanceof ApiError ? error.message : "批量生成账号失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUserId) {
      setActionMessage("请先选择一个用户。");
      return;
    }

    setSubmitting(true);
    setActionMessage(null);

    try {
      const payload: ReviewUserPayload = {
        status: reviewStatus,
        roleIds: selectedRoleIds,
        groupIds: selectedGroupIds,
      };

      await sendJson<UserSummary, ReviewUserPayload>(
        `/users/${selectedUserId}/review`,
        "PATCH",
        payload,
      );

      setActionMessage("用户审核与分配已更新。");
      await loadData();
    } catch (error) {
      setActionMessage(
        error instanceof ApiError ? error.message : "更新用户失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUserId) {
      setActionMessage("请先选择一个用户。");
      return;
    }

    setSubmitting(true);
    setActionMessage(null);
    setBatchResults([]);

    try {
      const result = await sendJson<
        ResetUserPasswordResult,
        ResetUserPasswordPayload
      >(`/users/${selectedUserId}/reset-password`, "POST", {});

      setActionMessage(
        `已重置 ${result.user.realName} 的密码，新的临时密码为 ${result.temporaryPassword}。该账号下次登录时会被强制修改密码。`,
      );
      await loadData();
    } catch (error) {
      setActionMessage(
        error instanceof ApiError ? error.message : "重置密码失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleArchiveUser(user: UserSummary) {
    if (currentUser?.id === user.id) {
      setActionMessage("不能归档当前登录账号。");
      return;
    }

    setPendingArchiveUser(user);
    setArchiveDialogError(null);
    setActionMessage(null);
  }

  async function handleConfirmArchiveUser() {
    if (!pendingArchiveUser) {
      return;
    }

    setSubmitting(true);
    setActionMessage(null);
    setArchiveDialogError(null);
    setBatchResults([]);

    try {
      const archivedUser = await sendJson<UserSummary, Record<string, never>>(
        `/users/${pendingArchiveUser.id}/archive`,
        "POST",
        {},
      );

      const expiresAt = formatDateTime(archivedUser.archiveExpiresAt);
      if (expiresAt) {
        setActionMessage(
          `用户 ${archivedUser.realName} 已归档并禁用，内容保留至 ${expiresAt}，可前往“归档用户”页面继续管理。`,
        );
      } else {
        setActionMessage(
          `用户 ${archivedUser.realName} 已归档并禁用，系统将在 60 天后自动清理，可前往“归档用户”页面继续管理。`,
        );
      }
      setPendingArchiveUser(null);
      await loadData({ resetSelection: true });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "归档用户失败";
      setArchiveDialogError(message);
      setActionMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  function toggleValue(
    value: string,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    setter(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  const registerSelectableGroups = groups.filter((group) => group.type !== "SYSTEM");
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const registerGroupOptions = useMemo(
    () => buildGroupSelectorOptions(registerSelectableGroups),
    [registerSelectableGroups],
  );
  const reviewGroupOptions = useMemo(
    () => buildGroupSelectorOptions(groups),
    [groups],
  );
  const reviewUserOptions = useMemo(() => buildUserSelectorOptions(users), [users]);

  return (
    <AdminShell
      title="用户管理"
      description="查看实验室成员的注册状态、角色和所属群组，并直接提交注册信息、审核结果和角色群组分配。"
    >
      {pendingArchiveUser ? (
        <DangerConfirmDialog
          open
          title={`归档用户 ${pendingArchiveUser.realName}`}
          description="归档后该用户会被禁用 60 天，期间账号不可登录；到期未恢复的内容会被自动彻底清理。为防止误操作，请输入指定确认文案后继续。"
          confirmText={`确认归档用户 ${pendingArchiveUser.realName}`}
          confirmLabel="请输入确认文案"
          actionLabel="确认归档用户"
          busy={submitting}
          errorMessage={archiveDialogError}
          onClose={() => {
            if (!submitting) {
              setPendingArchiveUser(null);
              setArchiveDialogError(null);
            }
          }}
          onConfirm={handleConfirmArchiveUser}
        />
      ) : null}
      {loading ? (
        <ResourceState
          title="正在加载用户列表"
          description="正在读取成员数据，请稍候。"
        />
      ) : error ? (
        <ResourceState title="用户列表加载失败" description={error} tone="error" />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
            <form
              onSubmit={handleRegisterSubmit}
              className="app-panel p-6"
            >
              <h2 className="text-xl font-semibold">新成员注册</h2>
              <p className="mt-2 text-sm leading-7 text-zinc-300">
                录入成员姓名、姓名拼音和初始密码。一个成员可同时预绑定多个不同类别群组，例如 Android 与 22级。
              </p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">姓名</div>
                  <input
                    required
                    value={registerForm.realName ?? ""}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        realName: event.target.value,
                      }))
                    }
                    className="app-input"
                    placeholder="输入真实姓名"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">姓名拼音</div>
                  <input
                    required
                    value={registerForm.namePinyin ?? ""}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        namePinyin: normalizeNamePinyinInput(event.target.value),
                      }))
                    }
                    className="app-input"
                    placeholder="例如：zhangsan"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">初始密码</div>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={registerForm.password}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    className="app-input"
                    placeholder="至少 8 位"
                  />
                </label>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                  <div className="text-zinc-300">邮箱预览</div>
                  <div className="mt-2 font-mono text-sky-200">
                    {registerPrefixCheck.email ||
                      (mailDomain ? `name@${mailDomain}` : "name@example.com")}
                  </div>
                  <div
                    className={`mt-2 ${
                      registerPrefixCheck.status === "available"
                        ? "text-emerald-300"
                        : registerPrefixCheck.status === "unavailable"
                          ? "text-red-300"
                          : "text-zinc-400"
                    }`}
                  >
                    {registerPrefixCheck.message ||
                      "请输入姓名拼音，系统将检查邮箱前缀是否可用。"}
                  </div>
                </div>
                <div className="text-sm md:col-span-2">
                  <div className="mb-2 text-zinc-300">预绑定群组</div>
                  <EntitySelector
                    title="预绑定群组"
                    description="支持按群组名称、编码搜索，并按群组类型筛选，适合在大量群组下快速定位。"
                    items={registerGroupOptions}
                    selectedIds={registerForm.groupIds ?? []}
                    onSelectionChange={(nextSelectedIds) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        groupIds: nextSelectedIds,
                      }))
                    }
                    searchPlaceholder="搜索群组名称、编码或类型"
                    selectedTitle="已选预绑定群组"
                    selectedEmptyLabel="暂未预绑定任何群组"
                    tone="sky"
                  />
                </div>
                <label className="text-sm md:col-span-2">
                  <div className="mb-2 text-zinc-300">个人简介</div>
                  <textarea
                    value={registerForm.bio ?? ""}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        bio: event.target.value,
                      }))
                    }
                    className="app-textarea"
                    placeholder="可选"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={
                  submitting ||
                  registerPrefixCheck.status === "checking" ||
                  registerPrefixCheck.status === "unavailable"
                }
                className="app-button-primary-emerald mt-6"
              >
                提交注册
              </button>
            </form>

            <form
              onSubmit={handleReviewSubmit}
              className="app-panel p-6"
            >
              <h2 className="text-xl font-semibold">审核与分配</h2>
              <p className="mt-2 text-sm leading-7 text-zinc-300">
                选择用户后可调整状态、角色和群组，用于管理员审核与成员归类。
              </p>
              <div className="mt-6 space-y-4">
                <EntitySelector
                  title="选择用户"
                  description="支持按姓名、邮箱、账号、学号搜索，并按所属群组筛选，适合用户量较大时快速定位。"
                  items={reviewUserOptions}
                  selectedIds={selectedUserId ? [selectedUserId] : []}
                  onSelectionChange={(nextSelectedIds) =>
                    applyUserSelection(
                      users.find((user) => user.id === (nextSelectedIds[0] ?? "")) ?? null,
                    )
                  }
                  selectionMode="single"
                  searchPlaceholder="搜索姓名、邮箱、账号、学号或状态"
                  selectedTitle="当前审核对象"
                  selectedEmptyLabel="暂未选择用户"
                  tone="sky"
                />
                <label className="block text-sm">
                  <div className="mb-2 text-zinc-300">审核状态</div>
                  <select
                    value={reviewStatus}
                    onChange={(event) =>
                      setReviewStatus(event.target.value as UserStatus)
                    }
                    className="app-input"
                  >
                    <option value="ACTIVE">已启用</option>
                    <option value="DISABLED">已禁用</option>
                    <option value="REJECTED">已驳回</option>
                  </select>
                </label>
                <div>
                  <div className="mb-2 text-sm text-zinc-300">角色分配</div>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() =>
                          toggleValue(role.id, selectedRoleIds, setSelectedRoleIds)
                        }
                        className={`rounded-full px-3 py-2 text-xs transition ${
                          selectedRoleIds.includes(role.id)
                            ? "bg-emerald-400 text-zinc-950"
                            : "border border-white/10 bg-black/20 text-zinc-200"
                        }`}
                      >
                        {role.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm text-zinc-300">群组分配</div>
                  <EntitySelector
                    title="群组分配"
                    description="支持按群组名称、编码搜索，并按方向组、年级组、功能组快速筛选。"
                    items={reviewGroupOptions}
                    selectedIds={selectedGroupIds}
                    onSelectionChange={setSelectedGroupIds}
                    searchPlaceholder="搜索群组名称、编码或类型"
                    selectedTitle="已分配群组"
                    selectedEmptyLabel="暂未分配任何群组"
                    tone="sky"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || !selectedUserId}
                className="mt-6 rounded-full bg-sky-400 px-5 py-3 text-sm font-medium text-zinc-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                保存审核结果
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={submitting || !selectedUserId}
                className="mt-3 rounded-full border border-amber-400/30 bg-amber-400/10 px-5 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                重置密码并强制改密
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedUser) {
                    handleArchiveUser(selectedUser);
                  }
                }}
                disabled={
                  submitting ||
                  !selectedUser ||
                  selectedUser.id === currentUser?.id
                }
                className="mt-3 rounded-full border border-red-400/30 bg-red-400/10 px-5 py-3 text-sm font-medium text-red-100 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                title={
                  selectedUser?.id === currentUser?.id
                    ? "不能归档当前登录账号"
                    : selectedUser
                      ? `归档用户 ${selectedUser.realName}`
                      : "请先选择一个用户"
                }
              >
                归档用户
              </button>
            </form>
          </section>

          <form
            onSubmit={handleBatchGenerateSubmit}
            className="rounded-3xl border border-white/10 bg-white/5 p-6"
          >
            <h2 className="text-xl font-semibold">批量生成账号</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-300">
              每行输入一位成员，格式为“姓名,学号”。系统会自动生成拼音账号、实验室邮箱，并返回临时密码。
            </p>
            <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
              <label className="text-sm">
                <div className="mb-2 text-zinc-300">成员名单</div>
                <textarea
                  required
                  value={batchForm.rows}
                  onChange={(event) =>
                    setBatchForm((prev) => ({
                      ...prev,
                      rows: event.target.value,
                    }))
                  }
                  className="min-h-44 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-mono outline-none placeholder:text-zinc-500"
                  placeholder={"张三,20220001\n李四,20220002"}
                />
              </label>
              <div>
                <div className="mb-2 text-sm text-zinc-300">绑定群组</div>
                <EntitySelector
                  title="绑定群组"
                  description="批量建号时可直接筛选并绑定多个群组，避免在长列表中逐个查找。"
                  items={reviewGroupOptions}
                  selectedIds={batchForm.groupIds}
                  onSelectionChange={(nextSelectedIds) =>
                    setBatchForm((prev) => ({
                      ...prev,
                      groupIds: nextSelectedIds,
                    }))
                  }
                  searchPlaceholder="搜索群组名称、编码或类型"
                  selectedTitle="批量绑定群组"
                  selectedEmptyLabel="暂未绑定任何群组"
                  tone="emerald"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 rounded-full bg-emerald-400 px-5 py-3 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  批量生成账号
                </button>
              </div>
            </div>
          </form>

          {actionMessage ? (
            <ResourceState
              title="操作反馈"
              description={actionMessage}
              tone={actionMessage.includes("失败") || actionMessage.includes("无效") ? "error" : "default"}
            />
          ) : null}

          {batchResults.length > 0 ? (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/5 text-zinc-300">
                  <tr>
                    <th className="px-5 py-4 font-medium">姓名</th>
                    <th className="px-5 py-4 font-medium">账号</th>
                    <th className="px-5 py-4 font-medium">邮箱</th>
                    <th className="px-5 py-4 font-medium">临时密码</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {batchResults.map((result) => (
                    <tr key={result.user.id}>
                      <td className="px-5 py-4">{result.user.realName}</td>
                      <td className="px-5 py-4 text-zinc-300">
                        {result.user.username}
                      </td>
                      <td className="px-5 py-4 text-zinc-300">{result.user.email}</td>
                      <td className="px-5 py-4 font-mono text-emerald-300">
                        {result.temporaryPassword}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="bg-white/5 text-zinc-300">
                <tr>
                  <th className="px-5 py-4 font-medium">姓名</th>
                  <th className="px-5 py-4 font-medium">邮箱</th>
                  <th className="px-5 py-4 font-medium">状态</th>
                  <th className="px-5 py-4 font-medium">邮箱开户</th>
                  <th className="px-5 py-4 font-medium">角色</th>
                  <th className="px-5 py-4 font-medium">群组</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`align-top ${selectedUserId === user.id ? "bg-white/5" : ""}`}
                  >
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => applyUserSelection(user)}
                        className="text-left"
                      >
                        <div className="font-medium">{user.realName}</div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {(user.username || "未生成账号") + " / " + (user.studentId || "暂无学号")}
                        </div>
                      </button>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">{user.email}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-200">
                        {getUserStatusLabel(user)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {user.mailboxProvisioningStatus === "PROVISIONED"
                        ? "已开户"
                        : user.mailboxProvisioningStatus === "FAILED"
                          ? user.mailboxLastError || "开户失败"
                          : "待处理"}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {user.roles.length > 0
                        ? user.roles.map(({ role }) => role.name).join("、")
                        : "未分配"}
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      {user.memberships.length > 0
                        ? user.memberships.map(({ group }) => group.name).join("、")
                        : "未加入"}
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
