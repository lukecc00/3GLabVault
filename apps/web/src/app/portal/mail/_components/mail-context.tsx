"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, fetchApi } from "@/lib/api";
import type { InternalMailSummary } from "@/lib/contracts";

interface MailContextValue {
  summary: InternalMailSummary | null;
  loadingSummary: boolean;
  summaryError: string | null;
  refreshSummary: () => Promise<void>;
}

const MailContext = createContext<MailContextValue | null>(null);

export function MailContextProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<InternalMailSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const refreshSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);

    try {
      const nextSummary = await fetchApi<InternalMailSummary>("/internal-mail/summary");
      setSummary(nextSummary);
    } catch (error) {
      setSummaryError(
        error instanceof ApiError ? error.message : "无法获取内部邮件统计信息",
      );
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const value = useMemo<MailContextValue>(
    () => ({
      summary,
      loadingSummary,
      summaryError,
      refreshSummary,
    }),
    [loadingSummary, refreshSummary, summary, summaryError],
  );

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

export function useMailContext() {
  const context = useContext(MailContext);

  if (!context) {
    throw new Error("useMailContext 必须在 MailContextProvider 内使用");
  }

  return context;
}
