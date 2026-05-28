"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../_components/admin-shell";
import { ResourceState } from "../_components/resource-state";
import { Button } from "@/components/ui/button";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import type { CreateRolePayload, RoleSummary } from "@/lib/contracts";

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [form, setForm] = useState<CreateRolePayload>({
    code: "",
    name: "",
    description: "",
    isSystem: false,
  });

  async function fetchRolesData() {
    return fetchApi<RoleSummary[]>("/roles");
  }

  async function loadRoles() {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchRolesData();
      setRoles(data);
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "无法获取角色列表数据",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await fetchRolesData();

        if (!active) {
          return;
        }

        setRoles(data);
      } catch (error) {
        if (!active) {
          return;
        }

        setError(
          error instanceof ApiError ? error.message : "无法获取角色列表数据",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setActionMessage(null);

    try {
      await sendJson<RoleSummary, CreateRolePayload>("/roles", "POST", {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        isSystem: form.isSystem ?? false,
      });

      setForm({
        code: "",
        name: "",
        description: "",
        isSystem: false,
      });
      setActionMessage("角色已创建。");
      await loadRoles();
    } catch (error) {
      setActionMessage(
        error instanceof ApiError ? error.message : "创建角色失败",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell
      title="角色管理"
      description="查看系统角色、角色编码和当前绑定人数，并支持新增角色。后续可以继续扩展权限策略配置。"
    >
      {loading ? (
        <ResourceState
          title="正在加载角色列表"
          description="正在读取角色数据，请稍候。"
        />
      ) : error ? (
        <ResourceState title="角色列表加载失败" description={error} tone="error" />
      ) : (
        <div className="space-y-6">
          <form
            onSubmit={handleSubmit}
            className="app-panel-muted p-6"
          >
            <h2 className="text-xl font-semibold">新增角色</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <div className="mb-2 text-foreground-muted">角色名称</div>
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="app-input"
                  placeholder="例如：知识库审核员"
                />
              </label>
              <label className="text-sm">
                <div className="mb-2 text-foreground-muted">角色编码</div>
                <input
                  required
                  value={form.code}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, code: event.target.value }))
                  }
                  className="app-input"
                  placeholder="例如：REVIEWER"
                />
              </label>
              <label className="text-sm md:col-span-2">
                <div className="mb-2 text-foreground-muted">角色描述</div>
                <textarea
                  value={form.description ?? ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="app-textarea min-h-24"
                  placeholder="可选"
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-foreground-muted">
                <input
                  type="checkbox"
                  checked={form.isSystem ?? false}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      isSystem: event.target.checked,
                    }))
                  }
                />
                标记为系统角色
              </label>
            </div>
            <Button
              type="submit"
              variant="success"
              className="mt-6"
              disabled={submitting}
            >
              创建角色
            </Button>
          </form>

          {actionMessage ? (
            <ResourceState
              title="操作反馈"
              description={actionMessage}
              tone={actionMessage.includes("失败") || actionMessage.includes("存在") ? "error" : "default"}
            />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((role) => (
              <article
                key={role.id}
                className="app-panel-muted p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">{role.name}</h2>
                    <p className="mt-2 text-sm text-foreground-soft">{role.code}</p>
                  </div>
                  <span className="app-pill">
                    {role._count.users} 人
                  </span>
                </div>
                <p className="mt-4 text-sm leading-7 text-foreground-muted">
                  {role.description || "暂无角色描述"}
                </p>
                {role.isSystem ? (
                  <div className="mt-4 text-xs text-[var(--success-strong)]">系统预置角色</div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
