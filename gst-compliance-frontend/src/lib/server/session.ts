import { cookies } from "next/headers";

export const ACCESS_COOKIE = "gst_compliance_access_token";
export const REFRESH_COOKIE = "gst_compliance_refresh_token";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";
const ACCESS_MAX_AGE_SECONDS = Number(process.env.JWT_ACCESS_MINUTES ?? "60") * 60;
const REFRESH_MAX_AGE_SECONDS = Number(process.env.JWT_REFRESH_DAYS ?? "7") * 24 * 60 * 60;

function getBackendBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

function buildCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function getSessionTokens() {
  const cookieStore = await cookies();
  return {
    accessToken: cookieStore.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: cookieStore.get(REFRESH_COOKIE)?.value ?? null,
  };
}

export async function setSessionCookies(accessToken: string, refreshToken?: string | null) {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, accessToken, buildCookieOptions(ACCESS_MAX_AGE_SECONDS));
  if (refreshToken) {
    cookieStore.set(REFRESH_COOKIE, refreshToken, buildCookieOptions(REFRESH_MAX_AGE_SECONDS));
  }
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

export async function refreshAccessToken() {
  const { refreshToken } = await getSessionTokens();
  if (!refreshToken) {
    await clearSessionCookies();
    return null;
  }

  const response = await fetch(`${getBackendBaseUrl()}/auth/token/refresh/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refresh: refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) {
    await clearSessionCookies();
    return null;
  }

  const payload = (await response.json()) as { access?: string };
  if (!payload.access) {
    await clearSessionCookies();
    return null;
  }

  await setSessionCookies(payload.access, refreshToken);
  return payload.access;
}

export async function fetchWithSession(
  path: string,
  init: RequestInit = {},
  options: { allowRefresh?: boolean } = {},
) {
  const { accessToken } = await getSessionTokens();
  const requestHeaders = new Headers(init.headers);

  if (accessToken) {
    requestHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
  });

  if (response.status !== 401 || options.allowRefresh === false) {
    return response;
  }

  const refreshedAccessToken = await refreshAccessToken();
  if (!refreshedAccessToken) {
    return response;
  }

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${refreshedAccessToken}`);

  return fetch(`${getBackendBaseUrl()}${path}`, {
    ...init,
    headers: retryHeaders,
    cache: "no-store",
  });
}
