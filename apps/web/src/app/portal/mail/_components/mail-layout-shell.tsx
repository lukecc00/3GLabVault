"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PortalShell } from "../../_components/portal-shell";
import { useMailContext } from "./mail-context";
import type { InternalMailSummary } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type FolderItem = {
  href: string;
  label: string;
  summaryKey: keyof InternalMailSummary;
  hintKey?: keyof InternalMailSummary;
};

const folderItems: FolderItem[] = [
  { href: "/portal/mail/inbox", label: "收件箱", summaryKey: "inbox" as const, hintKey: "unread" as const },
  { href: "/portal/mail/sent", label: "已发送", summaryKey: "sent" as const },
  { href: "/portal/mail/drafts", label: "草稿箱", summaryKey: "drafts" as const },
  { href: "/portal/mail/archive", label: "归档", summaryKey: "archive" as const },
  { href: "/portal/mail/trash", label: "回收站", summaryKey: "trash" as const },
] as const;

function MailSidebar({
  pathname,
  viewFolder,
  summary,
}: {
  pathname: string;
  viewFolder: string | null;
  summary: InternalMailSummary | null;
}) {
  return (
    <div className="app-panel p-5">
      <div className="app-eyebrow app-eyebrow-sky">邮箱</div>
      <Link href="/portal/mail/compose" className="app-button-primary mt-5 w-full">
        写邮件
      </Link>
      <nav className="mt-5 space-y-2">
        {folderItems.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (pathname === "/portal/mail/view" && item.href === `/portal/mail/${viewFolder}`);
          const count = summary?.[item.summaryKey] ?? 0;
          const hintCount = item.hintKey ? summary?.[item.hintKey] ?? 0 : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors duration-200",
                active
                  ? "app-nav-active-sky"
                  : "text-foreground-muted hover:bg-surface-soft hover:text-foreground-strong",
              )}
            >
              <div className="min-w-0">
                <div className="truncate">{item.label}</div>
                {item.hintKey && hintCount > 0 ? (
                  <div className="mt-1 text-xs text-foreground-soft">未读 {hintCount}</div>
                ) : null}
              </div>
              <span className="tabular-nums text-xs text-foreground-soft">{count}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function MailLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { summary, refreshSummary } = useMailContext();
  const viewFolder = searchParams.get("folder");

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  return (
    <PortalShell
      title="内部邮件"
      description="收件、发件、草稿、归档与回收站管理。"
      asideContent={
        <MailSidebar pathname={pathname} viewFolder={viewFolder} summary={summary} />
      }
    >
      <div className="min-w-0">{children}</div>
    </PortalShell>
  );
}
