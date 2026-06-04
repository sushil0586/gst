import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookies, fetchWithSession } from "@/lib/server/session";

function buildBackendPath(request: NextRequest, pathSegments: string[]) {
  const path = `/${pathSegments.join("/")}/`;
  const query = request.nextUrl.search;
  return `${path}${query}`;
}

async function buildProxyBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return request.formData();
  }

  if (contentType.includes("application/json")) {
    return request.text();
  }

  return request.arrayBuffer();
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const body = await buildProxyBody(request);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");

  if (contentType && !(body instanceof FormData)) {
    headers.set("Content-Type", contentType);
  }
  if (accept) {
    headers.set("Accept", accept);
  }

  const backendResponse = await fetchWithSession(
    buildBackendPath(request, pathSegments),
    {
      method: request.method,
      headers,
      body,
    },
  );

  if (backendResponse.status === 401) {
    await clearSessionCookies();
  }

  const responseHeaders = new Headers();
  const backendContentType = backendResponse.headers.get("content-type");
  const contentDisposition = backendResponse.headers.get("content-disposition");

  if (backendContentType) {
    responseHeaders.set("Content-Type", backendContentType);
  }
  if (contentDisposition) {
    responseHeaders.set("Content-Disposition", contentDisposition);
  }

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
