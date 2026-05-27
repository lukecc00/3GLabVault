"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "./_components/admin-shell";
import { ResourceState } from "./_components/resource-state";
import { useAuth } from "@/components/auth/auth-provider";
import { ApiError, fetchApi } from "@/lib/api";
import type { OrganizationSummary } from "@/lib/contracts";
import { hasGlobalAdminRole } from "@/lib/workspace";

const summaryCards = [
  { key: "userCount", label: "成员总数" },
  { key: "pendingUserCount", label: "待审核成员" },
  { key: "roleCount", label: "角色总数" },
  { key: "groupCount", label: "群组总数" },
  { key: "directionCount", label: "方向组" },
  { key: "gradeCount", label: "年级组" },
] as const;

export default function AdminHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [summary, setSummary] = useState<OrganizationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && !hasGlobalAdminRole(user.roleCodes)) {
      router.replace("/admin/users");
      return;
    }

    async function load() {
      try {
        const data = await fetchApi<OrganizationSummary>("/organizations/summary");
        setSummary(data);
      } catch (error) {
        setError(
          error instanceof ApiError ? error.message : "无法获取组织概览数据",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [router, user]);

  if (user && !hasGlobalAdminRole(user.roleCodes)) {
    return null;
  }

  return (
    <AdminShell
      title="组织概览"
      description="查看实验室当前的成员、角色、方向组和年级组统计，作为后续审核、权限和知识库建设的管理入口。"
    >
      {loading ? (
        <ResourceState
          title="正在加载概览数据"
          description="正在从后端读取组织统计，请稍候。"
        />
      ) : error ? (
        <ResourceState
          title="概览加载失败"
          description={error}
          tone="error"
        />
      ) : summary ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <div key={card.key} className="app-stat-card">
              <div className="app-stat-label">{card.label}</div>
              <div className="app-stat-value">
                {summary[card.key]}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </AdminShell>
  );
}
