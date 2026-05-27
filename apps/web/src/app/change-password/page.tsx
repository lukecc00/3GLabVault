"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthShell } from "@/components/ui/auth-shell";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api";
import { getPostLoginDestination } from "@/lib/workspace";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { status, user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [redirectingAfterReset, setRedirectingAfterReset] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        redirectingAfterReset ? "/login?passwordChanged=1" : "/login?next=/change-password",
      );
      return;
    }

    if (status === "authenticated" && user && !user.mustChangePassword) {
      router.replace(getPostLoginDestination(user, null));
    }
  }, [redirectingAfterReset, router, status, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage("新密码至少需要 8 位。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("两次输入的新密码不一致。");
      return;
    }

    setSubmitting(true);

    try {
      await changePassword({
        currentPassword,
        newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setRedirectingAfterReset(true);
      setMessage("密码已更新，正在退出当前会话，请使用新密码重新登录...");
      await logout();
      router.replace("/login?passwordChanged=1");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "修改密码失败");
      setRedirectingAfterReset(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow={<div className="app-eyebrow app-eyebrow-amber">首次登录安全设置</div>}
      title="请先修改密码"
      description="为了满足线上使用要求，管理员初始化账号和批量生成的临时账号首次登录时都必须先完成密码更新。更新完成后，需要使用新密码重新登录。"
      asideTitle="先完成安全收口，再进入工作区。"
      asideDescription="只有完成改密后，系统才允许你再次登录进入工作区；若你同时具备多个身份，重新登录后仍可主动选择本次进入方式。"
      highlights={[
        { label: "最低要求", value: "新密码至少 8 位，避免默认临时口令长期保留。" },
        { label: "一次完成", value: "改密成功后会继续进入身份选择或对应工作台。" },
        { label: "身份识别", value: "系统会沿用现有身份配置决定后续入口。" },
      ]}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <div className="mb-2 text-slate-300">当前密码</div>
          <PasswordInput
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="app-input"
            visibilityLabel="当前密码"
          />
        </label>
        <label className="block text-sm">
          <div className="mb-2 text-slate-300">新密码</div>
          <PasswordInput
            required
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="app-input"
            visibilityLabel="新密码"
          />
        </label>
        <label className="block text-sm">
          <div className="mb-2 text-slate-300">确认新密码</div>
          <PasswordInput
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="app-input"
            visibilityLabel="确认新密码"
          />
        </label>

        {message ? (
          <div className="app-panel-muted px-4 py-3 text-sm text-slate-200">
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || status !== "authenticated"}
          className="app-button-primary-amber w-full"
        >
          {submitting ? "保存中..." : "更新密码"}
        </button>
      </form>
    </AuthShell>
  );
}
