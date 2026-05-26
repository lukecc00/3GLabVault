"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, fetchApi, sendJson } from "@/lib/api";
import {
  clearStoredActiveWorkspace,
  clearStoredAccessToken,
  getStoredActiveWorkspace,
  getStoredAccessToken,
  setStoredActiveWorkspace,
  setStoredAccessToken,
} from "@/lib/auth-storage";
import type {
  AuthSession,
  AuthUser,
  ChangePasswordPayload,
  LoginPayload,
} from "@/lib/contracts";
import {
  getWorkspaceOptions,
  hasAdminRole,
  resolveActiveWorkspace,
  type WorkspaceOption,
} from "@/lib/workspace";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  isAdmin: boolean;
  workspaceOptions: WorkspaceOption[];
  activeWorkspace: WorkspaceOption | null;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  changePassword: (payload: ChangePasswordPayload) => Promise<AuthUser>;
  selectWorkspace: (workspaceId: string) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() =>
    getStoredActiveWorkspace(),
  );

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    const accessToken = getStoredAccessToken();

    if (!accessToken) {
      setUser(null);
      setStatus("unauthenticated");
      return null;
    }

    try {
      const session = await fetchApi<{ user: AuthUser }>("/auth/me");
      setUser(session.user);
      setStatus("authenticated");
      return session.user;
    } catch (error) {
      clearStoredAccessToken();
      setUser(null);
      setStatus("unauthenticated");

      if (error instanceof ApiError && error.status === 401) {
        return null;
      }

      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const accessToken = getStoredAccessToken();

      if (!accessToken) {
        if (active) {
          setUser(null);
          setStatus("unauthenticated");
        }
        return;
      }

      try {
        const session = await fetchApi<{ user: AuthUser }>("/auth/me");

        if (!active) {
          return;
        }

        setUser(session.user);
        setStatus("authenticated");
      } catch {
        clearStoredAccessToken();

        if (active) {
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const session = await sendJson<AuthSession, LoginPayload>(
      "/auth/login",
      "POST",
      payload,
    );

    setStoredAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");

    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await sendJson<{ success: boolean }, Record<string, never>>(
        "/auth/logout",
        "POST",
        {},
      );
    } catch {
      // Keep logout idempotent even when token has already expired.
    } finally {
      clearStoredActiveWorkspace();
      clearStoredAccessToken();
      setUser(null);
      setStatus("unauthenticated");
      setActiveWorkspaceId(null);
    }
  }, []);

  const changePassword = useCallback(
    async (payload: ChangePasswordPayload) => {
      const session = await sendJson<{ user: AuthUser }, ChangePasswordPayload>(
        "/auth/change-password",
        "POST",
        payload,
      );

      setUser(session.user);
      setStatus("authenticated");
      return session.user;
    },
    [],
  );

  const selectWorkspace = useCallback((workspaceId: string) => {
    setStoredActiveWorkspace(workspaceId);
    setActiveWorkspaceId(workspaceId);
  }, []);

  const workspaceOptions = useMemo(
    () => (user ? getWorkspaceOptions(user) : []),
    [user],
  );
  const activeWorkspace = useMemo(
    () => resolveActiveWorkspace(workspaceOptions, activeWorkspaceId),
    [activeWorkspaceId, workspaceOptions],
  );
  const isAdmin = user ? hasAdminRole(user.roleCodes) : false;

  useEffect(() => {
    if (!activeWorkspace) {
      clearStoredActiveWorkspace();
      return;
    }

    if (activeWorkspace.id !== activeWorkspaceId) {
      setStoredActiveWorkspace(activeWorkspace.id);
    }
  }, [activeWorkspace, activeWorkspaceId]);

  const value = useMemo<AuthContextValue>(() => {
    return {
      status,
      user,
      isAdmin,
      workspaceOptions,
      activeWorkspace,
      login,
      changePassword,
      selectWorkspace,
      logout,
      refresh,
    };
  }, [
    activeWorkspace,
    changePassword,
    isAdmin,
    login,
    logout,
    refresh,
    selectWorkspace,
    status,
    user,
    workspaceOptions,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内使用");
  }

  return context;
}
