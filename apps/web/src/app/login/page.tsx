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
  const [message, setMessage] = useState<string | null>(() => getLoginNotice());

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
          <div className="mb-2 text-foreground-muted">账号或内部邮件地址</div>
          <input
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className="app-input"
            placeholder="zhangsan 或 zhangsan@3glab"
          />
        </label>

        <label className="block text-sm">
          <div className="mb-2 text-foreground-muted">密码</div>
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
                ? "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success-strong)]"
                : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger-strong)]"
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

      <section
        className="mt-6 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-4 text-sm text-foreground-muted"
        aria-label="信息安全与保密提醒"
      >
        <div className="font-medium text-[var(--warning-strong)]">信息安全与保密提醒</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-pretty">
          <li>仅在本人使用且可信的设备上登录，不向任何人透露账号、密码或验证码。</li>
          <li>系统内的成员、知识库和内部邮件等内容均属于内部信息，严禁截图、复制或转发到外部平台。</li>
          <li>离开设备前请及时锁屏或退出登录；如发现异常登录、疑似泄密或账号风险，请立即联系管理员处理。</li>
        </ul>
      </section>

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
