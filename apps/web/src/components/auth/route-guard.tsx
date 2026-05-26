"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";

export function RouteGuard({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, isAdmin, user } = useAuth();

  useEffect(() => {
    if (status !== "unauthenticated") {
      return;
    }

    const query =
      typeof window === "undefined" ? "" : window.location.search.slice(1);
    const next = query ? `${pathname}?${query}` : pathname;

    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [pathname, router, status]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !user?.mustChangePassword ||
      pathname === "/change-password"
    ) {
      return;
    }

    router.replace("/change-password");
  }, [pathname, router, status, user?.mustChangePassword]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-50">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm text-zinc-300">
          正在验证登录状态...
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (user?.mustChangePassword && pathname !== "/change-password") {
    return null;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-50">
        <div className="max-w-md rounded-3xl border border-red-400/20 bg-red-400/10 p-6">
          <h1 className="text-xl font-semibold">无管理员权限</h1>
          <p className="mt-3 text-sm leading-7 text-red-100">
            当前账号已登录，但没有访问该高权限工作区的权限。请切换具备权限的账号，或返回知识工作台继续使用。
          </p>
          <button
            type="button"
            onClick={() => router.replace("/portal")}
            className="mt-5 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            返回知识工作台
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
