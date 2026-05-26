"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function MailLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { summary, loadingSummary, summaryError, refreshSummary } = useMailContext();

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  return (
    <PortalShell
      title="内部邮件"
      description="按企业邮箱的工作流在系统内完成收件、发件、草稿、归档和回收站管理，所有内容仅在实验室内部流转。"
    >
      <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="app-panel p-5">
            <div className="app-eyebrow app-eyebrow-sky">Mailboxes</div>
            <Link href="/portal/mail/compose" className="app-button-primary mt-5 w-full">
              写邮件
            </Link>
            <nav className="mt-5 space-y-2">
              {folderItems.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = summary?.[item.summaryKey] ?? 0;
                const hintCount = item.hintKey ? summary?.[item.hintKey] ?? 0 : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors duration-200",
                      active
                        ? "bg-sky-400/14 text-sky-200 ring-1 ring-sky-400/20"
                        : "text-slate-300 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate">{item.label}</div>
                      {item.hintKey && hintCount > 0 ? (
                        <div className="mt-1 text-xs text-slate-400">
                          未读 {hintCount}
                        </div>
                      ) : null}
                    </div>
                    <span className="tabular-nums text-xs text-slate-400">{count}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="app-panel-muted p-5">
            <div className="text-sm font-medium text-slate-100">当前范围</div>
            <p className="mt-3 text-sm leading-7 text-slate-300 text-pretty">
              第一版按你确认的范围实现：收件箱、已发送、草稿箱、归档、回收站、搜索筛选、星标、已读未读、回复与转发。
            </p>
            {summaryError ? (
              <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {summaryError}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshSummary()}
              disabled={loadingSummary}
              className="app-button-ghost mt-5"
            >
              {loadingSummary ? "刷新统计中..." : "刷新统计"}
            </button>
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </section>
    </PortalShell>
  );
}
