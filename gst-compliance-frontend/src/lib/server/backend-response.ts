type ParsedBackendResponse =
  | { json: Record<string, unknown> | null; text: string; contentType: string }
  | { json: null; text: string; contentType: string };

export async function parseBackendResponse(response: Response): Promise<ParsedBackendResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!text) {
    return { json: null, text: "", contentType };
  }

  if (contentType.includes("application/json")) {
    try {
      return {
        json: JSON.parse(text) as Record<string, unknown>,
        text,
        contentType,
      };
    } catch {
      return { json: null, text, contentType };
    }
  }

  return { json: null, text, contentType };
}

export function buildBackendErrorPayload(parsed: ParsedBackendResponse, fallbackMessage: string) {
  if (parsed.json) {
    return parsed.json;
  }

  return {
    message: parsed.text || fallbackMessage,
  };
}
