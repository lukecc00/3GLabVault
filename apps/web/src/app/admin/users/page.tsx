"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "../_components/admin-shell";
import { ResourceState } from "../_components/resource-state";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import {
  EntitySelector,
  type EntitySelectorOption,
} from "@/components/ui/entity-selector";
import { PasswordInput } from "@/components/ui/password-input";
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
  UserDirectoryResult,
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

type UserDirectoryQueryState = {
  q: string;
  groupId: string;
  page: number;
  pageSize: number;
};

type FeedbackTone = "default" | "error";

type SectionFeedback = {
  message: string;
  tone: FeedbackTone;
};

const userDirectoryPageSizeOptions = [25, 50, 100];

function normalizeNamePinyinInput(value: string) {
  return value.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function keepSingleGradeGroup(
  nextSelectedIds: string[],
  availableGroups: Array<{ id: string; type: GroupType }>,
) {
  const gradeGroupIds = new Set(
    availableGroups
      .filter((group) => group.type === "GRADE")
      .map((group) => group.id),
  );
  let latestGradeGroupId: string | null = null;
  const resolvedIds: string[] = [];

  for (const id of nextSelectedIds) {
    if (gradeGroupIds.has(id)) {
      latestGradeGroupId = id;
      continue;
    }

    resolvedIds.push(id);
  }

  if (latestGradeGroupId) {
    resolvedIds.push(latestGradeGroupId);
  }

  return resolvedIds;
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

function getMailboxStatusLabel(user: UserSummary) {
  if (user.mailboxProvisioningStatus === "FAILED") {
    return "邮箱异常";
  }

  return null;
}

function getMailboxStatusDescription(user: UserSummary) {
  if (user.mailboxProvisioningStatus === "FAILED") {
    return user.mailboxLastError || "邮箱开通失败，请检查处理状态";
  }

  return null;
}

function getStatusToneClass(user: UserSummary) {
  if (isArchivedUser(user)) {
    return "app-eyebrow app-eyebrow-amber";
  }

  if (user.status === "ACTIVE") {
    return "app-eyebrow app-eyebrow-emerald";
  }

  if (user.status === "PENDING") {
    return "app-eyebrow app-eyebrow-sky";
  }

  return "app-eyebrow app-eyebrow-neutral";
}

function getMailboxToneClass(user: UserSummary) {
  if (user.mailboxProvisioningStatus === "FAILED") {
    return "app-eyebrow app-eyebrow-amber";
  }

  return null;
}

function getFieldValue(value: string | null | undefined, fallback = "未设置") {
  return value && value.trim() ? value : fallback;
}

function summarizeNames(names: string[], visibleCount = 2) {
  if (names.length === 0) {
    return "";
  }

  const visible = names.slice(0, visibleCount);
  const hiddenCount = names.length - visible.length;

  return hiddenCount > 0 ? `${visible.join("、")} +${hiddenCount}` : visible.join("、");
}

function buildUserDirectoryPath(query: UserDirectoryQueryState) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });

  if (query.q.trim()) {
    params.set("q", query.q.trim());
  }

  if (query.groupId) {
    params.set("groupId", query.groupId);
  }

  return `/users/directory?${params.toString()}`;
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
      user.notificationEmail ? `外部邮箱 ${user.notificationEmail}` : null,
    ]
      .filter(Boolean)
      .join(" / "),
    keywords: [
      user.email,
      user.username ?? "",
      user.notificationEmail ?? "",
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
  const [registerFeedback, setRegisterFeedback] = useState<SectionFeedback | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<SectionFeedback | null>(null);
  const [batchFeedback, setBatchFeedback] = useState<SectionFeedback | null>(null);
  const [batchResults, setBatchResults] = useState<BatchGeneratedUserResult[]>([]);
  const [batchFailedResults, setBatchFailedResults] = useState<
    BatchGenerateUsersResult["failedUsers"]
  >([]);
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
  const [reviewNotificationEmail, setReviewNotificationEmail] = useState<string>("");
  const [registerForm, setRegisterForm] = useState<CreateUserPayload>({
    realName: "",
    namePinyin: "",
    password: "",
    notificationEmail: "",
    bio: "",
    groupIds: [],
  });
  const [batchForm, setBatchForm] = useState<{
    rows: string;
    password: string;
    groupIds: string[];
  }>({
    rows: "",
    password: "",
    groupIds: [],
  });
  const [directoryData, setDirectoryData] = useState<UserDirectoryResult | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directorySearchInput, setDirectorySearchInput] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryGroupId, setDirectoryGroupId] = useState("");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryPageSize, setDirectoryPageSize] = useState(25);

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

  async function fetchUserDirectoryData(query: UserDirectoryQueryState) {
    return fetchApi<UserDirectoryResult>(buildUserDirectoryPath(query));
  }

  function applyUserSelection(user: UserSummary | null) {
    if (!user) {
      setSelectedUserId("");
      setReviewStatus("ACTIVE");
      setSelectedRoleIds([]);
      setSelectedGroupIds([]);
      setReviewNotificationEmail("");
      return;
    }

    setSelectedUserId(user.id);
    setReviewStatus(user.status);
    setSelectedRoleIds(user.roles.map(({ role }) => role.id));
    setSelectedGroupIds(user.memberships.map(({ group }) => group.id));
    setReviewNotificationEmail(user.notificationEmail ?? "");
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

  async function loadDirectory(nextQuery?: UserDirectoryQueryState) {
    setDirectoryLoading(true);
    setDirectoryError(null);

    try {
      const resolvedQuery = nextQuery ?? {
        q: directoryQuery,
        groupId: directoryGroupId,
        page: directoryPage,
        pageSize: directoryPageSize,
      };
      const nextDirectoryData = await fetchUserDirectoryData(resolvedQuery);

      setDirectoryData(nextDirectoryData);
      if (nextDirectoryData.page !== resolvedQuery.page) {
        setDirectoryPage(nextDirectoryData.page);
      }
    } catch (error) {
      setDirectoryError(
        error instanceof ApiError ? error.message : "无法加载用户目录",
      );
    } finally {
      setDirectoryLoading(false);
    }
  }

  function createFeedback(message: string): SectionFeedback {
    return {
      message,
      tone: message.includes("失败") || message.includes("无效") ? "error" : "default",
    };
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
    let active = true;

    void (async () => {
      setDirectoryLoading(true);
      setDirectoryError(null);

      try {
        const nextDirectoryData = await fetchUserDirectoryData({
          q: "",
          groupId: "",
          page: 1,
          pageSize: 25,
        });

        if (!active) {
          return;
        }

        setDirectoryData(nextDirectoryData);
      } catch (error) {
        if (!active) {
          return;
        }

        setDirectoryError(
          error instanceof ApiError ? error.message : "无法加载用户目录",
        );
      } finally {
        if (active) {
          setDirectoryLoading(false);
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
      setRegisterFeedback(createFeedback("正在检查邮箱前缀，请稍候后再提交。"));
      return;
    }

    if (registerPrefixCheck.status === "unavailable") {
      setRegisterFeedback(
        createFeedback(
          registerPrefixCheck.message || "当前邮箱前缀不可用，请调整后再提交。",
        ),
      );
      return;
    }

    setSubmitting(true);
    setRegisterFeedback(null);
    setBatchResults([]);

    try {
      const payload: CreateUserPayload = {
        realName: registerForm.realName,
        namePinyin: registerForm.namePinyin,
        password: registerForm.password,
        notificationEmail: registerForm.notificationEmail.trim(),
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
        notificationEmail: "",
        bio: "",
        groupIds: [],
      });
      setRegisterFeedback(
        createFeedback(
          `新成员注册信息已提交，系统账号为 ${user.username}，自动邮箱为 ${user.email}。`,
        ),
      );
      await Promise.all([loadData({ resetSelection: true }), loadDirectory()]);
    } catch (error) {
      setRegisterFeedback(
        createFeedback(error instanceof ApiError ? error.message : "提交注册失败"),
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
    setBatchFeedback(null);
    setBatchResults([]);
    setBatchFailedResults([]);
    const initialPassword = batchForm.password.trim();

    const users = batchForm.rows
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [realName, notificationEmail] = line
          .split(/[，,]/)
          .map((item) => item.trim());

        return {
          realName,
          notificationEmail: notificationEmail || "",
        };
      });

    if (
      users.length === 0 ||
      users.some((user) => !user.realName || !user.notificationEmail)
    ) {
      setSubmitting(false);
      setBatchFeedback(
        createFeedback("请至少输入一条有效成员信息，格式为：姓名,外部提醒邮箱。"),
      );
      return;
    }

    if (batchForm.password.trim().length < 8) {
      setSubmitting(false);
      setBatchFeedback(createFeedback("统一初始密码至少需要 8 位。"));
      return;
    }

    if (batchForm.groupIds.length === 0) {
      setSubmitting(false);
      setBatchFeedback(createFeedback("请至少绑定一个群组后再生成账号。"));
      return;
    }

    try {
      const results = await sendJson<
        BatchGenerateUsersResult,
        BatchGenerateUsersPayload
      >("/users/batch-generate", "POST", {
        groupIds: batchForm.groupIds,
        password: initialPassword,
        users,
      });

      setBatchResults(results.createdUsers);
      setBatchFailedResults(results.failedUsers);
      setBatchForm({
        rows: "",
        password: "",
        groupIds: [],
      });
      setBatchFeedback(
        createFeedback(
          results.failedUsers.length > 0
            ? `已生成 ${results.createdUsers.length} 个账号，失败 ${results.failedUsers.length} 个。初始密码为 ${initialPassword}，首次登录后系统会要求立即修改密码，修改完成后请使用新密码重新登录。`
            : `已完成批量账号生成。初始密码为 ${initialPassword}，首次登录后系统会要求立即修改密码，修改完成后请使用新密码重新登录。`,
        ),
      );
      await Promise.all([loadData({ resetSelection: true }), loadDirectory()]);
    } catch (error) {
      setBatchFeedback(
        createFeedback(error instanceof ApiError ? error.message : "批量生成账号失败"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUserId) {
      setReviewFeedback(createFeedback("请先选择一个用户。"));
      return;
    }

    setSubmitting(true);
    setReviewFeedback(null);

    try {
      const payload: ReviewUserPayload = {
        status: reviewStatus,
        roleIds: selectedRoleIds,
        groupIds: selectedGroupIds,
        notificationEmail: reviewNotificationEmail.trim() || undefined,
      };

      await sendJson<UserSummary, ReviewUserPayload>(
        `/users/${selectedUserId}/review`,
        "PATCH",
        payload,
      );

      setReviewFeedback(createFeedback("用户审核与分配已更新。"));
      await Promise.all([loadData(), loadDirectory()]);
    } catch (error) {
      setReviewFeedback(
        createFeedback(error instanceof ApiError ? error.message : "更新用户失败"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUserId) {
      setReviewFeedback(createFeedback("请先选择一个用户。"));
      return;
    }

    setSubmitting(true);
    setReviewFeedback(null);
    setBatchResults([]);

    try {
      const result = await sendJson<
        ResetUserPasswordResult,
        ResetUserPasswordPayload
      >(`/users/${selectedUserId}/reset-password`, "POST", {});

      setReviewFeedback(
        createFeedback(
          `已重置 ${result.user.realName} 的密码，新的临时密码为 ${result.temporaryPassword}。该账号下次登录时会被强制修改密码。`,
        ),
      );
      await Promise.all([loadData(), loadDirectory()]);
    } catch (error) {
      setReviewFeedback(
        createFeedback(error instanceof ApiError ? error.message : "重置密码失败"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleArchiveUser(user: UserSummary) {
    if (currentUser?.id === user.id) {
      setReviewFeedback(createFeedback("不能归档当前登录账号。"));
      return;
    }

    setPendingArchiveUser(user);
    setArchiveDialogError(null);
    setReviewFeedback(null);
  }

  async function handleConfirmArchiveUser() {
    if (!pendingArchiveUser) {
      return;
    }

    setSubmitting(true);
    setReviewFeedback(null);
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
        setReviewFeedback(
          createFeedback(
            `用户 ${archivedUser.realName} 已归档并禁用，内容保留至 ${expiresAt}，可前往“归档用户”页面继续管理。`,
          ),
        );
      } else {
        setReviewFeedback(
          createFeedback(
            `用户 ${archivedUser.realName} 已归档并禁用，系统将在 60 天后自动清理，可前往“归档用户”页面继续管理。`,
          ),
        );
      }
      setPendingArchiveUser(null);
      await Promise.all([loadData({ resetSelection: true }), loadDirectory()]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "归档用户失败";
      setArchiveDialogError(message);
      setReviewFeedback(createFeedback(message));
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
  const directoryGroupOptions = useMemo(
    () => buildGroupSelectorOptions(groups),
    [groups],
  );
  const reviewUserOptions = useMemo(() => buildUserSelectorOptions(users), [users]);
  const directoryUsers = directoryData?.items ?? [];
  const activeDirectoryGroup = groups.find((group) => group.id === directoryGroupId) ?? null;
  const directoryDescription = activeDirectoryGroup
    ? `已筛选群组 ${activeDirectoryGroup.name}`
    : "全部群组";

  function handleDirectorySearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = directorySearchInput.trim();
    setDirectoryPage(1);
    setDirectoryQuery(nextQuery);
    void loadDirectory({
      q: nextQuery,
      groupId: directoryGroupId,
      page: 1,
      pageSize: directoryPageSize,
    });
  }

  function handleDirectoryReset() {
    setDirectorySearchInput("");
    setDirectoryQuery("");
    setDirectoryGroupId("");
    setDirectoryPage(1);
    setDirectoryPageSize(25);
    void loadDirectory({
      q: "",
      groupId: "",
      page: 1,
      pageSize: 25,
    });
  }

  function handleDirectoryGroupSelectionChange(nextSelectedIds: string[]) {
    const nextGroupId = nextSelectedIds[0] ?? "";
    setDirectoryGroupId(nextGroupId);
    setDirectoryPage(1);
    void loadDirectory({
      q: directoryQuery,
      groupId: nextGroupId,
      page: 1,
      pageSize: directoryPageSize,
    });
  }

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
                录入成员姓名、姓名拼音和初始密码。一个成员可同时预绑定多个不同类别群组，但年级组只能选择一个。
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
                  <PasswordInput
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
                    visibilityLabel="初始密码"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-2 text-zinc-300">外部提醒邮箱</div>
                  <input
                    type="email"
                    required
                    value={registerForm.notificationEmail ?? ""}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        notificationEmail: event.target.value,
                      }))
                    }
                    className="app-input"
                    placeholder="例如：1793026645@qq.com"
                  />
                </label>
                <div className="app-surface-soft px-4 py-3 text-sm">
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
                    description="搜索并选择要预绑定的群组；年级组仅能保留一个。"
                    items={registerGroupOptions}
                    selectedIds={registerForm.groupIds ?? []}
                    onSelectionChange={(nextSelectedIds) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        groupIds: keepSingleGradeGroup(
                          nextSelectedIds,
                          registerSelectableGroups,
                        ),
                      }))
                    }
                    searchPlaceholder="搜索群组名称、编码或类型"
                    selectedTitle="已选预绑定群组"
                    selectedEmptyLabel="暂未预绑定任何群组"
                    tone="sky"
                    variant="floating"
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
              <div className="app-action-stack">
                <Button
                  type="submit"
                  variant="success"
                  disabled={
                    submitting ||
                    registerPrefixCheck.status === "checking" ||
                    registerPrefixCheck.status === "unavailable"
                  }
                >
                  提交注册
                </Button>
              </div>
              {registerFeedback ? (
                <div className="mt-4">
                  <ResourceState
                    title="注册反馈"
                    description={registerFeedback.message}
                    tone={registerFeedback.tone}
                  />
                </div>
              ) : null}
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
                  description="按姓名、邮箱或群组查找用户。"
                  items={reviewUserOptions}
                  selectedIds={selectedUserId ? [selectedUserId] : []}
                  onSelectionChange={(nextSelectedIds) =>
                    applyUserSelection(
                      users.find((user) => user.id === (nextSelectedIds[0] ?? "")) ?? null,
                    )
                  }
                  selectionMode="single"
                  searchPlaceholder="搜索姓名、邮箱、账号、外部邮箱或状态"
                  selectedTitle="当前审核对象"
                  selectedEmptyLabel="暂未选择用户"
                  tone="sky"
                  variant="floating"
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
                <label className="block text-sm">
                  <div className="mb-2 text-zinc-300">外部提醒邮箱</div>
                  <input
                    type="email"
                    value={reviewNotificationEmail}
                    onChange={(event) => setReviewNotificationEmail(event.target.value)}
                    className="app-input"
                    placeholder="用于接收站内邮件提醒"
                  />
                </label>
                <div>
                  <div className="mb-2 text-sm text-zinc-300">角色分配</div>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <ChipButton
                        key={role.id}
                        type="button"
                        onClick={() =>
                          toggleValue(role.id, selectedRoleIds, setSelectedRoleIds)
                        }
                        active={selectedRoleIds.includes(role.id)}
                        tone="success"
                      >
                        {role.name}
                      </ChipButton>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm text-zinc-300">群组分配</div>
                  <EntitySelector
                    title="群组分配"
                    description="支持按群组名称、编码搜索，并按方向组、年级组、功能组快速筛选；年级组仅能保留一个。"
                    items={reviewGroupOptions}
                    selectedIds={selectedGroupIds}
                    onSelectionChange={(nextSelectedIds) =>
                      setSelectedGroupIds(keepSingleGradeGroup(nextSelectedIds, groups))
                    }
                    searchPlaceholder="搜索群组名称、编码或类型"
                    selectedTitle="已分配群组"
                    selectedEmptyLabel="暂未分配任何群组"
                    tone="sky"
                    variant="floating"
                  />
                </div>
              </div>
              <div className="app-action-stack">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting || !selectedUserId}
                >
                  保存审核结果
                </Button>
                <Button
                  type="button"
                  onClick={handleResetPassword}
                  variant="warning"
                  disabled={submitting || !selectedUserId}
                >
                  重置密码并强制改密
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (selectedUser) {
                      handleArchiveUser(selectedUser);
                    }
                  }}
                  variant="danger"
                  disabled={
                    submitting ||
                    !selectedUser ||
                    selectedUser.id === currentUser?.id
                  }
                  title={
                    selectedUser?.id === currentUser?.id
                      ? "不能归档当前登录账号"
                      : selectedUser
                        ? `归档用户 ${selectedUser.realName}`
                        : "请先选择一个用户"
                  }
                >
                  归档用户
                </Button>
              </div>
              {reviewFeedback ? (
                <div className="mt-4">
                  <ResourceState
                    title="审核反馈"
                    description={reviewFeedback.message}
                    tone={reviewFeedback.tone}
                  />
                </div>
              ) : null}
            </form>
          </section>

          <form
            onSubmit={handleBatchGenerateSubmit}
            className="app-panel-muted p-6"
          >
            <h2 className="text-xl font-semibold">批量生成账号</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-300">
              每行输入一位成员，格式为“姓名,外部提醒邮箱”。必须设置统一初始密码并至少绑定一个群组；系统会自动生成拼音账号、实验室邮箱。若绑定年级组，只能选择一个。
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
                  className="app-textarea min-h-44 font-mono"
                  placeholder={"张三,zhangsan@example.com\n李四,lisi@example.com"}
                />
              </label>
              <div>
                <label className="block text-sm">
                  <div className="mb-2 text-zinc-300">统一初始密码</div>
                  <PasswordInput
                    required
                    aria-describedby="batch-password-hint"
                    minLength={8}
                    value={batchForm.password}
                    onChange={(event) =>
                      setBatchForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    className="app-input"
                    placeholder="至少 8 位，作为本批账号的临时密码"
                    visibilityLabel="统一初始密码"
                  />
                  <div
                    id="batch-password-hint"
                    className="mt-2 text-xs leading-6 text-zinc-400"
                  >
                    成员首次使用该初始密码登录后，必须先修改密码；修改完成后需使用新密码重新登录。
                  </div>
                </label>
                <div className="mb-2 mt-4 text-sm text-zinc-300">绑定群组</div>
                <EntitySelector
                  title="绑定群组"
                  description="至少选择一个批量绑定的群组；年级组仅能保留一个。"
                  items={reviewGroupOptions}
                  selectedIds={batchForm.groupIds}
                  onSelectionChange={(nextSelectedIds) =>
                    setBatchForm((prev) => ({
                      ...prev,
                      groupIds: keepSingleGradeGroup(nextSelectedIds, groups),
                    }))
                  }
                  searchPlaceholder="搜索群组名称、编码或类型"
                  selectedTitle="批量绑定群组"
                  selectedEmptyLabel="至少绑定一个群组"
                  tone="emerald"
                  variant="floating"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 app-button-primary-emerald"
                >
                  批量生成账号
                </button>
              </div>
            </div>
            {batchFeedback ? (
              <div className="mt-4">
                <ResourceState
                  title="批量生成反馈"
                  description={batchFeedback.message}
                  tone={batchFeedback.tone}
                />
              </div>
            ) : null}
          </form>

          {batchResults.length > 0 ? (
            <div className="app-table-shell">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-5 py-4 font-medium">姓名</th>
                    <th className="px-5 py-4 font-medium">账号</th>
                    <th className="px-5 py-4 font-medium">邮箱</th>
                    <th className="px-5 py-4 font-medium">外部提醒邮箱</th>
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
                      <td className="px-5 py-4 text-zinc-300">
                        {result.user.notificationEmail || "未填写"}
                      </td>
                      <td className="px-5 py-4 font-mono text-emerald-300">
                        {result.temporaryPassword}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {batchFailedResults.length > 0 ? (
            <div className="app-table-shell">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-5 py-4 font-medium">姓名</th>
                    <th className="px-5 py-4 font-medium">外部提醒邮箱</th>
                    <th className="px-5 py-4 font-medium">失败原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {batchFailedResults.map((result, index) => (
                    <tr key={`${result.realName}-${result.notificationEmail ?? index}`}>
                      <td className="px-5 py-4">{result.realName}</td>
                      <td className="px-5 py-4 text-zinc-300">
                        {result.notificationEmail || "未填写"}
                      </td>
                      <td className="px-5 py-4 text-rose-300">{result.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <section className="space-y-4">
            <div className="app-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">用户列表</h2>
                  <p className="mt-1 text-sm text-zinc-300">查找并选择要管理的用户。</p>
                </div>
                <div className="app-eyebrow app-eyebrow-neutral">
                  共 {directoryData?.total ?? 0} 位用户
                </div>
              </div>

              <form
                onSubmit={handleDirectorySearchSubmit}
                className="app-toolbar mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_280px_140px_auto]"
              >
                <label className="app-toolbar-field">
                  <div className="app-toolbar-label">搜索</div>
                  <input
                    value={directorySearchInput}
                    onChange={(event) => setDirectorySearchInput(event.target.value)}
                    className="app-input"
                    placeholder="搜索姓名、邮箱、账号、学号、角色或群组"
                  />
                </label>
                <div className="app-toolbar-field">
                  <div className="app-toolbar-label">群组</div>
                  <EntitySelector
                    title="群组筛选"
                    description="搜索并选择群组。"
                    items={directoryGroupOptions}
                    selectedIds={directoryGroupId ? [directoryGroupId] : []}
                    onSelectionChange={handleDirectoryGroupSelectionChange}
                    selectionMode="single"
                    searchPlaceholder="搜索群组名称、编码或类型"
                    selectedTitle="当前筛选"
                    selectedEmptyLabel="全部群组"
                    tone="sky"
                    variant="floating"
                    floatingLayout="toolbar"
                    floatingActionLabel="选择"
                    floatingSummaryMaxItems={1}
                  />
                </div>
                <label className="app-toolbar-field">
                  <div className="app-toolbar-label">每页显示</div>
                  <select
                    value={directoryPageSize}
                    onChange={(event) => {
                      const nextPageSize = Number(event.target.value);
                      setDirectoryPageSize(nextPageSize);
                      setDirectoryPage(1);
                      void loadDirectory({
                        q: directoryQuery,
                        groupId: directoryGroupId,
                        page: 1,
                        pageSize: nextPageSize,
                      });
                    }}
                    className="app-select"
                  >
                    {userDirectoryPageSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size} 条
                      </option>
                    ))}
                  </select>
                </label>
                <div className="app-toolbar-field">
                  <div className="app-toolbar-label opacity-0 select-none" aria-hidden="true">
                    操作
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="app-button-primary app-button-md min-w-[88px]"
                    >
                      应用筛选
                    </button>
                    <button
                      type="button"
                      onClick={handleDirectoryReset}
                      className="app-button-secondary app-button-md min-w-[72px]"
                    >
                      重置
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {!directoryData && directoryLoading ? (
              <ResourceState
                title="正在加载用户目录"
                description="正在根据当前搜索条件刷新成员列表。"
              />
            ) : directoryError && !directoryData ? (
              <ResourceState title="用户目录加载失败" description={directoryError} tone="error" />
            ) : (
              <>
                <div className="app-table-shell relative">
                  {directoryLoading && directoryData ? (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden">
                      <div className="h-full w-1/3 animate-[directory-loading_1.1s_ease-in-out_infinite] rounded-full bg-sky-400/70" />
                    </div>
                  ) : null}
                  <div className="border-b border-white/10 px-5 py-3 text-xs text-zinc-400">
                    当前筛选：{directoryDescription}，本页 {directoryUsers.length} 人
                    {directoryLoading && directoryData ? " · 正在刷新" : ""}
                  </div>
                  <div className="hidden grid-cols-[minmax(180px,1.1fr)_160px_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(180px,0.9fr)_minmax(220px,1fr)] gap-4 border-b border-white/10 px-5 py-3 text-[11px] font-medium tracking-[0.08em] text-zinc-400 xl:grid">
                    <div>用户</div>
                    <div>账号状态</div>
                    <div>实验室邮箱</div>
                    <div>外部提醒邮箱</div>
                    <div>角色</div>
                    <div>群组</div>
                  </div>
                  <div
                    className={`divide-y divide-white/10 transition-opacity duration-150 ${
                      directoryLoading && directoryData ? "opacity-75" : "opacity-100"
                    }`}
                  >
                    {directoryUsers.length > 0 ? (
                      directoryUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => applyUserSelection(user)}
                          className={`w-full px-5 py-3.5 text-left transition-colors ${
                            selectedUserId === user.id
                              ? "bg-surface-soft"
                              : "hover:bg-surface-soft"
                          }`}
                        >
                          <div className="grid gap-3 xl:grid-cols-[minmax(180px,1.1fr)_160px_minmax(220px,1.1fr)_minmax(220px,1.1fr)_minmax(180px,0.9fr)_minmax(220px,1fr)] xl:items-center xl:gap-4">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-100">
                                {user.realName}
                              </div>
                              <div className="mt-1 truncate text-xs text-zinc-400">
                                @{getFieldValue(user.username, "未生成账号")}
                                {user.studentId ? ` · 学号 ${user.studentId}` : ""}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap gap-2">
                                <span className={getStatusToneClass(user)}>
                                  {getUserStatusLabel(user)}
                                </span>
                                {getMailboxStatusLabel(user) && getMailboxToneClass(user) ? (
                                  <span className={getMailboxToneClass(user) ?? undefined}>
                                    {getMailboxStatusLabel(user)}
                                  </span>
                                ) : null}
                              </div>
                              {getMailboxStatusDescription(user) ? (
                                <div className="mt-1 truncate text-xs text-zinc-400">
                                  {getMailboxStatusDescription(user)}
                                </div>
                              ) : null}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-sm text-zinc-200">{user.email}</div>
                              <div className="mt-1 truncate text-xs text-zinc-400">
                                实验室邮箱
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-sm text-zinc-200">
                                {getFieldValue(user.notificationEmail)}
                              </div>
                              <div className="mt-1 truncate text-xs text-zinc-400">
                                外部提醒邮箱
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="text-sm leading-6 text-zinc-200 break-words">
                                {user.roles.length > 0
                                  ? user.roles.map(({ role }) => role.name).join("、")
                                  : "未分配角色"}
                              </div>
                              <div className="mt-1 text-xs text-zinc-400">
                                {user.roles.length} 项角色
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-sm text-zinc-200">
                                {user.memberships.length > 0
                                  ? summarizeNames(
                                      user.memberships.map(({ group }) => group.name),
                                      2,
                                    )
                                  : "未加入群组"}
                              </div>
                              <div className="mt-1 truncate text-xs text-zinc-400">
                                {user.memberships.length} 个群组
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-5 py-12 text-center text-sm text-zinc-400">
                        没有匹配的成员，试试更换关键词或切换群组筛选。
                      </div>
                    )}
                  </div>
                </div>

                <div className="app-panel-muted flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-zinc-300">
                    第 {directoryData?.page ?? 1} 页，共 {directoryData?.totalPages ?? 1} 页
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const nextPage = Math.max(1, directoryPage - 1);
                        setDirectoryPage(nextPage);
                        void loadDirectory({
                          q: directoryQuery,
                          groupId: directoryGroupId,
                          page: nextPage,
                          pageSize: directoryPageSize,
                        });
                      }}
                      disabled={!directoryData?.hasPreviousPage}
                      className="app-button-secondary"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextPage = directoryData?.totalPages
                          ? Math.min(directoryData.totalPages, directoryPage + 1)
                          : directoryPage + 1;
                        setDirectoryPage(nextPage);
                        void loadDirectory({
                          q: directoryQuery,
                          groupId: directoryGroupId,
                          page: nextPage,
                          pageSize: directoryPageSize,
                        });
                      }}
                      disabled={!directoryData?.hasNextPage}
                      className="app-button-secondary"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}
