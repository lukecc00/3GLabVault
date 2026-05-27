"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type AppButtonVariant =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "secondary"
  | "ghost"
  | "softSuccess"
  | "dangerOutline"
  | "toolbar";

export type AppButtonSize = "md" | "sm" | "xs";

const buttonVariantClassMap: Record<AppButtonVariant, string> = {
  primary: "app-button-primary",
  success: "app-button-primary-emerald",
  warning: "app-button-primary-amber",
  danger: "app-button-primary-danger",
  secondary: "app-button-secondary",
  ghost: "app-button-ghost",
  softSuccess: "app-button-soft-emerald",
  dangerOutline: "app-button-danger-outline",
  toolbar: "app-toolbar-button",
};

const buttonSizeClassMap: Record<AppButtonSize, string> = {
  md: "app-button-md",
  sm: "app-button-sm",
  xs: "app-button-xs",
};

type ButtonClassNameOptions = {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  className?: string;
};

export function buttonClassName({
  variant = "secondary",
  size = "md",
  className,
}: ButtonClassNameOptions = {}) {
  return cn(
    buttonVariantClassMap[variant],
    variant === "toolbar" ? null : buttonSizeClassMap[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
