"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { WorkspaceShell } from "@/components/ui/workspace-shell";
import { hasGlobalAdminRole } from "@/lib/workspace";

const navigationItems = [
  { href: "/admin", label: "概览" },
  { href: "/admin/users", label: "用户" },
  { href: "/admin/users/archived", label: "归档用户" },
  { href: "/admin/roles", label: "角色" },
  { href: "/admin/groups", label: "群组" },
  { href: "/admin/audit-logs", label: "审计" },
];

const superAdminNavigationItems = [
  { href: "/admin/knowledge/archived", label: "已删除知识库" },
];

export function AdminShell({
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
  const navigation =
    user && !hasGlobalAdminRole(user.roleCodes)
      ? navigationItems.filter((item) =>
          ["/admin/users", "/admin/users/archived"].includes(item.href),
        )
      : user?.roleCodes.includes("SUPER_ADMIN")
        ? [...navigationItems, ...superAdminNavigationItems]
        : navigationItems;

  return (
    <WorkspaceShell
      accent="emerald"
      brandLabel="3GLabVault"
      brandTitle="实验室后台工作区"
      title={title}
      description={description}
      navItems={navigation.map((item) => ({
        ...item,
        active: pathname === item.href,
      }))}
      asideTitle="管理职责"
      asideDescription="统一处理组织概览、成员审核、角色编排和群组维护，让高权限能力在同一工作区中保持清晰边界。"
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
