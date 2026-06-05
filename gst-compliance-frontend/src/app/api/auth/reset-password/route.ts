import { NextResponse } from "next/server";

import { buildBackendErrorPayload, parseBackendResponse } from "@/lib/server/backend-response";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";

export async function POST(request: Request) {
  const body = await request.json();
  const backendResponse = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL}/auth/reset-password/`,
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
      buildBackendErrorPayload(parsed, "Password reset failed."),
      { status: backendResponse.status },
    );
  }

  return NextResponse.json(parsed.json ?? { message: "Password reset successful." });
}
