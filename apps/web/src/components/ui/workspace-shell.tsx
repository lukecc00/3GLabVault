"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WorkspaceNavItem = {
  href: string;
  label: string;
  active: boolean;
  badgeText?: string;
};

const accentClassMap = {
  sky: {
    badge: "app-eyebrow app-eyebrow-sky",
    brand: "text-[var(--accent-strong)]",
    active: "app-nav-active-sky",
    action: "app-button-primary",
  },
  emerald: {
    badge: "app-eyebrow app-eyebrow-emerald",
    brand: "text-[var(--success-strong)]",
    active: "app-nav-active-emerald",
    action: "app-button-primary-emerald",
  },
} as const;

export function WorkspaceShell({
  accent,
  brandLabel,
  brandTitle,
  title,
  description,
  navItems,
  asideTitle,
  asideDescription,
  asideAction,
  asideContent,
  profileName,
  profileEmail,
  profileMeta,
  profileBadge,
  headerAction,
  children,
}: {
  accent: keyof typeof accentClassMap;
  brandLabel: string;
  brandTitle: string;
  title: string;
  description: string;
  navItems: WorkspaceNavItem[];
  asideTitle?: string;
  asideDescription?: string;
  asideAction?: ReactNode;
  asideContent?: ReactNode;
  profileName: string;
  profileEmail?: string | null;
  profileMeta?: ReactNode;
  profileBadge?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const accentClass = accentClassMap[accent];

  return (
    <div className="app-shell">
      <div className="app-container py-6">
        <div className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <div className="app-panel p-5">
              <Link href="/" className="block">
                <div className={accentClass.badge}>{brandLabel}</div>
                <div className="mt-5 text-xl font-semibold text-foreground-strong">
                  {brandTitle}
                </div>
              </Link>

              <nav className="mt-6 flex gap-2 overflow-x-auto pb-1 xl:block xl:space-y-2 xl:overflow-visible xl:pb-0">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex shrink-0 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm transition-colors duration-200 xl:w-full",
                      item.active
                        ? accentClass.active
                        : "text-foreground-muted hover:bg-surface-soft hover:text-foreground-strong",
                    )}
                  >
                    <span>{item.label}</span>
                    {item.badgeText ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">
                        {item.badgeText}
                      </span>
                    ) : item.active ? (
                      <span className={`text-xs ${accentClass.brand}`}>当前</span>
                    ) : null}
                  </Link>
                ))}
              </nav>
            </div>

            {asideContent ? (
              asideContent
            ) : asideTitle && asideDescription ? (
              <div className="app-panel-muted p-5">
                <div className="text-sm font-medium text-foreground-strong">
                  {asideTitle}
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground-muted text-pretty">
                  {asideDescription}
                </p>
                {asideAction ? <div className="mt-5">{asideAction}</div> : null}
              </div>
            ) : null}
          </aside>

          <main className="space-y-6">
            <header className="app-panel p-6 lg:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className={accentClass.badge}>Workspace</div>
                  <h1 className="mt-5 text-3xl font-semibold text-balance text-foreground-strong md:text-4xl">
                    {title}
                  </h1>
                  <p className="mt-3 max-w-[65ch] text-sm leading-7 text-foreground-muted text-pretty">
                    {description}
                  </p>
                </div>

                <div className="min-w-[220px] space-y-4">
                  <div className="app-panel-muted p-4">
                    {profileBadge ? <div className="mb-3">{profileBadge}</div> : null}
                    <div className="text-sm font-medium text-foreground-strong">
                      {profileName}
                    </div>
                    <div className="mt-1 text-xs text-foreground-soft">
                      {profileEmail ?? "未提供邮箱"}
                    </div>
                    {profileMeta ? <div className="mt-3">{profileMeta}</div> : null}
                  </div>
                  {headerAction ? <div className="flex flex-wrap gap-3">{headerAction}</div> : null}
                </div>
              </div>
            </header>

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
