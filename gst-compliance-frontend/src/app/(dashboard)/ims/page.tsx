"use client";

import { useState } from "react";
import { FileJson2, Loader2, RefreshCw, RotateCcw, Save, Search } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCompliancePeriodsQuery } from "@/features/compliance-periods";
import { useProviderAuthSessionsQuery } from "@/features/filings";
import {
  useIMSActionBatchRetryMutation,
  useIMSActionBatchStatusMutation,
  useIMSActionBatchesQuery,
  useIMSFileQuery,
  useIMSInvoicesCountQuery,
  useIMSInvoicesQuery,
  useIMSRejectedInvoicesQuery,
  useIMSResetMutation,
  useIMSSaveMutation,
  useIMSStatusQuery,
  useIMSSupplierInvoicesQuery,
} from "@/features/ims";
import { hasPermission, permissions } from "@/lib/permissions";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import type {
  IMSActionBatchRecord,
  IMSFileRequest,
  IMSInvoicesCountRequest,
  IMSInvoicesRequest,
  IMSRejectedInvoicesRequest,
  IMSStatusRequest,
  IMSSupplierInvoicesRequest,
} from "@/types/api";

const sampleDraftPayload = {
  b2b: [
    {
      ctin: "29ABCDE1234F1Z5",
      inv: [
        {
          inum: "IMS-001",
          idt: "01-04-2026",
          val: 1180,
          pos: "29",
          rchrg: "N",
          itms: [{ num: 1, itm_det: { txval: 1000, rt: 18, iamt: 0, camt: 90, samt: 90, csamt: 0 } }],
        },
      ],
    },
  ],
};

