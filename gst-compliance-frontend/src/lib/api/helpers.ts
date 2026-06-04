import type { ApiEnvelope, PaginatedResult } from "@/types/api";

export function unwrapApiData<T>(response: { data: ApiEnvelope<T> }) {
  return response.data.data;
}

export function unwrapPaginatedData<T>(response: { data: ApiEnvelope<T[]> }): PaginatedResult<T> {
  const pagination = response.data.pagination;
  return {
    items: response.data.data,
    count: pagination?.count ?? response.data.data.length,
    page: pagination?.page ?? 1,
    pageSize: pagination?.page_size ?? response.data.data.length,
    next: pagination?.next ?? null,
    previous: pagination?.previous ?? null,
  };
}
