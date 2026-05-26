import type { ReactNode } from "react";
import { RouteGuard } from "@/components/auth/route-guard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RouteGuard requireAdmin>{children}</RouteGuard>;
}
