"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { WorkspaceShell } from "@/components/ui/workspace-shell";

const navigationItems = [
  { href: "/portal", label: "首页" },
  { href: "/portal/mail", label: "内部邮件" },
  { href: "/portal/knowledge", label: "知识库" },
];

export function PortalShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout, activeWorkspace, workspaceOptions } = useAuth();

  return (
    <WorkspaceShell
      accent="sky"
      brandLabel="3GLabVault"
      brandTitle="实验室工作台"
      title={title}
      description={description}
      navItems={navigationItems.map((item) => ({
        ...item,
        active:
          item.href === "/portal"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`),
      }))}
      asideTitle="当前能力"
      asideDescription="浏览知识空间、处理内部邮件、保存草稿并完成日常协作；高权限配置能力由系统按账号权限自动分流，不在这里额外暴露。"
      profileName={user?.realName ?? "未登录"}
      profileEmail={user?.email}
      profileBadge={
        activeWorkspace ? <div className="app-pill">{activeWorkspace.title}</div> : null
      }
      headerAction={
        <>
          {workspaceOptions.length > 1 ? (
            <Link href="/workspace-select" className="app-button-secondary">
              切换身份
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void logout()}
            className="app-button-ghost"
          >
            退出登录
          </button>
        </>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
