import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData, unwrapPaginatedData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type { NoticeRecordApi } from "@/types/api";

export function useNoticesQuery(filters?: Record<string, string | undefined>, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notices.list(filters),
    enabled,
    queryFn: async () => {
      const response = await apiClient.get("/notices/", { params: filters });
      return unwrapPaginatedData<NoticeRecordApi>(response);
    },
  });
}

export function useNoticeQuery(noticeId?: string) {
  return useQuery({
    queryKey: noticeId ? queryKeys.notices.detail(noticeId) : ["notices", "detail", "missing"],
    enabled: Boolean(noticeId),
    queryFn: async () => {
      const response = await apiClient.get(`/notices/${noticeId}/`);
      return unwrapApiData<NoticeRecordApi>(response);
    },
  });
}

export function useCreateNoticeMutation(filters?: Record<string, string | undefined>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Pick<NoticeRecordApi, "gstin" | "reference_number" | "title" | "description" | "status" | "due_date" | "assigned_to">) => {
      const response = await apiClient.post("/notices/", payload);
      return unwrapApiData<NoticeRecordApi>(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notices.list(filters) });
      queryClient.invalidateQueries({ queryKey: queryKeys.notices.list() });
    },
  });
}

export function useUpdateNoticeMutation(noticeId?: string, filters?: Record<string, string | undefined>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<Pick<NoticeRecordApi, "reference_number" | "title" | "description" | "status" | "due_date" | "assigned_to">>) => {
      const response = await apiClient.patch(`/notices/${noticeId}/`, payload);
      return unwrapApiData<NoticeRecordApi>(response);
    },
    onSuccess: () => {
      if (noticeId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.notices.detail(noticeId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.notices.list(filters) });
      queryClient.invalidateQueries({ queryKey: queryKeys.notices.list() });
    },
  });
}
