import { getStoredAccessToken, getStoredActiveWorkspace } from "./auth-storage";

const ACTIVE_WORKSPACE_HEADER = "X-Active-Workspace";

function shouldAttachWorkspaceHeader(path: string) {
  return !path.startsWith("/auth/");
}

function getConfiguredEnvValue(value: string | undefined, fallback: string) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : fallback;
}

function buildApiBaseUrl(hostnameFallback = "localhost", portFallback = "3001") {
  const protocol = getConfiguredEnvValue(
    process.env.NEXT_PUBLIC_API_PROTOCOL,
    "http",
  ).replace(/:$/, "");
  const host = getConfiguredEnvValue(
    process.env.NEXT_PUBLIC_API_HOST,
    hostnameFallback,
  );
  const configuredPort = process.env.NEXT_PUBLIC_API_PORT?.trim();
  const port = configuredPort || portFallback;

  return `${protocol}://${host}${port ? `:${port}` : ""}/api`;
}

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    // 服务器端，直接连接内部网络
    return "http://server:3001/api";
  }

  const { hostname } = window.location;
  
  // 浏览器端，连接到暴露的端口
  return `http://${hostname}:30881/api`;
}

function normalizeApiPath(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    const normalizedPathname = url.pathname.startsWith("/api/")
      ? url.pathname.slice(4)
      : url.pathname;

    return `${normalizedPathname}${url.search}`;
  }

  if (pathOrUrl.startsWith("/api/")) {
    return pathOrUrl.slice(4);
  }

  return pathOrUrl;
}

function buildApiUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const apiBaseUrl = getApiBaseUrl();

  if (pathOrUrl.startsWith("/api/")) {
    return `${apiBaseUrl.replace(/\/api$/, "")}${pathOrUrl}`;
  }

  return `${apiBaseUrl}${pathOrUrl}`;
}

function buildAuthorizedHeaders(pathOrUrl: string, init?: RequestInit) {
  const requestPath = normalizeApiPath(pathOrUrl);
  const headers = new Headers(init?.headers);
  const accessToken = getStoredAccessToken();
  const activeWorkspace = getStoredActiveWorkspace();

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (
    activeWorkspace &&
    shouldAttachWorkspaceHeader(requestPath) &&
    !headers.has(ACTIVE_WORKSPACE_HEADER)
  ) {
    headers.set(ACTIVE_WORKSPACE_HEADER, activeWorkspace);
  }

  return headers;
}

async function extractApiErrorMessage(response: Response) {
  let message = "请求失败";

  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) {
      message = payload.message.join("，");
    } else if (payload.message) {
      message = payload.message;
    }
  } catch {
    message = response.statusText || message;
  }

  return message;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: buildAuthorizedHeaders(path, init),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiError(await extractApiErrorMessage(response), response.status);
  }

  return (await response.json()) as T;
}

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  return requestApi<T>(path, init);
}

export async function sendJson<TResponse, TBody>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body: TBody,
): Promise<TResponse> {
  return requestApi<TResponse>(path, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function fetchApiBlob(pathOrUrl: string, init?: RequestInit) {
  const response = await fetch(buildApiUrl(pathOrUrl), {
    ...init,
    headers: buildAuthorizedHeaders(pathOrUrl, init),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ApiError(await extractApiErrorMessage(response), response.status);
  }

  return response.blob();
}
