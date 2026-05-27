"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthShell } from "@/components/ui/auth-shell";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api";
import { getPostLoginDestination } from "@/lib/workspace";

function getNextPath() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("next");
}

function getLoginNotice() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get("passwordChanged") === "1") {
    return "密码已更新，请使用新密码重新登录。";
  }

  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, status, user } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage(getLoginNotice());
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      return;
    }

    router.replace(getPostLoginDestination(user, getNextPath()));
  }, [router, status, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const user = await login({
        identifier: identifier.trim().toLowerCase(),
        password,
      });
      router.replace(getPostLoginDestination(user, getNextPath()));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow={<div className="app-eyebrow app-eyebrow-sky">账号登录</div>}
      title="登录 3GLabVault"
      description="当前线上版使用统一账号密码登录，支持输入用户名或内部邮件地址。若账号同时具备多个身份，验证成功后可主动选择进入的工作区。"
      asideTitle="统一登录入口"
      asideDescription="不再区分多个登录入口。所有账号先完成同一套认证，再由系统根据可用身份进入对应工作区；多身份账号可主动选择本次进入方式。"
      highlights={[
        { label: "身份识别", value: "支持用户名与内部邮件地址两种入口。" },
        { label: "身份选择", value: "多身份账号在验证成功后可主动选择进入哪个工作区。" },
        { label: "安全检查", value: "强制改密账号会优先完成安全设置。" },
      ]}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <div className="mb-2 text-slate-300">账号或内部邮件地址</div>
          <input
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className="app-input"
            placeholder="例如：admin 或 zhangsan@3glab"
          />
        </label>

        <label className="block text-sm">
          <div className="mb-2 text-slate-300">密码</div>
          <PasswordInput
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="app-input"
            placeholder="输入账号密码"
            visibilityLabel="登录密码"
          />
        </label>

        {message ? (
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              message.includes("重新登录")
                ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : "border border-red-400/20 bg-red-400/10 text-red-100"
            }`}
          >
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || status === "loading"}
          className="app-button-primary w-full"
        >
          {submitting ? "登录中..." : "进入系统"}
        </button>
      </form>

      <div className="app-panel-muted mt-6 p-4 text-sm leading-7 text-slate-300">
        <div className="font-medium text-slate-100">管理员初始化说明</div>
        <div className="mt-2">
          当前默认种子管理员账号为 `xiyou3g`。如需调整初始密码，可通过
          `ADMIN_INITIAL_PASSWORD` 环境变量覆盖。
        </div>
        <div className="mt-2">
          当前默认管理员不会被强制要求首次改密，登录后会按权限直接进入后台工作区。
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/register" className="app-button-primary-emerald">
          去注册
        </Link>
        <Link href="/" className="app-button-ghost">
          返回首页
        </Link>
      </div>
    </AuthShell>
  );
}
