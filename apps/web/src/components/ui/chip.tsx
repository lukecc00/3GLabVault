"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type AppChipTone = "accent" | "success";

type ChipClassNameOptions = {
  active?: boolean;
  tone?: AppChipTone;
  className?: string;
};

export function chipClassName({
  active = false,
  tone = "accent",
  className,
}: ChipClassNameOptions = {}) {
  return cn(
    "app-chip-button",
    active ? (tone === "success" ? "is-active-emerald" : "is-active-sky") : null,
    className,
  );
}

export type ChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  tone?: AppChipTone;
};

export function ChipButton({
  active = false,
  tone = "accent",
  className,
  type = "button",
  ...props
}: ChipButtonProps) {
  return (
    <button
      type={type}
      className={chipClassName({ active, tone, className })}
      {...props}
    />
  );
}
