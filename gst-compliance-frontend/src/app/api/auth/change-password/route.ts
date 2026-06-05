import { NextResponse } from "next/server";

import { buildBackendErrorPayload, parseBackendResponse } from "@/lib/server/backend-response";
import { fetchWithSession } from "@/lib/server/session";

export async function POST(request: Request) {
  const body = await request.json();
  const backendResponse = await fetchWithSession(
    "/auth/change-password/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  const parsed = await parseBackendResponse(backendResponse);
  if (!backendResponse.ok) {
    return NextResponse.json(
      buildBackendErrorPayload(parsed, "Password change failed."),
      { status: backendResponse.status },
    );
  }

  return NextResponse.json(parsed.json ?? { message: "Password changed successfully." });
}