function toReturnPeriod(period?: string | null) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return "";
  }
  const [year, month] = period.split("-");
  return `${month}${year}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSessionVariant(status?: string, isStale?: boolean) {
  if (isStale || status === "failed") return "danger" as const;
  if (status === "session_active") return "success" as const;
  if (status === "auth_token_received" || status === "otp_requested") return "warning" as const;
  return "neutral" as const;
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getStringField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return "";
}

function getArrayCount(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }
  return null;
}

function getNestedErrorMessage(record: Record<string, unknown>) {
  const error = asRecord(record.error);
  return getStringField(error, "message", "error_message", "details") || getStringField(record, "message", "status_desc");
}

function getStatusVariantFromPayload(record: Record<string, unknown>) {
  const statusCode = getStringField(record, "status_cd", "status_code");
  if (statusCode === "1" || statusCode.toUpperCase() === "SUCCESS") return "success" as const;
  if (statusCode || record.error) return "danger" as const;
  return "neutral" as const;
}

function asIMSActionBatch(value: unknown): IMSActionBatchRecord | null {
  const record = asRecord(value);
  if (!record.id || !record.action_type || !record.status) return null;
  return record as unknown as IMSActionBatchRecord;
}

type NormalizedIMSInvoice = {
  id: string;
  supplierGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  section: string;
  status: string;
  value: string;
  taxableValue: string;
  taxAmount: string;
};

type NormalizedIMSCountMetric = {
  key: string;
  label: string;
  value: string;
};

const invoiceSections = new Set(["B2B", "B2BA", "CN", "CNA", "DN", "DNA", "ECOM", "ECOMA", "IMPG", "IMPS"]);
const invoiceArrayKeys = new Set(["invoice", "invoices", "inv", "invdata", "docs", "documents", "nt", "notes"]);
const ignoredMetricKeys = new Set(["status_cd", "status_code", "message", "status_desc", "txn", "token", "int_tran_id"]);

function humanizeKey(value: string) {
  return value
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getNumericField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = Number(value.replace(/,/g, ""));
      if (Number.isFinite(normalized)) return normalized;
    }
  }
  return null;
}

function formatNumber(value: number | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function sumTaxHeads(record: Record<string, unknown>) {
  const directTax =
    (getNumericField(record, "iamt", "igst", "igst_amount") ?? 0)
    + (getNumericField(record, "camt", "cgst", "cgst_amount") ?? 0)
    + (getNumericField(record, "samt", "sgst", "sgst_amount") ?? 0)
    + (getNumericField(record, "csamt", "cess", "cess_amount") ?? 0);
  const items = record.itms ?? record.items;
  if (directTax > 0 || !Array.isArray(items)) return directTax || null;
  return items.reduce((total, item) => {
    const itemRecord = asRecord(item);
    const itemDetail = asRecord(itemRecord.itm_det);
    const detail = Object.keys(itemDetail).length ? itemDetail : itemRecord;
    return total + (sumTaxHeads(detail) ?? 0);
  }, 0);
}

function sumTaxableValue(record: Record<string, unknown>) {
  const directTaxable = getNumericField(record, "txval", "taxable_value", "taxableValue");
  if (directTaxable !== null) return directTaxable;
  const items = record.itms ?? record.items;
  if (!Array.isArray(items)) return null;
  return items.reduce((total, item) => {
    const itemRecord = asRecord(item);
    const itemDetail = asRecord(itemRecord.itm_det);
    const detail = Object.keys(itemDetail).length ? itemDetail : itemRecord;
    return total + (sumTaxableValue(detail) ?? 0);
  }, 0);
}

function inferSection(path: string[]) {
  for (const segment of [...path].reverse()) {
    const upper = segment.toUpperCase();
    if (invoiceSections.has(upper)) return upper;
  }
  return "";
}

function isInvoiceLikeRecord(record: Record<string, unknown>) {
  return Boolean(
    getStringField(record, "inum", "invoice_number", "inv_num", "doc_num", "nt_num")
      || getStringField(record, "idt", "invoice_date", "inv_dt", "doc_dt", "nt_dt")
      || getNumericField(record, "val", "invoice_value", "total_value", "txval") !== null,
  );
}

function normalizeIMSInvoices(payload: Record<string, unknown>) {
  const rows: NormalizedIMSInvoice[] = [];

  function walk(value: unknown, context: { supplierGstin?: string; section?: string }, path: string[]) {
    if (rows.length >= 25) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, context, path));
      return;
    }

    const record = asRecord(value);
    if (!Object.keys(record).length) return;

    const supplierGstin =
      getStringField(record, "ctin", "stin", "supplier_gstin", "supplierGstin", "cpty_gstin") || context.supplierGstin || "";
    const section = getStringField(record, "section", "sec") || context.section || inferSection(path);

    if (isInvoiceLikeRecord(record)) {
      rows.push({
        id: `${rows.length}-${getStringField(record, "inum", "invoice_number", "inv_num", "doc_num", "nt_num") || "invoice"}`,
        supplierGstin: supplierGstin || "Unavailable",
        invoiceNumber: getStringField(record, "inum", "invoice_number", "inv_num", "doc_num", "nt_num") || "Unavailable",
        invoiceDate: getStringField(record, "idt", "invoice_date", "inv_dt", "doc_dt", "nt_dt") || "Unavailable",
        section: section || "Unavailable",
        status: getStringField(record, "status", "ims_status", "action", "provider_status") || "Unavailable",
        value: formatNumber(getNumericField(record, "val", "invoice_value", "total_value")),
        taxableValue: formatNumber(sumTaxableValue(record)),
        taxAmount: formatNumber(sumTaxHeads(record)),
      });
      return;
    }

    Object.entries(record).forEach(([key, child]) => {
      if (key === "itms" || key === "items") return;
      if (Array.isArray(child) || (child && typeof child === "object")) {
        const nextContext = {
          supplierGstin,
          section: invoiceSections.has(key.toUpperCase()) || invoiceArrayKeys.has(key.toLowerCase()) ? section || key.toUpperCase() : section,
        };
        walk(child, nextContext, [...path, key]);
      }
    });
  }

  walk(payload, {}, []);
  return rows;
}

function isCountMetricKey(key: string) {
  const normalized = key.toLowerCase();
  if (ignoredMetricKeys.has(normalized)) return false;
  return (
    normalized.includes("count")
    || normalized.includes("total")
    || normalized.includes("pending")
    || normalized.includes("accepted")
    || normalized.includes("rejected")
    || normalized.includes("no_action")
    || invoiceSections.has(key.toUpperCase())
  );
}

function normalizeIMSCountMetrics(payload: Record<string, unknown>) {
  const metrics: NormalizedIMSCountMetric[] = [];

  function walk(value: unknown, path: string[]) {
    if (metrics.length >= 16) return;
    const record = asRecord(value);
    Object.entries(record).forEach(([key, child]) => {
      if (metrics.length >= 16) return;
      const nextPath = [...path, key];
      if ((typeof child === "number" || typeof child === "string") && isCountMetricKey(key)) {
        metrics.push({
          key: nextPath.join("."),
          label: humanizeKey(nextPath.join(".")),
          value: String(child),
        });
        return;
      }
      if (Array.isArray(child)) {
        if (isCountMetricKey(key)) {
          metrics.push({
            key: nextPath.join("."),
            label: humanizeKey(nextPath.join(".")),
            value: String(child.length),
          });
        }
        child.slice(0, 3).forEach((item, index) => walk(item, [...nextPath, String(index + 1)]));
        return;
      }
      if (child && typeof child === "object") {
        walk(child, nextPath);
      }
    });
  }

  walk(payload, []);
  return metrics;
}

function getActionBatchStatusVariant(status?: string) {
  if (status === "submitted") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "requested") return "warning" as const;
  return "neutral" as const;
}

type IMSSelectedSession = {
  email?: string | null;
  response_contract_confirmed?: boolean | null;
  freshness_summary?: {
    is_stale?: boolean | null;
  } | null;
} | null;

function getActionStateSummary(canWrite: boolean, selectedSession: IMSSelectedSession) {
  if (!selectedSession) {
    return {
      label: "Session required",
      detail: "Read actions can still help investigate provider state, but write actions normally require a verified auth session.",
    };
  }
  if (selectedSession.freshness_summary?.is_stale) {
    return {
      label: "Session stale",
      detail: "Refresh provider access from Returns or Filing before relying on save or reset actions.",
    };
  }
  if (!canWrite) {
    return {
      label: "Read-only access",
      detail: "This role can investigate IMS data safely, but cannot submit provider write actions.",
    };
  }
  return {
    label: "Ready for operator actions",
    detail: "The selected context has a usable auth session and this role can run both investigative and write actions.",
  };
}

export default function IMSPage() {
  type ResponseSource = "status" | "invoices" | "count" | "supplier" | "rejected" | "file" | "save" | "reset" | "retry" | "batch_status" | null;

  const { permissions: sessionPermissions } = useSession();
  const {
    selectedWorkspaceId,
    selectedWorkspace,
    selectedClientId,
    selectedClient,
    selectedGstinId,
    selectedGstin,
    selectedPeriod,
    isLoading: contextLoading,
    hasWorkspace,
    hasClient,
    hasGstin,
  } = useWorkspaceContext();

  const canWrite = hasPermission(sessionPermissions, permissions.fileReturn);
  const periodsQuery = useCompliancePeriodsQuery(selectedGstinId);
  const authSessionsQuery = useProviderAuthSessionsQuery({
    workspace: selectedWorkspaceId,
    client: selectedClientId,
    gstin: selectedGstinId,
    provider: "whitebooks",
  });

  const sessions = authSessionsQuery.data?.items ?? [];
  const activeSession = sessions.find((session) => session.status === "session_active" && !session.freshness_summary?.is_stale) ?? sessions[0] ?? null;
  const periodOptions = periodsQuery.data?.items ?? [];

  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [retPeriod, setRetPeriod] = useState(toReturnPeriod(selectedPeriod?.period));
  const [manualTxn, setManualTxn] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [draftPayloadText, setDraftPayloadText] = useState(prettyJson(sampleDraftPayload));
  const [statusTranId, setStatusTranId] = useState("");
  const [invoiceSection, setInvoiceSection] = useState("B2B");
  const [invoiceStatus, setInvoiceStatus] = useState("PENDING");
  const [goodsType, setGoodsType] = useState("GOODS");
  const [supplierSection, setSupplierSection] = useState("B2B");
  const [supplierReturnType, setSupplierReturnType] = useState("GSTR1");
  const [rejectedSection, setRejectedSection] = useState("B2B");
  const [fileToken, setFileToken] = useState("");
  const [actionBatchActionFilter, setActionBatchActionFilter] = useState("all");
  const [actionBatchStatusFilter, setActionBatchStatusFilter] = useState("all");

  const [statusFilters, setStatusFilters] = useState<IMSStatusRequest | null>(null);
  const [invoiceFilters, setInvoiceFilters] = useState<IMSInvoicesRequest | null>(null);
  const [countFilters, setCountFilters] = useState<IMSInvoicesCountRequest | null>(null);
  const [supplierFilters, setSupplierFilters] = useState<IMSSupplierInvoicesRequest | null>(null);
  const [rejectedFilters, setRejectedFilters] = useState<IMSRejectedInvoicesRequest | null>(null);
  const [fileFilters, setFileFilters] = useState<IMSFileRequest | null>(null);
  const [responseTitle, setResponseTitle] = useState("Awaiting an IMS action");
  const [responseSource, setResponseSource] = useState<ResponseSource>(null);
  const derivedRetPeriod = retPeriod || toReturnPeriod(selectedPeriod?.period);
  const effectiveSessionId = selectedSessionId && sessions.some((session) => session.id === selectedSessionId)
    ? selectedSessionId
    : activeSession?.id ?? "";
  const selectedSession = sessions.find((session) => session.id === effectiveSessionId) ?? activeSession;

  const baseFilters = selectedWorkspaceId && selectedClientId && selectedGstinId
    ? {
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId,
        auth_session: selectedSession?.id,
        txn: manualTxn.trim() || undefined,
        email: manualEmail.trim() || undefined,
      }
    : null;

  const statusQuery = useIMSStatusQuery(
    statusFilters ?? { workspace: "", client: "", gstin: "", int_tran_id: "" },
    { enabled: Boolean(statusFilters) },
  );
  const invoicesQuery = useIMSInvoicesQuery(
    invoiceFilters ?? { workspace: "", client: "", gstin: "", section: "", status: "" },
    { enabled: Boolean(invoiceFilters) },
  );
  const invoicesCountQuery = useIMSInvoicesCountQuery(
    countFilters ?? { workspace: "", client: "", gstin: "", goods_type: "" },
    { enabled: Boolean(countFilters) },
  );
  const supplierInvoicesQuery = useIMSSupplierInvoicesQuery(
    supplierFilters ?? { workspace: "", client: "", gstin: "", ret_period: "", section: "", rtn_type: "" },
    { enabled: Boolean(supplierFilters) },
  );
  const rejectedInvoicesQuery = useIMSRejectedInvoicesQuery(
    rejectedFilters ?? { workspace: "", client: "", gstin: "", ret_period: "", section: "" },
    { enabled: Boolean(rejectedFilters) },
  );
  const fileQuery = useIMSFileQuery(
    fileFilters ?? { workspace: "", client: "", gstin: "", token: "" },
    { enabled: Boolean(fileFilters) },
  );
  const actionBatchesQuery = useIMSActionBatchesQuery(
    baseFilters
      ? {
          ...baseFilters,
          ret_period: derivedRetPeriod || undefined,
          action_type: actionBatchActionFilter === "all" ? undefined : actionBatchActionFilter,
          status: actionBatchStatusFilter === "all" ? undefined : actionBatchStatusFilter,
        }
      : { workspace: "", client: "", gstin: "" },
    { enabled: Boolean(baseFilters) },
  );
  const saveMutation = useIMSSaveMutation();
  const resetMutation = useIMSResetMutation();
  const retryMutation = useIMSActionBatchRetryMutation();
  const batchStatusMutation = useIMSActionBatchStatusMutation();
  const recentActionBatches = actionBatchesQuery.data ?? [];

  const responseMap = {
    status: statusQuery.data,
    invoices: invoicesQuery.data,
    count: invoicesCountQuery.data,
    supplier: supplierInvoicesQuery.data,
    rejected: rejectedInvoicesQuery.data,
    file: fileQuery.data,
    save: saveMutation.data,
    reset: resetMutation.data,
    retry: retryMutation.data,
    batch_status: batchStatusMutation.data,
  } as const;

  const errorMap = {
    status: statusQuery.error,
    invoices: invoicesQuery.error,
    count: invoicesCountQuery.error,
    supplier: supplierInvoicesQuery.error,
    rejected: rejectedInvoicesQuery.error,
    file: fileQuery.error,
    save: saveMutation.error,
    reset: resetMutation.error,
    retry: retryMutation.error,
    batch_status: batchStatusMutation.error,
  } as const;

  const liveResponse = responseSource ? responseMap[responseSource] ?? null : null;
  const liveError = responseSource ? errorMap[responseSource] ?? null : null;
  const liveResponseRecord = asRecord(liveResponse);
  const liveErrorRecord = liveError instanceof Error ? { message: liveError.message } : asRecord(liveError);
  const liveActionBatch = asIMSActionBatch(liveResponseRecord.action_batch);
  const normalizedIMSInvoices = liveResponse ? normalizeIMSInvoices(liveResponseRecord) : [];
  const normalizedIMSCountMetrics = responseSource === "count" && liveResponse ? normalizeIMSCountMetrics(liveResponseRecord) : [];
  const shouldShowInvoiceTable = Boolean(
    liveResponse && ["invoices", "supplier", "rejected", "file"].includes(responseSource ?? "") && normalizedIMSInvoices.length,
  );
  const actionState = getActionStateSummary(canWrite, selectedSession ?? null);
  const responseSummaryCards = liveResponse
    ? [
        { label: "Source", value: responseSource?.replace(/_/g, " ") ?? "Unavailable" },
        ...(liveActionBatch
          ? [
              { label: "Action batch", value: liveActionBatch.id },
              { label: "Batch status", value: liveActionBatch.status.replace(/_/g, " ") },
            ]
          : []),
        { label: "Status code", value: getStringField(liveResponseRecord, "status_cd", "status_code") || "Unavailable" },
        {
          label: "Provider status",
          value:
            getStringField(
              liveResponseRecord,
              "processing_status",
              "status",
              "provider_status",
              "request_type",
              "reqtyp",
            ) || "Unavailable",
        },
        { label: "Message", value: getStringField(liveResponseRecord, "message", "status_desc") || "Unavailable" },
        {
          label: "Transaction ID",
          value:
            liveActionBatch?.provider_transaction_id
            || getStringField(liveResponseRecord, "int_tran_id", "txn", "transaction_id")
            || "Unavailable",
        },
        {
          label: "Section",
          value: getStringField(liveResponseRecord, "section") || "Unavailable",
        },
        {
          label: "Invoice count",
          value:
            String(
              getArrayCount(liveResponseRecord, "invoices", "inv", "invdata")
              ?? getArrayCount(asRecord(liveResponseRecord.data), "invoices", "inv")
              ?? "0",
            ),
        },
        {
          label: "Token",
          value: getStringField(liveResponseRecord, "token") || "Unavailable",
        },
      ]
    : [];

  const isBusy =
    statusQuery.isFetching
    || invoicesQuery.isFetching
    || invoicesCountQuery.isFetching
    || supplierInvoicesQuery.isFetching
    || rejectedInvoicesQuery.isFetching
    || fileQuery.isFetching
    || saveMutation.isPending
    || resetMutation.isPending
    || retryMutation.isPending
    || batchStatusMutation.isPending;

  function ensureBaseFilters() {
    if (!baseFilters) {
      toast.error("Select a workspace, client, and GSTIN before using IMS.");
      return null;
    }
    return baseFilters;
  }

  function parseDraftPayload() {
    try {
      return JSON.parse(draftPayloadText) as Record<string, unknown>;
    } catch {
      toast.error("Draft payload must be valid JSON.");
      return null;
    }
  }

  async function handleSave() {
    const filters = ensureBaseFilters();
    if (!filters || !derivedRetPeriod) {
      toast.error("Return period is required for IMS save.");
      return;
    }
    const invdata = parseDraftPayload();
    if (!invdata) {
      return;
    }
    setResponseTitle("IMS save response");
    setResponseSource("save");
    try {
      await saveMutation.mutateAsync({
        ...filters,
        ret_period: derivedRetPeriod,
        invdata,
      });
      await actionBatchesQuery.refetch();
      toast.success("IMS save completed.");
    } catch {
      toast.error("IMS save failed.");
    }
  }

  async function handleReset() {
    const filters = ensureBaseFilters();
    if (!filters || !derivedRetPeriod) {
      toast.error("Return period is required for IMS reset.");
      return;
    }
    const invdata = parseDraftPayload();
    if (!invdata) {
      return;
    }
    setResponseTitle("IMS reset response");
    setResponseSource("reset");
    try {
      await resetMutation.mutateAsync({
        ...filters,
        ret_period: derivedRetPeriod,
        invdata,
      });
      await actionBatchesQuery.refetch();
      toast.success("IMS reset completed.");
    } catch {
      toast.error("IMS reset failed.");
    }
  }

  async function handleRetryActionBatch(batch: IMSActionBatchRecord) {
    const filters = ensureBaseFilters();
    if (!filters) {
      return;
    }
    setResponseTitle(`IMS ${batch.action_type} retry response`);
    setResponseSource("retry");
    try {
      await retryMutation.mutateAsync({
        ...filters,
        action_batch: batch.id,
      });
      await actionBatchesQuery.refetch();
      toast.success("IMS action batch retry submitted.");
    } catch {
      toast.error("IMS action batch retry failed.");
    }
  }

  async function handleRefreshActionBatchStatus(batch: IMSActionBatchRecord) {
    const filters = ensureBaseFilters();
    if (!filters) {
      return;
    }
    if (!batch.provider_transaction_id) {
      toast.error("Provider transaction ID is required before status refresh.");
      return;
    }
    setResponseTitle("IMS action batch status response");
    setResponseSource("batch_status");
    try {
      await batchStatusMutation.mutateAsync({
        ...filters,
        action_batch: batch.id,
      });
      await actionBatchesQuery.refetch();
      toast.success("IMS action batch status refreshed.");
    } catch {
      toast.error("IMS action batch status refresh failed.");
    }
  }

  if (contextLoading) {
    return <LoadingState message="Loading IMS context..." />;
  }

  if (!hasWorkspace || !hasClient || !hasGstin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="IMS"
          description="Review invoice management system data, supplier drill-downs, rejections, and controlled provider payloads."
        />
        <EmptyState
          title="Context required before IMS"
          description="Select a workspace, client, and GSTIN from the top bar so IMS can run against a real filing context."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="IMS"
        description="Manage IMS investigation, provider response checks, supplier and rejection drill-downs, and controlled draft actions from one supported operations surface."
      />

      <SectionCard
        title="IMS control posture"
        description="Use these signals to confirm whether the current context is ready for safe investigation or controlled provider write actions."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-sky-200 bg-sky-50/70 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Active context</p>
            <p className="mt-3 text-lg font-semibold text-slate-900">{selectedClient?.legal_name ?? "Unavailable"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">Running against {selectedGstin?.gstin ?? "the selected GSTIN"} for period {selectedPeriod?.period ?? "not set"}.</p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Session state</p>
            <p className="mt-3 text-lg font-semibold text-slate-900">{actionState.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{actionState.detail}</p>
          </div>
          <div className="rounded-3xl border border-violet-200 bg-violet-50/70 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Verified session</p>
            <p className="mt-3 text-lg font-semibold text-slate-900">{selectedSession?.email ?? "No session selected"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {selectedSession?.response_contract_confirmed ? "WhiteBooks session contract confirmed for this record." : "Session exists, but contract confirmation still needs review."}
            </p>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50/70 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Write action policy</p>
            <p className="mt-3 text-lg font-semibold text-slate-900">{canWrite ? "Save and reset available" : "Read-only mode"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">Draft save and reset remain controlled because they send live provider payloads for the selected filing context.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Live context & access"
        description="IMS always runs against the currently selected workspace, client, GSTIN, and usually the active period."
        action={
          <Button variant="outline" size="sm" onClick={() => authSessionsQuery.refetch()} disabled={authSessionsQuery.isFetching}>
            {authSessionsQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="ml-2">Refresh sessions</span>
          </Button>
        }
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Workspace</p>
            <p className="mt-2 font-semibold text-slate-900">{selectedWorkspace?.name ?? "Unavailable"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Client</p>
            <p className="mt-2 font-semibold text-slate-900">{selectedClient?.legal_name ?? "Unavailable"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">GSTIN</p>
            <p className="mt-2 font-semibold text-slate-900">{selectedGstin?.gstin ?? "Unavailable"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Return period</p>
            <div className="mt-2 space-y-2">
              <Select value={derivedRetPeriod} onValueChange={setRetPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose period" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((period) => (
                    <SelectItem key={period.id} value={toReturnPeriod(period.period)}>
                      {period.period} · {toReturnPeriod(period.period)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">WhiteBooks uses `MMYYYY` format for IMS period headers.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">WhiteBooks auth session</p>
            <p className="mt-1 text-sm text-slate-600">
              IMS requests can reuse the latest valid session automatically, but choosing one explicitly makes troubleshooting clearer.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Select value={effectiveSessionId || "none"} onValueChange={(value) => setSelectedSessionId(value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Use latest active session" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Use latest active session</SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.email} · {session.status.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={(selectedSession?.status ?? "missing").replace(/_/g, " ")}
                  variant={getSessionVariant(selectedSession?.status, selectedSession?.freshness_summary?.is_stale)}
                />
                {selectedSession?.response_contract_confirmed ? (
                  <StatusBadge label="contract confirmed" variant="success" />
                ) : (
                  <StatusBadge label="contract pending" variant="warning" />
                )}
              </div>
            </div>
            {selectedSession ? (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{selectedSession.email}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Txn</p>
                  <p className="mt-1 truncate text-sm font-medium text-slate-900">{selectedSession.txn || "Unavailable"}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Expires</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(selectedSession.freshness_summary?.expires_at)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No auth session is currently available. Read actions may still work with a manual `txn`, but save/reset normally need a fresh verified session.
              </div>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Manual txn override</p>
                <Input
                  value={manualTxn}
                  onChange={(event) => setManualTxn(event.target.value)}
                  placeholder="txn-ims-123"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Leave blank to use the selected auth session automatically.
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Manual email override</p>
                <Input
                  type="email"
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  placeholder="ims-ops@example.com"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Useful when support is replaying provider calls from a known mailbox context.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">Operator guidance</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>Read actions are safe for investigation and drill-down workflows.</li>
              <li>Save and reset send live provider payloads, so use them only with validated period context.</li>
              <li>Keep invoice section codes and return-type values aligned with WhiteBooks expectations.</li>
              <li>If the session is stale, refresh OTP from Returns or Filing access before retrying IMS.</li>
            </ul>
            {!canWrite ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                You can inspect IMS data, but save and reset remain disabled because this role does not have filing permission.
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="IMS actions" description="Choose the IMS task you need to run, then inspect the provider response below for the exact operational outcome.">
        <Tabs defaultValue="invoices" className="gap-5">
          <TabsList variant="line" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="supplier">Supplier</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="file">File</TabsTrigger>
            <TabsTrigger value="draft">Draft save/reset</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-4 rounded-2xl border border-slate-200 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Invoice bucket lookup</p>
                  <p className="mt-1 text-sm text-slate-600">Fetch the live IMS invoice list for a section and provider status.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Section</p>
                    <Input value={invoiceSection} onChange={(event) => setInvoiceSection(event.target.value.toUpperCase())} placeholder="B2B" />
                  </div>
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Status</p>
                    <Input value={invoiceStatus} onChange={(event) => setInvoiceStatus(event.target.value.toUpperCase())} placeholder="PENDING" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      const filters = ensureBaseFilters();
                      if (!filters) return;
                      setResponseTitle("IMS invoices response");
                      setResponseSource("invoices");
                      setInvoiceFilters({ ...filters, section: invoiceSection, status: invoiceStatus });
                    }}
                    disabled={isBusy}
                  >
                    <Search className="size-4" />
                    <span className="ml-2">Fetch invoices</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const filters = ensureBaseFilters();
                      if (!filters) return;
                      setResponseTitle("IMS invoice count response");
                      setResponseSource("count");
                      setCountFilters({ ...filters, goods_type: goodsType });
                    }}
                    disabled={isBusy}
                  >
                    <FileJson2 className="size-4" />
                    <span className="ml-2">Fetch count</span>
                  </Button>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Goods type for count</p>
                  <Input value={goodsType} onChange={(event) => setGoodsType(event.target.value.toUpperCase())} placeholder="GOODS" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">When to use this</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <li>Verify which invoice bucket WhiteBooks currently exposes for a GSTIN.</li>
                  <li>Confirm whether a section is empty because of filters or because upstream data is missing.</li>
                  <li>Use count before heavy drill-down when you only need a quick signal.</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="supplier">
            <div className="space-y-4 rounded-2xl border border-slate-200 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Supplier invoice drill-down</p>
                <p className="mt-1 text-sm text-slate-600">Inspect supplier-side invoice material for a specific section and return type.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Return period</p>
                    <Input value={derivedRetPeriod} onChange={(event) => setRetPeriod(event.target.value)} placeholder="042026" />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Section</p>
                  <Input value={supplierSection} onChange={(event) => setSupplierSection(event.target.value.toUpperCase())} placeholder="B2B" />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Return type</p>
                  <Input value={supplierReturnType} onChange={(event) => setSupplierReturnType(event.target.value.toUpperCase())} placeholder="GSTR1" />
                </div>
              </div>
              <Button
                onClick={() => {
                  const filters = ensureBaseFilters();
                  if (!filters || !derivedRetPeriod) {
                    toast.error("Return period is required.");
                    return;
                  }
                  setResponseTitle("IMS supplier invoices response");
                  setResponseSource("supplier");
                  setSupplierFilters({ ...filters, ret_period: derivedRetPeriod, section: supplierSection, rtn_type: supplierReturnType });
                }}
                disabled={isBusy}
              >
                <Search className="size-4" />
                <span className="ml-2">Fetch supplier invoices</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="rejected">
            <div className="space-y-4 rounded-2xl border border-slate-200 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Rejected invoice drill-down</p>
                <p className="mt-1 text-sm text-slate-600">Review rejected invoice segments for the selected filing context and section.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Return period</p>
                    <Input value={derivedRetPeriod} onChange={(event) => setRetPeriod(event.target.value)} placeholder="042026" />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Section</p>
                  <Input value={rejectedSection} onChange={(event) => setRejectedSection(event.target.value.toUpperCase())} placeholder="B2B" />
                </div>
              </div>
              <Button
                onClick={() => {
                  const filters = ensureBaseFilters();
                  if (!filters || !derivedRetPeriod) {
                    toast.error("Return period is required.");
                    return;
                  }
                  setResponseTitle("IMS rejected invoices response");
                  setResponseSource("rejected");
                  setRejectedFilters({ ...filters, ret_period: derivedRetPeriod, section: rejectedSection });
                }}
                disabled={isBusy}
              >
                <Search className="size-4" />
                <span className="ml-2">Fetch rejected invoices</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="status">
            <div className="space-y-4 rounded-2xl border border-slate-200 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Transaction status lookup</p>
                <p className="mt-1 text-sm text-slate-600">Use this when WhiteBooks gives you an `int_tran_id` and you need the latest provider state.</p>
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Internal transaction ID</p>
                <Input value={statusTranId} onChange={(event) => setStatusTranId(event.target.value)} placeholder="ims-int-001" />
              </div>
              <Button
                onClick={() => {
                  const filters = ensureBaseFilters();
                  if (!filters || !statusTranId.trim()) {
                    toast.error("Internal transaction ID is required.");
                    return;
                  }
                  setResponseTitle("IMS status response");
                  setResponseSource("status");
                  setStatusFilters({ ...filters, int_tran_id: statusTranId.trim() });
                }}
                disabled={isBusy}
              >
                <Search className="size-4" />
                <span className="ml-2">Fetch status</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="file">
            <div className="space-y-4 rounded-2xl border border-slate-200 px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Provider file retrieval</p>
                <p className="mt-1 text-sm text-slate-600">Fetch the WhiteBooks file payload using a provider-issued token.</p>
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">File token</p>
                <Input value={fileToken} onChange={(event) => setFileToken(event.target.value)} placeholder="provider-file-token" />
              </div>
              <Button
                onClick={() => {
                  const filters = ensureBaseFilters();
                  if (!filters || !fileToken.trim()) {
                    toast.error("File token is required.");
                    return;
                  }
                  setResponseTitle("IMS file response");
                  setResponseSource("file");
                  setFileFilters({ ...filters, token: fileToken.trim() });
                }}
                disabled={isBusy}
              >
                <Search className="size-4" />
                <span className="ml-2">Fetch file</span>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="draft">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="space-y-4 rounded-2xl border border-slate-200 px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Draft payload editor</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Use valid JSON only. The screen sends `reqtyp` automatically, so paste only the `invdata` object here.
                  </p>
                </div>
                <Textarea
                  value={draftPayloadText}
                  onChange={(event) => setDraftPayloadText(event.target.value)}
                  className="min-h-[320px] font-mono text-xs"
                  spellCheck={false}
                />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleSave} disabled={!canWrite || isBusy}>
                    {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    <span className="ml-2">Save IMS draft</span>
                  </Button>
                  <Button variant="outline" onClick={handleReset} disabled={!canWrite || isBusy}>
                    {resetMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    <span className="ml-2">Reset IMS draft</span>
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 px-4 py-4">
                <p className="text-sm font-semibold text-slate-900">Safe usage notes</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <li>Do not paste full request envelopes from Postman. This editor expects only the `invdata` portion.</li>
                  <li>The page injects the selected GSTIN as `rtin` and `SAVE` or `RESET` as `reqtyp`.</li>
                  <li>Keep return period aligned with the active compliance period unless you are intentionally troubleshooting another month.</li>
                  <li>When a session is stale or OTP is not verified, WhiteBooks may reject the write call even if the JSON is valid.</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SectionCard>

      <SectionCard
        title="Recent IMS action batches"
        description="Local save/reset evidence for the selected context, including provider transaction IDs and payload hashes for recovery."
        action={
          <Button variant="outline" size="sm" onClick={() => actionBatchesQuery.refetch()} disabled={actionBatchesQuery.isFetching}>
            {actionBatchesQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="ml-2">Refresh batches</span>
          </Button>
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Action</p>
            <Select value={actionBatchActionFilter} onValueChange={setActionBatchActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="save">Save</SelectItem>
                <SelectItem value="reset">Reset</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
            <Select value={actionBatchStatusFilter} onValueChange={setActionBatchStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {actionBatchesQuery.isLoading ? <LoadingState message="Loading IMS action batches..." /> : null}
        {!actionBatchesQuery.isLoading && recentActionBatches.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {recentActionBatches.map((batch) => (
              <div key={batch.id} className="rounded-lg border border-slate-200 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{batch.action_type.toUpperCase()} · {batch.ret_period}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">{batch.id}</p>
                  </div>
                  <StatusBadge
                    label={batch.status.replace(/_/g, " ")}
                    variant={getActionBatchStatusVariant(batch.status)}
                  />
                </div>
                <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Provider transaction</p>
                    <p className="mt-1 break-all font-medium text-slate-900">{batch.provider_transaction_id || "Pending"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Completed</p>
                    <p className="mt-1 font-medium text-slate-900">{formatDateTime(batch.completed_at)}</p>
                  </div>
                </div>
                <p className="mt-3 break-all text-xs text-slate-500">Payload hash: {batch.request_payload_hash || "Unavailable"}</p>
                {batch.error_message ? (
                  <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{batch.error_message}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefreshActionBatchStatus(batch)}
                    disabled={!batch.provider_transaction_id || batchStatusMutation.isPending}
                  >
                    {batchStatusMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    <span className="ml-2">Refresh status</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRetryActionBatch(batch)}
                    disabled={!canWrite || batch.status !== "failed" || retryMutation.isPending}
                  >
                    {retryMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    <span className="ml-2">Retry batch</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!actionBatchesQuery.isLoading && recentActionBatches.length === 0 ? (
          <EmptyState
            title="No IMS action batches yet"
            description="Run a save or reset action to create local provider evidence for this context."
          />
        ) : null}
      </SectionCard>

      <SectionCard title={responseTitle} description="Raw provider response for the latest IMS action so operations and QA can inspect the exact payload returned.">
        {isBusy ? <LoadingState message="Waiting for IMS response..." /> : null}
        {liveError ? <ErrorState title="IMS request failed" description={getStringField(liveErrorRecord, "message") || "The IMS request failed."} /> : null}
        {!isBusy && !liveError && liveResponse ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {responseSummaryCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
                  <p className="mt-2 break-words text-sm font-semibold text-slate-900">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-slate-900">Provider outcome</p>
                <StatusBadge
                  label={getStringField(liveResponseRecord, "status_cd", "status_code") || "unknown"}
                  variant={getStatusVariantFromPayload(liveResponseRecord)}
                />
                {getStringField(liveResponseRecord, "processing_status", "provider_status", "status") ? (
                  <StatusBadge
                    label={getStringField(liveResponseRecord, "processing_status", "provider_status", "status")}
                    variant="primary"
                  />
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {getStringField(liveResponseRecord, "message", "status_desc")
                  || getNestedErrorMessage(liveResponseRecord)
                  || "The provider returned a response without a display-ready message. Use the debug payload below for exact fields."}
              </p>
            </div>

            {liveActionBatch ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold text-slate-900">IMS action batch evidence</p>
                  <StatusBadge
                    label={liveActionBatch.status.replace(/_/g, " ")}
                    variant={getActionBatchStatusVariant(liveActionBatch.status)}
                  />
                  <StatusBadge label={liveActionBatch.action_type} variant="primary" />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-700">Batch ID</p>
                    <p className="mt-1 break-all text-sm font-medium text-slate-900">{liveActionBatch.id}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-700">Provider transaction</p>
                    <p className="mt-1 break-all text-sm font-medium text-slate-900">
                      {liveActionBatch.provider_transaction_id || "Pending"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-emerald-700">Completed</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(liveActionBatch.completed_at)}</p>
                  </div>
                </div>
                <p className="mt-3 break-all text-xs text-emerald-900">
                  Payload hash: {liveActionBatch.request_payload_hash || "Unavailable"}
                </p>
                {liveActionBatch.error_message ? (
                  <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    {liveActionBatch.error_message}
                  </p>
                ) : null}
              </div>
            ) : null}

            {normalizedIMSCountMetrics.length > 0 ? (
              <div className="rounded-lg border border-slate-200 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Normalized IMS count summary</p>
                  <StatusBadge label={`${normalizedIMSCountMetrics.length} metric(s)`} variant="neutral" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {normalizedIMSCountMetrics.map((metric) => (
                    <div key={metric.key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
                      <p className="mt-2 break-words text-lg font-semibold text-slate-900">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {shouldShowInvoiceTable ? (
              <div className="rounded-lg border border-slate-200 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Normalized IMS invoice table</p>
                  <StatusBadge label={`${normalizedIMSInvoices.length} row(s)`} variant="neutral" />
                </div>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Supplier GSTIN</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Invoice value</TableHead>
                        <TableHead>Taxable value</TableHead>
                        <TableHead>Tax amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {normalizedIMSInvoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium text-slate-900">{invoice.supplierGstin}</TableCell>
                          <TableCell>{invoice.invoiceNumber}</TableCell>
                          <TableCell>{invoice.invoiceDate}</TableCell>
                          <TableCell>{invoice.section}</TableCell>
                          <TableCell>{invoice.status}</TableCell>
                          <TableCell>{invoice.value}</TableCell>
                          <TableCell>{invoice.taxableValue}</TableCell>
                          <TableCell>{invoice.taxAmount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}

            {liveResponseRecord.error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                <p className="text-sm font-semibold text-rose-900">Provider error details</p>
                <p className="mt-2 text-sm leading-6 text-rose-800">
                  {getNestedErrorMessage(liveResponseRecord) || "An error object is present in the provider payload."}
                </p>
                {getStringField(asRecord(liveResponseRecord.error), "error_cd", "code") ? (
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-rose-700">
                    Code: {getStringField(asRecord(liveResponseRecord.error), "error_cd", "code")}
                  </p>
                ) : null}
              </div>
            ) : null}

            <details className="rounded-2xl border border-slate-200 bg-slate-950 text-slate-100">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
                Debug payload
              </summary>
              <pre className="overflow-x-auto border-t border-slate-800 px-4 py-4 text-xs leading-6 text-slate-100">
                {prettyJson(liveResponse)}
              </pre>
            </details>
          </div>
        ) : null}
        {!isBusy && !liveError && !liveResponse ? (
          <EmptyState
            title="No IMS response yet"
            description="Run any action above to inspect the live provider payload and verify IMS behavior for the selected context."
          />
        ) : null}
      </SectionCard>
    </div>
  );
}
