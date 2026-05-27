"use client";

import { MarkdownContent } from "@/components/ui/markdown-content";

interface MailMessageBodyProps {
  markdown: string;
  className?: string;
  emptyLabel?: string;
}

export function MailMessageBody({
  markdown,
  className,
  emptyLabel = "（无正文）",
}: MailMessageBodyProps) {
  const normalized = markdown.trim();

  if (!normalized) {
    return <div className="text-sm leading-7 text-slate-400">{emptyLabel}</div>;
  }

  return (
    <MarkdownContent
      markdown={markdown}
      className={`mail-markdown text-sm leading-7 text-slate-200 ${className || ""}`}
    />
  );
}
