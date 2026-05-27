"use client";

import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

type DisabledActionHintProps = {
  disabled: boolean;
  reason?: string | null;
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
};

const tooltipPositionClassName = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
} as const;

export function DisabledActionHint({
  disabled,
  reason,
  children,
  align = "center",
  className,
}: DisabledActionHintProps) {
  const hintId = useId();

  if (!disabled || !reason) {
    return <>{children}</>;
  }

  return (
    <span
      className={cn(
        "group/disabled-action-hint relative inline-flex max-w-full cursor-not-allowed",
        className,
      )}
      tabIndex={0}
      aria-describedby={hintId}
      aria-label={reason}
    >
      <span aria-hidden="true" className="inline-flex max-w-full">
        {children}
      </span>
      <span
        id={hintId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-30 mt-2 w-64 rounded-2xl border border-white/10 bg-slate-950/95 px-3 py-2 text-left text-xs leading-6 text-slate-100 opacity-0 shadow-2xl transition-opacity duration-150 group-hover/disabled-action-hint:opacity-100 group-focus-visible/disabled-action-hint:opacity-100",
          tooltipPositionClassName[align],
        )}
      >
        {reason}
      </span>
    </span>
  );
}
