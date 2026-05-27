const AUTH_TOKEN_STORAGE_KEY = "labvault.accessToken";
const ACTIVE_WORKSPACE_STORAGE_KEY = "labvault.activeWorkspace";

function readFromLegacyTokenStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  const legacyToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!legacyToken) {
    return null;
  }

  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, legacyToken);
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  return legacyToken;
}

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ??
    readFromLegacyTokenStorage()
  );
}

export function setStoredAccessToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  // Sensitive access tokens stay in sessionStorage to reduce long-term persistence.
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function clearStoredAccessToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

export function getStoredActiveWorkspace(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

export function setStoredActiveWorkspace(workspaceId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
}

export function clearStoredActiveWorkspace() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}
