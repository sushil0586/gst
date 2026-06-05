import { NextResponse } from "next/server";

import { buildBackendErrorPayload, parseBackendResponse } from "@/lib/server/backend-response";
import { setSessionCookies } from "@/lib/server/session";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function POST(request: Request) {
  const body = await request.json();
  const backendResponse = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL}/auth/register/`,
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
      buildBackendErrorPayload(parsed, "Registration request failed."),
      { status: backendResponse.status },
    );
  }

  const tokenPayload = parsed.json?.data as Record<string, unknown> | undefined;
  if (!tokenPayload?.access || !tokenPayload?.user) {
    return NextResponse.json(
      { message: "Backend registration response was incomplete or invalid." },
      { status: 502 },
    );
  }

  await setSessionCookies(
    String(tokenPayload.access),
    typeof tokenPayload.refresh === "string" ? tokenPayload.refresh : null,
  );
  return NextResponse.json({ user: tokenPayload.user });
}
