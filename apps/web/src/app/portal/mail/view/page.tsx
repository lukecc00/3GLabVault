"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MailMessageReader } from "../_components/mail-message-reader";
import { useMailContext } from "../_components/mail-context";
import { ApiError, fetchApi } from "@/lib/api";
import type { InternalMailMessageDetail } from "@/lib/contracts";

type FolderKey = "inbox" | "sent" | "drafts" | "archive" | "trash";

const folderMeta: Record<FolderKey, { href: string; label: string }> = {
  inbox: { href: "/portal/mail/inbox", label: "收件箱" },
  sent: { href: "/portal/mail/sent", label: "已发送" },
  drafts: { href: "/portal/mail/drafts", label: "草稿箱" },
  archive: { href: "/portal/mail/archive", label: "归档" },
  trash: { href: "/portal/mail/trash", label: "回收站" },
};

function resolveFolderKey(value: string | null): FolderKey {
  if (value && value in folderMeta) {
    return value as FolderKey;
  }

  return "inbox";
}

export default function PortalMailViewPage() {
  const searchParams = useSearchParams();
  const { refreshSummary } = useMailContext();
  const [message, setMessage] = useState<InternalMailMessageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messageId = searchParams.get("messageId") ?? "";
  const missingMessageId = !messageId;
  const folderKey = resolveFolderKey(searchParams.get("folder"));
  const backHref = useMemo(() => folderMeta[folderKey].href, [folderKey]);
  const backLabel = useMemo(() => `返回${folderMeta[folderKey].label}`, [folderKey]);

  useEffect(() => {
    let active = true;

    if (!messageId) {
      return () => {
        active = false;
      };
    }

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const detail = await fetchApi<InternalMailMessageDetail>(
          `/internal-mail/messages/${messageId}`,
        );

        if (!active) {
          return;
        }

        setMessage(detail);
        void refreshSummary();
      } catch (loadError) {
        if (!active) {
          return;
        }

        setMessage(null);
        setError(loadError instanceof ApiError ? loadError.message : "无法加载邮件详情");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [messageId, refreshSummary]);

  if (loading) {
    return <div className="app-panel-muted min-h-[640px] animate-pulse rounded-[28px]" />;
  }

  if (missingMessageId || error || !message) {
    return (
      <section className="app-panel-muted flex min-h-[420px] items-center justify-center p-8 text-center">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground-strong">
            无法打开邮件
          </h2>
          <p className="mt-3 max-w-[42ch] text-sm leading-7 text-slate-300">
            {missingMessageId
              ? "缺少邮件标识，无法打开邮件。"
              : error ?? "当前邮件不存在，或你暂时没有权限查看。"}
          </p>
          <Link href={backHref} className="app-button-primary mt-6">
            {backLabel}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="app-panel p-6 lg:p-7">
      <MailMessageReader
        message={message}
        backHref={backHref}
        backLabel={backLabel}
        headerLabel={message.isDraft ? "草稿" : "邮件"}
      />
    </section>
  );
}
