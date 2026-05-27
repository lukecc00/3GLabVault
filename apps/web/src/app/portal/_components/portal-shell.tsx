"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchApi } from "@/lib/api";
import type { GroupType, KnowledgePageAccessRequestDashboard } from "@/lib/contracts";
import { WorkspaceShell } from "@/components/ui/workspace-shell";

const navigationItems = [
  { href: "/portal", label: "首页" },
  { href: "/portal/mail", label: "内部邮件" },
  { href: "/portal/knowledge", label: "知识库" },
  { href: "/portal/knowledge/approvals", label: "权限审批" },
];

function summarizeMembershipNames(
  memberships: NonNullable<ReturnType<typeof useAuth>["user"]>["memberships"] | undefined,
  groupType: GroupType,
) {
  const names = Array.from(
    new Set(
      (memberships ?? [])
        .filter((membership) => membership.group.type === groupType)
        .map((membership) => membership.group.name)
        .filter(Boolean),
    ),
  );

  return names.length > 0 ? names.join("、") : "未设置";
}

function isNavItemActive(itemHref: string, pathname: string) {
  const selfMatched =
    itemHref === "/portal"
      ? pathname === itemHref
      : pathname === itemHref || pathname.startsWith(`${itemHref}/`);

  if (!selfMatched) {
    return false;
  }

  return !navigationItems.some((otherItem) => {
    if (otherItem.href === itemHref) {
      return false;
    }

    const isMoreSpecific = otherItem.href.startsWith(`${itemHref}/`);
    if (!isMoreSpecific) {
      return false;
    }

    return pathname === otherItem.href || pathname.startsWith(`${otherItem.href}/`);
  });
}

export function PortalShell({
  title,
  description,
  asideContent,
  children,
}: {
  title: string;
  description: string;
  asideContent?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user, logout, activeWorkspace, workspaceOptions } = useAuth();
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const gradeLabel = useMemo(
    () => summarizeMembershipNames(user?.memberships, "GRADE"),
    [user?.memberships],
  );
  const directionLabel = useMemo(
    () => summarizeMembershipNames(user?.memberships, "DIRECTION"),
    [user?.memberships],
  );

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function loadPendingApprovalCount() {
      if (!user) {
        if (active) {
          setPendingApprovalCount(0);
        }
        return;
      }

      try {
        const dashboard = await fetchApi<KnowledgePageAccessRequestDashboard>(
          "/knowledge/page-access-requests",
        );

        if (active) {
          setPendingApprovalCount(dashboard.summary.pendingReviews);
        }
      } catch {
        if (active) {
          setPendingApprovalCount(0);
        }
      }
    }

    void loadPendingApprovalCount();
    timer = setInterval(() => {
      void loadPendingApprovalCount();
    }, 30_000);

    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [pathname, user]);

  return (
    <WorkspaceShell
      accent="sky"
      brandLabel="3GLabVault"
      brandTitle="实验室工作台"
      title={title}
      description={description}
      navItems={navigationItems.map((item) => ({
        ...item,
        badgeText:
          item.href === "/portal/knowledge/approvals" && pendingApprovalCount > 0
            ? String(pendingApprovalCount)
            : undefined,
        active: isNavItemActive(item.href, pathname),
      }))}
      asideTitle="当前能力"
      asideDescription="浏览知识空间、处理内部邮件、保存草稿并完成日常协作；高权限配置能力由系统按账号权限自动分流，不在这里额外暴露。"
      asideContent={asideContent}
      profileName={user?.realName ?? "未登录"}
      profileEmail={user?.email}
      profileMeta={
        user ? (
          <div className="space-y-2 text-xs text-foreground-soft">
            <div className="text-pretty">
              <span className="text-foreground-muted">年级：</span>
              {gradeLabel}
            </div>
            <div className="text-pretty">
              <span className="text-foreground-muted">方向：</span>
              {directionLabel}
            </div>
          </div>
        ) : null
      }
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
