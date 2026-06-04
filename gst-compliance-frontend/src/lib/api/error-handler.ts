import axios from "axios";

export type NormalizedApiError = {
  message: string;
  fieldErrors?: Record<string, string[]>;
  statusCode?: number;
  requestId?: string;
};

function normalizeFieldErrors(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(entry)) {
      result[key] = entry.map((item) => String(item));
      continue;
    }
    if (typeof entry === "string") {
      result[key] = [entry];
    }
  }
  return Object.keys(result).length ? result : undefined;
}

export function normalizeApiError(error: unknown): NormalizedApiError {
  if (axios.isAxiosError(error)) {
    const envelopeErrors = error.response?.data?.errors;
    return {
      message:
        error.response?.data?.message ||
        error.response?.data?.detail ||
        error.message ||
        "Request failed.",
      fieldErrors:
        normalizeFieldErrors(envelopeErrors) ||
        normalizeFieldErrors(error.response?.data?.data) ||
        normalizeFieldErrors(error.response?.data),
      statusCode: error.response?.status,
      requestId:
        error.response?.data?.request_id ||
        error.response?.headers?.["x-request-id"] ||
        undefined,
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "Something went wrong." };
}

export function getErrorMessage(error: unknown) {
  return normalizeApiError(error).message;
}

export function getFieldErrors(error: unknown) {
  return normalizeApiError(error).fieldErrors;
}
