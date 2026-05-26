"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type WorkspaceNavItem = {
  href: string;
  label: string;
  active: boolean;
};

const accentClassMap = {
  sky: {
    badge: "app-eyebrow app-eyebrow-sky",
    brand: "text-sky-300",
    active: "bg-sky-400/14 text-sky-200 ring-1 ring-sky-400/20",
    action: "app-button-primary",
  },
  emerald: {
    badge: "app-eyebrow app-eyebrow-emerald",
    brand: "text-emerald-300",
    active: "bg-emerald-400/14 text-emerald-200 ring-1 ring-emerald-400/20",
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
  profileName,
  profileEmail,
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
  asideTitle: string;
  asideDescription: string;
  asideAction?: ReactNode;
  profileName: string;
  profileEmail?: string | null;
  profileBadge?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const accentClass = accentClassMap[accent];

  return (
    <div className="app-shell">
      <div className="app-container py-6">
        <div className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="app-panel p-5">
              <Link href="/" className="block">
                <div className={accentClass.badge}>{brandLabel}</div>
                <div className="mt-5 text-xl font-semibold text-slate-50">
                  {brandTitle}
                </div>
              </Link>

              <nav className="mt-6 space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition-colors duration-200 ${
                      item.active
                        ? accentClass.active
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.active ? (
                      <span className={`text-xs ${accentClass.brand}`}>当前</span>
                    ) : null}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="app-panel-muted p-5">
              <div className="text-sm font-medium text-slate-100">{asideTitle}</div>
              <p className="mt-3 text-sm leading-7 text-slate-300 text-pretty">
                {asideDescription}
              </p>
              {asideAction ? <div className="mt-5">{asideAction}</div> : null}
            </div>
          </aside>

          <main className="space-y-6">
            <header className="app-panel p-6 lg:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className={accentClass.badge}>Workspace</div>
                  <h1 className="mt-5 text-3xl font-semibold text-balance text-slate-50 md:text-4xl">
                    {title}
                  </h1>
                  <p className="mt-3 max-w-[65ch] text-sm leading-7 text-slate-300 text-pretty">
                    {description}
                  </p>
                </div>

                <div className="min-w-[220px] space-y-4">
                  <div className="app-panel-muted p-4">
                    {profileBadge ? <div className="mb-3">{profileBadge}</div> : null}
                    <div className="text-sm font-medium text-slate-100">
                      {profileName}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {profileEmail ?? "未提供邮箱"}
                    </div>
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
