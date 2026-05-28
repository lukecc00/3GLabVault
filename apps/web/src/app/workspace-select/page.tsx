"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthShell } from "@/components/ui/auth-shell";
import { cn } from "@/lib/utils";
import { getPostLoginDestination, resolveWorkspaceHref } from "@/lib/workspace";

export default function WorkspaceSelectPage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceSelectContent />
    </Suspense>
  );
}

function WorkspaceSelectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, user, workspaceOptions, activeWorkspace, selectWorkspace, logout } = useAuth();
  const [submittingWorkspaceId, setSubmittingWorkspaceId] = useState<string | null>(null);

  const nextPath = useMemo(() => searchParams.get("next"), [searchParams]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?next=/workspace-select");
      return;
    }

    if (status !== "authenticated" || !user) {
      return;
    }

    if (user.mustChangePassword) {
      router.replace("/change-password");
      return;
    }

    if (workspaceOptions.length <= 1) {
      router.replace(getPostLoginDestination(user, nextPath));
    }
  }, [nextPath, router, status, user, workspaceOptions.length]);

  if (status !== "authenticated" || !user) {
    return null;
  }

  return (
    <AuthShell
      eyebrow={<div className="app-eyebrow app-eyebrow-emerald">身份选择</div>}
      title="选择本次进入身份"
      description="当前账号同时具备多个身份。请选择本次希望进入的工作区，登录态不会丢失，后续也可以在工作区内随时切换。"
      asideTitle="一个账号，多种进入方式。"
      asideDescription="系统管理员进入后台治理工作区，实验室管理员和其他协作身份进入实验室工作台。你的权限仍以实际账号角色为准。"
      highlights={[
        { label: "身份独立", value: "每次登录可按当前任务选择进入哪个工作区。" },
        { label: "随时切换", value: "进入后仍可通过顶部入口重新切换身份。" },
        { label: "权限不变", value: "身份选择影响默认入口与界面上下文，不改变账号本身权限。" },
      ]}
    >
      <div className="space-y-4">
        {workspaceOptions.map((workspace) => {
          const isCurrent = activeWorkspace?.id === workspace.id;
          const isSubmitting = submittingWorkspaceId === workspace.id;

          return (
            <button
              key={workspace.id}
              type="button"
              onClick={() => {
                selectWorkspace(workspace.id);
                setSubmittingWorkspaceId(workspace.id);
                router.replace(resolveWorkspaceHref(workspace, nextPath));
              }}
              disabled={Boolean(submittingWorkspaceId)}
              className={cn(
                "w-full rounded-3xl border p-5 text-left transition-colors duration-200",
                isCurrent
                  ? "border-emerald-400/30 bg-emerald-400/10"
                  : "border-border-soft bg-surface hover:bg-surface-soft",
                "disabled:cursor-not-allowed disabled:opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="app-pill">{workspace.badge}</div>
                  <div className="mt-4 text-xl font-semibold text-foreground-strong text-balance">
                    {workspace.title}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-foreground-muted text-pretty">
                    {workspace.description}
                  </p>
                </div>
                <div className="text-sm text-foreground-soft">
                  {isSubmitting ? "进入中..." : isCurrent ? "当前默认" : "点击进入"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="app-button-ghost"
        >
          退出登录
        </button>
      </div>
    </AuthShell>
  );
}
