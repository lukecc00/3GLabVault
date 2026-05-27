"use client";

import { cn } from "@/lib/utils";

export function ResourceState({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: "default" | "error";
}) {
  const toneClass =
    tone === "error"
      ? "border-red-400/20 bg-red-400/10 text-[var(--danger-strong)]"
      : "border-border bg-surface-muted text-foreground-strong";

  return (
    <div className={cn("rounded-[28px] border p-6", toneClass)}>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-2 max-w-[65ch] text-sm leading-7 text-inherit/80 text-pretty">
        {description}
      </p>
    </div>
  );
}
