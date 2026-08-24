import { useMutation, useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { unwrapApiData } from "@/lib/api/helpers";
import { queryKeys } from "@/lib/query/query-keys";
import type {
  IMSApiResponse,
  IMSFileRequest,
  IMSInvoicesCountRequest,
  IMSInvoicesRequest,
  IMSRejectedInvoicesRequest,
  IMSResetRequest,
  IMSSaveRequest,
  IMSStatusRequest,
  IMSSupplierInvoicesRequest,
} from "@/types/api";

type IMSQueryOptions = {
  enabled?: boolean;
};

function normalizeIMSParams<T extends Record<string, string | undefined>>(params: T): T {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as T;
}

export function useIMSStatusQuery(filters: IMSStatusRequest, options?: IMSQueryOptions) {
  const params = normalizeIMSParams(filters);
  return useQuery({
    queryKey: queryKeys.ims.status(params),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.gstin && filters.int_tran_id),
    queryFn: async () => {
      const response = await apiClient.get("/ims/status/", { params });
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}

export function useIMSInvoicesQuery(filters: IMSInvoicesRequest, options?: IMSQueryOptions) {
  const params = normalizeIMSParams(filters);
  return useQuery({
    queryKey: queryKeys.ims.invoices(params),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.gstin && filters.section && filters.status),
    queryFn: async () => {
      const response = await apiClient.get("/ims/invoices/", { params });
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}

export function useIMSInvoicesCountQuery(filters: IMSInvoicesCountRequest, options?: IMSQueryOptions) {
  const params = normalizeIMSParams(filters);
  return useQuery({
    queryKey: queryKeys.ims.invoicesCount(params),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.gstin && filters.goods_type),
    queryFn: async () => {
      const response = await apiClient.get("/ims/invoices-count/", { params });
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}

export function useIMSSupplierInvoicesQuery(filters: IMSSupplierInvoicesRequest, options?: IMSQueryOptions) {
  const params = normalizeIMSParams(filters);
  return useQuery({
    queryKey: queryKeys.ims.supplierInvoices(params),
    enabled:
      options?.enabled ??
      Boolean(filters.workspace && filters.client && filters.gstin && filters.ret_period && filters.section && filters.rtn_type),
    queryFn: async () => {
      const response = await apiClient.get("/ims/supplier-invoices/", { params });
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}

export function useIMSRejectedInvoicesQuery(filters: IMSRejectedInvoicesRequest, options?: IMSQueryOptions) {
  const params = normalizeIMSParams(filters);
  return useQuery({
    queryKey: queryKeys.ims.rejectedInvoices(params),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.gstin && filters.ret_period && filters.section),
    queryFn: async () => {
      const response = await apiClient.get("/ims/rejected-invoices/", { params });
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}

export function useIMSFileQuery(filters: IMSFileRequest, options?: IMSQueryOptions) {
  const params = normalizeIMSParams(filters);
  return useQuery({
    queryKey: queryKeys.ims.file(params),
    enabled: options?.enabled ?? Boolean(filters.workspace && filters.client && filters.gstin && filters.token),
    queryFn: async () => {
      const response = await apiClient.get("/ims/file/", { params });
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}

export function useIMSSaveMutation() {
  return useMutation({
    mutationFn: async (payload: IMSSaveRequest) => {
      const response = await apiClient.post("/ims/save/", payload);
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}

export function useIMSResetMutation() {
  return useMutation({
    mutationFn: async (payload: IMSResetRequest) => {
      const response = await apiClient.post("/ims/reset/", payload);
      return unwrapApiData<IMSApiResponse>(response);
    },
  });
}
