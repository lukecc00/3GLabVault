import { getStoredAccessToken } from "./auth-storage";

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "http://localhost:3001/api";
  }

  const { hostname, origin, port } = window.location;
  const isLocalWebDev =
    (hostname === "localhost" || hostname === "127.0.0.1") && port === "3000";

  if (isLocalWebDev) {
    return "http://localhost:3001/api";
  }

  return `${origin}/api`;
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
  const apiBaseUrl = getApiBaseUrl();
  const headers = new Headers(init?.headers);
  const accessToken = getStoredAccessToken();

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
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

    throw new ApiError(message, response.status);
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
