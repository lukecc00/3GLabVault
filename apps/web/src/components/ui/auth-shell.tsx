"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AuthHighlight = {
  label: string;
  value: string;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  descriptionClassName,
  asideTitle,
  asideDescription,
  highlights,
  layout = "split",
  children,
}: {
  eyebrow: ReactNode;
  title: string;
  description: string;
  descriptionClassName?: string;
  asideTitle: string;
  asideDescription: string;
  highlights: AuthHighlight[];
  layout?: "split" | "stacked";
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      <div className="app-container flex min-h-dvh items-center justify-center py-10">
        <section
          className={cn(
            "grid w-full gap-6",
            layout === "stacked"
              ? "max-w-5xl grid-cols-1"
              : "max-w-6xl grid-cols-1 lg:grid-cols-[1.08fr_0.92fr]",
          )}
        >
          <div
            className={cn(
              "app-panel p-8 lg:p-10",
              layout === "stacked" ? "space-y-10" : "flex flex-col justify-between",
            )}
          >
            <div>
              <div className="app-eyebrow app-eyebrow-neutral">3GLabVault</div>
              <h1 className="mt-6 max-w-xl text-4xl font-semibold text-balance text-foreground-strong md:text-5xl">
                {asideTitle}
              </h1>
              <p className="mt-4 max-w-[62ch] text-base leading-8 text-foreground-muted text-pretty">
                {asideDescription}
              </p>
            </div>

            <dl
              className={cn(
                "mt-10 grid gap-4",
                layout === "stacked" ? "md:grid-cols-3" : "sm:grid-cols-3 lg:grid-cols-1",
              )}
            >
              {highlights.map((item) => (
                <div key={item.label} className="app-panel-muted p-5">
                  <dt className="text-xs font-medium uppercase text-foreground-soft">
                    {item.label}
                  </dt>
                  <dd className="mt-3 text-sm leading-7 text-foreground-strong text-pretty">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <section className="app-panel p-8 lg:p-10">
            {eyebrow}
            <h2 className="mt-5 text-3xl font-semibold text-balance text-foreground-strong">
              {title}
            </h2>
            <p
              className={cn(
                "mt-3 max-w-[62ch] text-sm leading-7 text-foreground-muted text-pretty",
                descriptionClassName,
              )}
            >
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </section>
        </section>
      </div>
    </main>
  );
}
