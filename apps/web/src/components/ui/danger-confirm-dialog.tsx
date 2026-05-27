"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface DangerConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  confirmLabel: string;
  actionLabel: string;
  busy?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

export function DangerConfirmDialog({
  open,
  title,
  description,
  confirmText,
  confirmLabel,
  actionLabel,
  busy = false,
  errorMessage = null,
  onClose,
  onConfirm,
}: DangerConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const [value, setValue] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (!containerRef.current) {
        return;
      }

      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(containerRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const currentIndex = focusableElements.indexOf(
        document.activeElement as HTMLElement,
      );

      if (event.shiftKey) {
        const previousIndex =
          currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
        focusableElements[previousIndex]?.focus();
        event.preventDefault();
        return;
      }

      const nextIndex =
        currentIndex === -1 || currentIndex === focusableElements.length - 1
          ? 0
          : currentIndex + 1;
      focusableElements[nextIndex]?.focus();
      event.preventDefault();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previousActiveElementRef.current?.focus();
    };
  }, [busy, onClose, open]);

  if (!open) {
    return null;
  }

  const matched = value.trim() === confirmText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-[32px] border border-red-400/20 bg-surface p-6 text-foreground-strong shadow-2xl"
      >
        <div className="app-eyebrow app-eyebrow-amber">Danger Zone</div>
        <h2 id={titleId} className="mt-4 text-xl font-semibold">
          {title}
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-7 text-foreground-muted">
          {description}
        </p>

        <div className="mt-4 rounded-2xl border border-border bg-surface-soft px-4 py-3 text-sm text-foreground-muted">
          请输入确认文案：<span className="font-medium text-foreground-strong">{confirmText}</span>
        </div>

        <label htmlFor={inputId} className="mt-5 block text-sm">
          <div className="mb-2 text-foreground-muted">{confirmLabel}</div>
          <input
            id={inputId}
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="app-input"
            placeholder={confirmText}
            aria-describedby={descriptionId}
            aria-invalid={value.length > 0 && !matched}
          />
        </label>

        <div aria-live="polite" className="mt-2 min-h-6 text-sm text-red-100">
          {value.length > 0 && !matched ? "确认文案不匹配，暂时无法执行操作。" : null}
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            disabled={busy}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm()}
            variant="danger"
            disabled={!matched || busy}
          >
            {busy ? "处理中..." : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
