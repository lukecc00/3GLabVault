"use client";

import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

const tooltipAlignClassMap = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
} as const;

export type TooltipHintAlign = keyof typeof tooltipAlignClassMap;

type TooltipHintProps = {
  children: ReactNode;
  content: ReactNode;
  align?: TooltipHintAlign;
  className?: string;
  tooltipClassName?: string;
  focusable?: boolean;
  ariaLabel?: string;
};

export function TooltipHint({
  children,
  content,
  align = "center",
  className,
  tooltipClassName,
  focusable = false,
  ariaLabel,
}: TooltipHintProps) {
  const tooltipId = useId();

  return (
    <span
      className={cn("group/tooltip-hint relative inline-flex max-w-full", className)}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable ? tooltipId : undefined}
      aria-label={focusable ? ariaLabel : undefined}
    >
      {children}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-30 mt-2 min-w-max max-w-72 rounded-2xl border border-white/10 bg-slate-950/95 px-3 py-2 text-left text-xs leading-5 text-slate-100 opacity-0 shadow-2xl transition-opacity duration-150 group-hover/tooltip-hint:opacity-100 group-focus-within/tooltip-hint:opacity-100 group-focus-visible/tooltip-hint:opacity-100",
          tooltipAlignClassMap[align],
          tooltipClassName,
        )}
      >
        {content}
      </span>
    </span>
  );
}
