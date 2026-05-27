"use client";

import { useEffect, useMemo, useRef } from "react";
import { hydrateAuthorizedImages } from "@/lib/authorized-images";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export function MarkdownContent({
  markdown,
  className,
  emptyHtml,
}: {
  markdown: string;
  className?: string;
  emptyHtml?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => {
    const rendered = renderMarkdownToHtml(markdown);
    return rendered || emptyHtml || "";
  }, [emptyHtml, markdown]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    return hydrateAuthorizedImages(container);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={cn("markdown-content", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
