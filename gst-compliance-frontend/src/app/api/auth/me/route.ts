import { NextResponse } from "next/server";

import { buildBackendErrorPayload, parseBackendResponse } from "@/lib/server/backend-response";
import { clearSessionCookies, fetchWithSession } from "@/lib/server/session";

export async function GET() {
  const backendResponse = await fetchWithSession("/auth/me/");

  if (backendResponse.status === 401) {
    await clearSessionCookies();
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const parsed = await parseBackendResponse(backendResponse);
  if (!backendResponse.ok) {
    return NextResponse.json(
      buildBackendErrorPayload(parsed, "Unable to load the current session."),
      { status: backendResponse.status },
    );
  }

  if (!parsed.json) {
    return NextResponse.json(
      { message: "Backend session response was empty or invalid." },
      { status: 502 },
    );
  }

  return NextResponse.json(parsed.json, { status: backendResponse.status });
}
