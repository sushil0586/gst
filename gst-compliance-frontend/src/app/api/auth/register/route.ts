import { NextResponse } from "next/server";

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

  const payload = await backendResponse.json();
  if (!backendResponse.ok) {
    return NextResponse.json(payload, { status: backendResponse.status });
  }

  const tokenPayload = payload?.data;
  await setSessionCookies(tokenPayload.access, tokenPayload.refresh);
  return NextResponse.json({ user: tokenPayload.user });
}
