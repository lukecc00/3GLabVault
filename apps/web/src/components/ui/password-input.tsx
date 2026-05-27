"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  wrapperClassName?: string;
  visibilityLabel?: string;
};

function EyeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7A3 3 0 0 0 14 14.1" />
      <path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.2 17.2 0 0 1-4 4.8" />
      <path d="M6.6 6.7C3.8 8.5 2 12 2 12a17.7 17.7 0 0 0 7 5.5" />
    </svg>
  );
}

export function PasswordInput({
  className,
  wrapperClassName,
  id,
  visibilityLabel = "密码",
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        className={cn(className, "pr-12")}
      />
      <button
        type="button"
        aria-controls={inputId}
        aria-label={`${visible ? "隐藏" : "显示"}${visibilityLabel}`}
        aria-pressed={visible}
        onClick={() => setVisible((prev) => !prev)}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl text-foreground-muted transition hover:text-foreground-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
