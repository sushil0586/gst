import { NextResponse } from "next/server";

import { clearSessionCookies, fetchWithSession } from "@/lib/server/session";

export async function GET() {
  const backendResponse = await fetchWithSession("/auth/me/");

  if (backendResponse.status === 401) {
    await clearSessionCookies();
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const payload = await backendResponse.json();
  return NextResponse.json(payload, { status: backendResponse.status });
}
