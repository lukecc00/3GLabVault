"use client";

import type { ReactNode } from "react";

type AuthHighlight = {
  label: string;
  value: string;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  asideTitle,
  asideDescription,
  highlights,
  children,
}: {
  eyebrow: ReactNode;
  title: string;
  description: string;
  asideTitle: string;
  asideDescription: string;
  highlights: AuthHighlight[];
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      <div className="app-container flex min-h-dvh items-center justify-center py-10">
        <section className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="app-panel flex flex-col justify-between p-8 lg:p-10">
            <div>
              <div className="app-eyebrow app-eyebrow-neutral">3GLabVault</div>
              <h1 className="mt-6 max-w-xl text-4xl font-semibold text-balance text-slate-50 md:text-5xl">
                {asideTitle}
              </h1>
              <p className="mt-4 max-w-[62ch] text-base leading-8 text-slate-300 text-pretty">
                {asideDescription}
              </p>
            </div>

            <dl className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {highlights.map((item) => (
                <div key={item.label} className="app-panel-muted p-5">
                  <dt className="text-xs font-medium uppercase text-slate-400">
                    {item.label}
                  </dt>
                  <dd className="mt-3 text-sm leading-7 text-slate-100 text-pretty">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <section className="app-panel p-8 lg:p-10">
            {eyebrow}
            <h2 className="mt-5 text-3xl font-semibold text-balance text-slate-50">
              {title}
            </h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-7 text-slate-300 text-pretty">
              {description}
            </p>
            <div className="mt-8">{children}</div>
          </section>
        </section>
      </div>
    </main>
  );
}
