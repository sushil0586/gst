import { NextResponse } from "next/server";

import { buildBackendErrorPayload, parseBackendResponse } from "@/lib/server/backend-response";
import { setSessionCookies } from "@/lib/server/session";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function POST(request: Request) {
  const body = await request.json();
  const backendResponse = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL}/auth/token/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  const parsed = await parseBackendResponse(backendResponse);
  if (!backendResponse.ok) {
    return NextResponse.json(
      buildBackendErrorPayload(parsed, "Login request failed."),
      { status: backendResponse.status },
    );
  }

  const payload = parsed.json;
  if (!payload?.access || !payload?.user) {
    return NextResponse.json(
      { message: "Backend login response was incomplete or invalid." },
      { status: 502 },
    );
  }

  await setSessionCookies(String(payload.access), typeof payload.refresh === "string" ? payload.refresh : null);
  return NextResponse.json({ user: payload.user });
}
