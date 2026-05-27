"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button, buttonClassName } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type {
  CreateUserPayload,
  GroupType,
  RegisterPrefixCheckPayload,
  RegisterPrefixCheckResult,
  RegisterOptions,
  UserSummary,
} from "@/lib/contracts";

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

const registerGroupTypeMap: Record<GroupType, string> = {
  DIRECTION: "方向组",
  GRADE: "年级组",
  FUNCTIONAL: "功能组",
  SYSTEM: "系统组",
};

function toggleRegisterGroupSelection(
  currentGroupIds: string[],
  groupId: string,
  groupType: GroupType,
  availableGroups: Array<{ id: string; type: GroupType }>,
) {
  if (currentGroupIds.includes(groupId)) {
    return currentGroupIds.filter((item) => item !== groupId);
  }

  if (groupType !== "GRADE") {
    return [...currentGroupIds, groupId];
  }

  const gradeGroupIds = new Set(
    availableGroups
      .filter((group) => group.type === "GRADE")
      .map((group) => group.id),
  );

  return [
    ...currentGroupIds.filter((item) => !gradeGroupIds.has(item)),
    groupId,
  ];
}

export default function RegisterPage() {
  const [options, setOptions] = useState<RegisterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createdUser, setCreatedUser] = useState<UserSummary | null>(null);
  const [prefixCheck, setPrefixCheck] = useState<PrefixCheckState>({
    status: "idle",
    message: null,
    prefix: "",
    email: null,
  });
  const [form, setForm] = useState<CreateUserPayload>({
    realName: "",
    namePinyin: "",
    password: "",
    notificationEmail: "",
    bio: "",
    groupIds: [],
  });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await fetchApi<RegisterOptions>("/users/register/options");

        if (!active) {
          return;
        }

        setOptions(data);
      } catch (error) {
        if (!active) {
          return;
        }

        setMessage(
          error instanceof ApiError ? error.message : "无法获取注册选项",
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
    const namePinyin = form.namePinyin.trim();
    const mailDomain = options?.mailDomain;

    if (!namePinyin) {
      const timer = window.setTimeout(() => {
        setPrefixCheck({
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
        setPrefixCheck({
          status: "unavailable",
          message: "姓名拼音需以字母开头，且只能包含字母和数字。",
          prefix: namePinyin,
          email: mailDomain ? `${namePinyin}@${mailDomain}` : "",
        });
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }

    const timer = window.setTimeout(() => {
      setPrefixCheck({
        status: "checking",
        message: "正在检查邮箱前缀是否可用...",
        prefix: namePinyin,
        email: mailDomain ? `${namePinyin}@${mailDomain}` : null,
      });

      void (async () => {
        try {
          const result = await sendJson<
            RegisterPrefixCheckResult,
            RegisterPrefixCheckPayload
          >("/users/register/prefix-check", "POST", {
            namePinyin,
          });

          setPrefixCheck({
            status: result.available ? "available" : "unavailable",
            message: result.message,
            prefix: result.prefix,
            email: result.email,
          });
        } catch (error) {
          setPrefixCheck({
            status: "unavailable",
            message:
              error instanceof ApiError
                ? error.message
                : "邮箱前缀校验失败，请稍后重试。",
            prefix: namePinyin,
            email: mailDomain ? `${namePinyin}@${mailDomain}` : "",
          });
        }
      })();
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [form.namePinyin, options]);

  function toggleGroup(groupId: string, groupType: GroupType) {
    setForm((prev) => ({
      ...prev,
      groupIds: toggleRegisterGroupSelection(
        prev.groupIds ?? [],
        groupId,
        groupType,
        options?.groups ?? [],
      ),
    }));
  }

  const registerGroupSections = options?.groups.reduce<
    Array<{
      type: GroupType;
      label: string;
      groups: RegisterOptions["groups"];
    }>
  >((sections, group) => {
    const existingSection = sections.find((section) => section.type === group.type);

    if (existingSection) {
      existingSection.groups.push(group);
      return sections;
    }

    sections.push({
      type: group.type,
      label: registerGroupTypeMap[group.type],
      groups: [group],
    });

    return sections;
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (prefixCheck.status === "checking") {
      setMessage("正在检查邮箱前缀，请稍候后再提交。");
      return;
    }

    if (prefixCheck.status === "unavailable") {
      setMessage(prefixCheck.message || "当前邮箱前缀不可用，请调整后再提交。");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setCreatedUser(null);

    try {
      const user = await sendJson<UserSummary, CreateUserPayload>(
        "/users/register",
        "POST",
        {
          realName: form.realName.trim(),
          namePinyin: form.namePinyin.trim(),
          password: form.password,
          notificationEmail: form.notificationEmail.trim(),
          bio: form.bio?.trim() || undefined,
          groupIds: form.groupIds,
        },
      );

      setCreatedUser(user);
      setForm({
        realName: "",
        namePinyin: "",
        password: "",
        notificationEmail: "",
        bio: "",
        groupIds: [],
      });
      setMessage("注册成功，系统已自动分配账号和邮箱，并已记录你的外部提醒邮箱，等待管理员审核后即可登录。");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "注册失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow={<div className="app-eyebrow app-eyebrow-emerald">用户注册</div>}
      title="创建实验室账号"
      description="注册完成后，系统会按姓名拼音自动生成账号与实验室邮箱。账号审核通过后即可进入知识门户。"
      descriptionClassName="max-w-none whitespace-nowrap"
      asideTitle="先完成注册，再进入协作。"
      asideDescription="注册时请填写真实姓名和姓名拼音，拼音会直接作为邮箱前缀。若前缀冲突，可自行增加字符后再提交。"
      layout="stacked"
      highlights={[
        { label: "邮箱前缀", value: "姓名拼音直接作为邮箱前缀，并支持提前查重。" },
        { label: "审核节奏", value: "提交后等待管理员审核与角色分配。" },
        {
          label: "群组预选",
          value: "可同时勾选多个不同类别群组，但年级组只能选择一个。",
        },
      ]}
    >
      {loading ? (
        <div className="app-panel-muted px-4 py-3 text-sm text-slate-300">
          正在加载注册选项...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <div className="mb-2 text-slate-300">真实姓名</div>
              <input
                required
                value={form.realName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, realName: event.target.value }))
                }
                className="app-input"
                placeholder="例如：张三"
              />
            </label>
            <label className="text-sm">
              <div className="mb-2 text-slate-300">姓名拼音</div>
              <input
                required
                value={form.namePinyin}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    namePinyin: normalizeNamePinyinInput(event.target.value),
                  }))
                }
                className="app-input"
                placeholder="例如：zhangsan"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <div className="mb-2 text-slate-300">登录密码</div>
              <PasswordInput
                required
                minLength={8}
                value={form.password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
                }
                className="app-input"
                placeholder="至少 8 位"
                visibilityLabel="登录密码"
              />
            </label>
            <label className="text-sm">
              <div className="mb-2 text-slate-300">外部提醒邮箱</div>
              <input
                type="email"
                required
                value={form.notificationEmail}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    notificationEmail: event.target.value,
                  }))
                }
                className="app-input"
                placeholder="例如：1793026645@qq.com"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm">
              <div className="text-slate-300">邮箱预览</div>
              <div className="mt-2 font-mono text-sky-200">
                {prefixCheck.email || (options ? `name@${options.mailDomain}` : "name@example.com")}
              </div>
              <div
                className={`mt-2 ${
                  prefixCheck.status === "available"
                    ? "text-emerald-300"
                    : prefixCheck.status === "unavailable"
                      ? "text-red-300"
                      : "text-slate-400"
                }`}
              >
                {prefixCheck.message || "请输入姓名拼音，系统将检查邮箱前缀是否可用。"}
              </div>
            </div>
            <div className="app-surface-soft px-4 py-3 text-sm text-slate-300">
              <div>提醒策略</div>
              <div className="mt-2 leading-7 text-slate-400">
                当你收到新的站内内部邮件时，系统会向该外部邮箱发送一封提醒邮件。
                提醒邮件不包含正文内容，且一分钟内最多发送一次。
              </div>
            </div>
          </div>

          <label className="block text-sm">
            <div className="mb-2 text-slate-300">希望绑定的群组</div>
            {registerGroupSections?.length ? (
              <div className="space-y-4">
                {registerGroupSections.map((section) => (
                  <div key={section.type}>
                    <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                      {section.label}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {section.groups.map((group) => (
                        <ChipButton
                          key={group.id}
                          type="button"
                          onClick={() => toggleGroup(group.id, group.type)}
                          active={form.groupIds?.includes(group.id)}
                        >
                          {group.name}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="text-xs leading-6 text-slate-400">
                  年级组只能选择一个；选择新的年级组时会自动替换之前的年级组。
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border-soft bg-surface px-4 py-3 text-sm text-slate-400">
                当前还没有可选群组，请先让管理员在后台新增方向组、年级组或功能组。
              </div>
            )}
          </label>

          <label className="block text-sm">
            <div className="mb-2 text-slate-300">个人简介</div>
            <textarea
              value={form.bio ?? ""}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, bio: event.target.value }))
              }
              className="app-textarea"
              placeholder="可选"
            />
          </label>

          {message ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                message.includes("失败") || message.includes("无效")
                  ? "border-red-400/20 bg-red-400/10 text-red-100"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
              }`}
            >
              {message}
            </div>
          ) : null}

          {createdUser ? (
            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">
              <div>系统账号：{createdUser.username}</div>
              <div className="mt-2">自动分配邮箱：{createdUser.email}</div>
              <div className="mt-2">邮箱域名：{options?.mailDomain}</div>
            </div>
          ) : null}

          <Button
            type="submit"
            variant="success"
            disabled={
              submitting ||
              prefixCheck.status === "checking" ||
              prefixCheck.status === "unavailable"
            }
          >
            {submitting ? "提交中..." : "提交注册"}
          </Button>
        </form>
      )}

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/login" className={buttonClassName({ variant: "secondary" })}>
          返回登录
        </Link>
        <Link href="/" className={buttonClassName({ variant: "ghost" })}>
          返回首页
        </Link>
      </div>
    </AuthShell>
  );
}
