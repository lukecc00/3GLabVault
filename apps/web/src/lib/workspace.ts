"use client";

import type { AuthUser } from "./contracts";

export type WorkspaceOption = {
  id: string;
  roleCode: string;
  title: string;
  description: string;
  href: "/admin" | "/portal";
  matchPrefix: "/admin" | "/portal";
  badge: string;
};

const adminRoleCodes = new Set([
  "SUPER_ADMIN",
  "LAB_ADMIN",
  "DIRECTION_ADMIN",
  "GRADE_ADMIN",
]);

export function hasAdminRole(roleCodes: string[]) {
  return roleCodes.some((roleCode) => adminRoleCodes.has(roleCode));
}

export function getWorkspaceOptions(userOrRoleCodes: AuthUser | string[]): WorkspaceOption[] {
  const roleCodes = Array.isArray(userOrRoleCodes)
    ? userOrRoleCodes
    : userOrRoleCodes.roleCodes;

  const options: WorkspaceOption[] = [];

  if (roleCodes.includes("SUPER_ADMIN")) {
    options.push({
      id: "system-admin",
      roleCode: "SUPER_ADMIN",
      title: "系统管理员",
      description: "进入后台治理工作区，处理组织概览、用户审核、角色编排与群组维护。",
      href: "/admin",
      matchPrefix: "/admin",
      badge: "系统后台",
    });
  }

  if (roleCodes.includes("LAB_ADMIN")) {
    options.push({
      id: "lab-admin",
      roleCode: "LAB_ADMIN",
      title: "实验室管理员",
      description: "进入实验室工作台，处理知识协作、内部邮件与日常实验室运营内容。",
      href: "/portal",
      matchPrefix: "/portal",
      badge: "实验室工作台",
    });
  }

  if (roleCodes.includes("DIRECTION_ADMIN")) {
    options.push({
      id: "direction-admin",
      roleCode: "DIRECTION_ADMIN",
      title: "方向管理员",
      description: "进入实验室工作台，以方向管理员身份参与空间与内容协作。",
      href: "/portal",
      matchPrefix: "/portal",
      badge: "方向工作台",
    });
  }

  if (roleCodes.includes("GRADE_ADMIN")) {
    options.push({
      id: "grade-admin",
      roleCode: "GRADE_ADMIN",
      title: "年级管理员",
      description: "进入实验室工作台，以年级管理员身份处理成员协作与知识内容。",
      href: "/portal",
      matchPrefix: "/portal",
      badge: "年级工作台",
    });
  }

  if (roleCodes.includes("MEMBER") || options.length === 0) {
    options.push({
      id: "member",
      roleCode: "MEMBER",
      title: "普通成员",
      description: "进入成员门户，查看知识空间、处理内部邮件并参与日常协作。",
      href: "/portal",
      matchPrefix: "/portal",
      badge: "成员门户",
    });
  }

  return options;
}

export function resolveActiveWorkspace(
  workspaces: WorkspaceOption[],
  activeWorkspaceId: string | null,
) {
  return (
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0] ??
    null
  );
}

export function resolveWorkspaceHref(
  workspace: WorkspaceOption,
  nextPath: string | null,
) {
  if (nextPath && nextPath.startsWith(workspace.matchPrefix)) {
    return nextPath;
  }

  return workspace.href;
}

export function getPostLoginDestination(user: AuthUser, nextPath: string | null) {
  const workspaces = getWorkspaceOptions(user);

  if (workspaces.length > 1) {
    return nextPath
      ? `/workspace-select?next=${encodeURIComponent(nextPath)}`
      : "/workspace-select";
  }

  if (nextPath) {
    return nextPath;
  }

  return workspaces[0]?.href ?? "/portal";
}
