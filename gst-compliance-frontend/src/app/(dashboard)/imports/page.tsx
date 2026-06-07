"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileEdit,
  FileJson2,
  FileSearch2,
  FileUp,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalHeader } from "@/components/common/app-modal";
import { SectionCard } from "@/components/common/section-card";
import { FileUploadDropzone } from "@/components/forms/file-upload-dropzone";
import { StatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateImportTemplateMutation,
  useDiscardImportBatchMutation,
  useCorrectImportRowMutation,
  useDiscardImportRowMutation,
  useDeleteImportTemplateMutation,
  useImportBatchCorrectionPolicyQuery,
  useImportBatchErrorsQuery,
  useImportBatchImpactSummaryQuery,
  useImportBatchQuery,
  useImportBatchesQuery,
  useImportTemplatesQuery,
  useReprocessImportBatchMutation,
  useReplaceImportBatchMutation,
  useUpdateImportTemplateMutation,
  useUploadImportBatchMutation,
} from "@/features/imports";
import { downloadFile } from "@/lib/api/download";
import { getErrorMessage, normalizeApiError } from "@/lib/api/error-handler";
import { buildHeaderSuggestions, parseHeadersFromFile, type TemplateMappingField } from "@/lib/imports/header-detection";
import { useWorkspaceContext } from "@/store/workspace-context";
import type {
  ImportBatchCorrectionPolicyRecord,
  ImportBatchRecord,
  ImportImpactSummaryRecord,
  ImportRowErrorRecord,
  ImportTemplateRecord,
} from "@/types/api";

const importTypeOptions: Array<{ value: ImportBatchRecord["import_type"]; label: string }> = [
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
  { value: "tds_deducted", label: "TDS Deducted" },
  { value: "advance_received", label: "Advance Received" },
  { value: "advance_adjusted", label: "Advance Adjusted" },
  { value: "gstr_2b", label: "GSTR-2B" },
];

const sourceTypeOptions: Array<{ value: ImportBatchRecord["source_type"]; label: string }> = [
  { value: "csv", label: "CSV" },
  { value: "excel", label: "Excel (.xlsx)" },
];

const mappingFields = [
  "document_number",
  "document_date",
  "counterparty_gstin",
  "counterparty_name",
  "taxable_value",
  "cgst_amount",
  "sgst_amount",
  "igst_amount",
  "cess_amount",
  "total_amount",
  "place_of_supply",
  "reverse_charge",
  "document_type",
  "hsn_code",
  "description",
  "uqc",
  "quantity",
  "is_service",
  "supply_category",
  "ecommerce_gstin",
] as const;

type MappingField = TemplateMappingField;

const requiredMappingFields: MappingField[] = ["document_number", "document_date", "taxable_value", "total_amount"];

const requiredFieldSet = new Set<MappingField>(requiredMappingFields);

const fieldLabels: Record<MappingField, string> = {
  document_number: "Document number",
  document_date: "Document date",
  counterparty_gstin: "Counterparty GSTIN",
  counterparty_name: "Counterparty name",
  taxable_value: "Taxable value",
  cgst_amount: "CGST amount",
  sgst_amount: "SGST amount",
  igst_amount: "IGST amount",
  cess_amount: "Cess amount",
  total_amount: "Total amount",
  place_of_supply: "Place of supply",
  reverse_charge: "Reverse charge",
  document_type: "Document type",
  hsn_code: "HSN / SAC code",
  description: "Item description",
  uqc: "UQC / unit code",
  quantity: "Quantity",
  is_service: "Is service",
  supply_category: "Supply category",
  ecommerce_gstin: "E-commerce GSTIN",
};

const fieldHints: Partial<Record<MappingField, string>> = {
  hsn_code: "Improves HSN summaries and section-level filing accuracy.",
  description: "Useful for downstream review and richer HSN grouping.",
  uqc: "Examples: NOS, KGS, MTR.",
  quantity: "Used in HSN summaries and item-level reporting.",
  is_service: "Map a column that marks service rows as yes/true/1.",
  supply_category: "Examples: taxable, nil_rated, exempt, non_gst.",
  ecommerce_gstin: "Useful for operator/e-commerce reporting sections.",
};

const periodExceptionOptions = [
  { value: "late_reported_invoice", label: "Late reported invoice" },
  { value: "amendment_adjustment", label: "Amendment / adjustment" },
  { value: "credit_debit_note_linkage", label: "Credit / debit note linkage" },
  { value: "ca_manual_override", label: "CA manual override" },
] as const;

const filingMetadataFields: MappingField[] = ["hsn_code", "uqc", "quantity", "is_service", "supply_category", "ecommerce_gstin"];

const mappingSections: Array<{
  title: string;
  description: string;
  fields: MappingField[];
}> = [
  {
    title: "Core document fields",
    description: "Required to identify, date, and normalize every source document.",
    fields: ["document_number", "document_date", "counterparty_gstin", "counterparty_name", "document_type"],
  },
  {
    title: "Tax amounts",
    description: "Used for transaction normalization, return summaries, and reconciliation.",
    fields: ["taxable_value", "cgst_amount", "sgst_amount", "igst_amount", "cess_amount", "total_amount"],
  },
  {
    title: "Filing metadata",
    description: "Improves workbook accuracy for HSN, nil/exempt, service, and e-commerce sections.",
    fields: ["place_of_supply", "reverse_charge", "hsn_code", "description", "uqc", "quantity", "is_service", "supply_category", "ecommerce_gstin"],
  },
];

const emptyTemplateForm = {
  name: "",
  is_default: false,
  column_mapping: Object.fromEntries(mappingFields.map((field) => [field, ""])) as Record<MappingField, string>,
};

function getStatusVariant(status: ImportBatchRecord["status"]) {
  if (status === "processed") return "success" as const;
  if (status === "failed") return "danger" as const;
  if (status === "processing" || status === "queued") return "warning" as const;
  return "primary" as const;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Pending";
  return format(new Date(value), "dd MMM yyyy, h:mm a");
}

function getCorrectionStatusVariant(policy: ImportBatchCorrectionPolicyRecord | ImportBatchRecord["correction_summary"] | null | undefined) {
  if (!policy) return "neutral" as const;
  if (policy.is_locked_by_filing) return "danger" as const;
  if (policy.requires_reconciliation_rerun || policy.requires_return_refresh) return "warning" as const;
  if (policy.has_downstream_dependencies) return "primary" as const;
  return "success" as const;
}

function getCorrectionStatusLabel(policy: ImportBatchCorrectionPolicyRecord | ImportBatchRecord["correction_summary"] | null | undefined) {
  if (!policy) return null;
  if (policy.is_locked_by_filing) return "locked by filing";
  if (policy.requires_reconciliation_rerun) return "rerun reconciliation";
  if (policy.requires_return_refresh) return "refresh return draft";
  if (policy.has_downstream_dependencies) return "downstream linked";
  return "correction ready";
}

function getImpactSeverityVariant(severity: ImportImpactSummaryRecord["severity"] | undefined) {
  if (severity === "danger") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  if (severity === "success") return "success" as const;
  return "primary" as const;
}

function getImpactSeverityIcon(severity: ImportImpactSummaryRecord["severity"] | undefined) {
  if (severity === "danger") return ShieldAlert;
  if (severity === "warning") return AlertTriangle;
  if (severity === "success") return CheckCircle2;
  return Circle;
}

function getImpactActionIcon(actionKey: string) {
  if (actionKey === "edit_rows") return FileEdit;
  if (actionKey === "replace_file") return FileUp;
  if (actionKey === "reprocess") return RefreshCw;
  return Circle;
}

function inferImportTypeFromFileName(fileName: string): ImportBatchRecord["import_type"] | null {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("gstr") && normalized.includes("2b")) return "gstr_2b";
  if (normalized.includes("tds") || normalized.includes("gstr7")) return "tds_deducted";
  if (normalized.includes("advance") && (normalized.includes("adjust") || normalized.includes("adjusted") || normalized.includes("txpd"))) {
    return "advance_adjusted";
  }
  if (normalized.includes("advance") && (normalized.includes("receipt") || normalized.includes("received") || normalized.includes("voucher") || normalized.includes("11a"))) {
    return "advance_received";
  }
  if (normalized.includes("credit") && normalized.includes("note")) return "credit_note";
  if (normalized.includes("debit") && normalized.includes("note")) return "debit_note";
  if (normalized.includes("sales")) return "sales";
  if (normalized.includes("purchase")) return "purchase";
  return null;
}

function ImportStepCard({
  title,
  description,
  complete,
}: {
  title: string;
  description: string;
  complete: boolean;
}) {
  return (
    <div className="surface-card flex items-start gap-3 px-4 py-4">
      <div
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl ring-1 ${
          complete
            ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
            : "bg-slate-50 text-slate-400 ring-slate-200"
        }`}
      >
        {complete ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </div>
  );
}

export default function ImportsPage() {
  const {
    selectedWorkspace,
    selectedWorkspaceId,
    selectedClient,
    selectedClientId,
    selectedGstin,
    selectedGstinId,
    selectedPeriod,
    selectedPeriodId,
  } = useWorkspaceContext();
  const [importType, setImportType] = useState<ImportBatchRecord["import_type"]>("purchase");
  const [sourceType, setSourceType] = useState<ImportBatchRecord["source_type"]>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ImportTemplateRecord | null>(null);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateSubmitAttempted, setTemplateSubmitAttempted] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [headerDetectionError, setHeaderDetectionError] = useState<string | null>(null);
  const [isDetectingHeaders, setIsDetectingHeaders] = useState(false);
  const [rowCorrectionTarget, setRowCorrectionTarget] = useState<ImportRowErrorRecord | null>(null);
  const [rowCorrectionDraft, setRowCorrectionDraft] = useState<Record<string, string>>({});
  const [rowCorrectionSubmitAttempted, setRowCorrectionSubmitAttempted] = useState(false);
  const [allowPeriodException, setAllowPeriodException] = useState(false);
  const [periodExceptionReason, setPeriodExceptionReason] = useState("");
  const [periodExceptionCategory, setPeriodExceptionCategory] = useState<string>(periodExceptionOptions[0].value);
  const [rowDiscardTarget, setRowDiscardTarget] = useState<ImportRowErrorRecord | null>(null);
  const [batchDiscardTarget, setBatchDiscardTarget] = useState<ImportBatchRecord | null>(null);
  const [batchReplacementTarget, setBatchReplacementTarget] = useState<ImportBatchRecord | null>(null);
  const [batchReprocessTarget, setBatchReprocessTarget] = useState<ImportBatchRecord | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);

  const filters = useMemo(
    () => ({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      compliance_period: selectedPeriodId,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );

  const batchesQuery = useImportBatchesQuery(filters);
  const selectedBatchQuery = useImportBatchQuery(selectedBatchId ?? undefined);
  const errorsQuery = useImportBatchErrorsQuery(selectedBatchId ?? undefined);
  const correctionPolicyQuery = useImportBatchCorrectionPolicyQuery(selectedBatchId ?? undefined);
  const impactSummaryQuery = useImportBatchImpactSummaryQuery(selectedBatchId ?? undefined);
  const templateFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId,
      import_type: importType,
      source_type: sourceType,
    }),
    [selectedWorkspaceId, importType, sourceType],
  );
  const templatesQuery = useImportTemplatesQuery(templateFilters);
  const uploadMutation = useUploadImportBatchMutation(filters);
  const discardImportBatchMutation = useDiscardImportBatchMutation(filters);
  const replaceImportBatchMutation = useReplaceImportBatchMutation(filters);
  const reprocessImportBatchMutation = useReprocessImportBatchMutation(filters);
  const correctImportRowMutation = useCorrectImportRowMutation(filters);
  const discardImportRowMutation = useDiscardImportRowMutation(filters);
  const createTemplateMutation = useCreateImportTemplateMutation(templateFilters);
  const updateTemplateMutation = useUpdateImportTemplateMutation(templateFilters, editingTemplate?.id);
  const deleteTemplateMutation = useDeleteImportTemplateMutation(templateFilters);

  const isPeriodLocked = Boolean(selectedPeriod?.is_locked);
  const canUpload = Boolean(selectedWorkspaceId && selectedClientId && selectedPeriodId && file && !isPeriodLocked);
  const templates = templatesQuery.data?.items ?? [];
  const impactSummary = impactSummaryQuery.data ?? null;
  const isTemplateSubmitting = createTemplateMutation.isPending || updateTemplateMutation.isPending;
  const templateNameError = !templateForm.name.trim() ? "Template name is required." : null;
  const templateMappingErrors = Object.fromEntries(
    requiredMappingFields.map((field) => [
      field,
      templateForm.column_mapping[field].trim() ? null : `${fieldLabels[field]} is required.`,
    ]),
  ) as Record<MappingField, string | null>;
  const hasTemplateErrors =
    Boolean(templateNameError) || requiredMappingFields.some((field) => Boolean(templateMappingErrors[field]));
  const hasTemplateContent =
    Boolean(templateForm.name.trim()) ||
    templateForm.is_default ||
    Object.values(templateForm.column_mapping).some((value) => value.trim().length > 0);
  const isTemplateDirty = Boolean(
    editingTemplate ||
      hasTemplateContent,
  );
  const mappingPreview = useMemo(
    () =>
      JSON.stringify(
        Object.fromEntries(Object.entries(templateForm.column_mapping).filter(([, value]) => value.trim())),
        null,
        2,
      ),
    [templateForm.column_mapping],
  );
  const filingMetadataWarnings = useMemo(
    () => filingMetadataFields.filter((field) => !templateForm.column_mapping[field]?.trim()),
    [templateForm.column_mapping],
  );
  const headerSuggestions = useMemo(() => buildHeaderSuggestions(detectedHeaders), [detectedHeaders]);

  const handleFileSelect = (nextFile: File) => {
    setFile(nextFile);
    setDetectedHeaders([]);
    setHeaderDetectionError(null);
    setIsDetectingHeaders(false);
  };

  useEffect(() => {
    let isActive = true;

    async function detectHeaders(nextFile: File) {
      setIsDetectingHeaders(true);
      setHeaderDetectionError(null);

      try {
        const headers = await parseHeadersFromFile(nextFile);
        if (!isActive) {
          return;
        }
        setDetectedHeaders(headers);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setDetectedHeaders([]);
        setHeaderDetectionError(error instanceof Error ? error.message : "We could not read headers from this file.");
      } finally {
        if (isActive) {
          setIsDetectingHeaders(false);
        }
      }
    }

    if (!file) {
      return () => {
        isActive = false;
      };
    }

    void detectHeaders(file);

    return () => {
      isActive = false;
    };
  }, [file]);

  const resetTemplateForm = () => {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateSubmitAttempted(false);
  };

  const openCreateTemplateDialog = () => {
    resetTemplateForm();
    if (detectedHeaders.length > 0) {
      setTemplateForm({
        name: "",
        is_default: false,
        column_mapping: {
          ...emptyTemplateForm.column_mapping,
          ...buildHeaderSuggestions(detectedHeaders),
        },
      });
    }
    setIsTemplateDialogOpen(true);
  };

  const openEditTemplateDialog = (template: ImportTemplateRecord) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      is_default: template.is_default,
      column_mapping: {
        ...emptyTemplateForm.column_mapping,
        ...template.column_mapping,
      },
    });
    setIsTemplateDialogOpen(true);
  };

  const handleTemplateDialogChange = (open: boolean) => {
    if (open) {
      setIsTemplateDialogOpen(true);
      return;
    }

    if (isTemplateDirty && !isTemplateSubmitting && !window.confirm("Discard the current mapping changes?")) {
      return;
    }

    setIsTemplateDialogOpen(false);
    resetTemplateForm();
  };

  const handleUpload = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId || !file) {
      const message = "Select workspace, client, period, and a file before uploading.";
      setUploadError(message);
      toast.error(message);
      return;
    }
    if (isPeriodLocked) {
      const message = "This compliance period is locked. Unlock it before uploading data.";
      setUploadError(message);
      toast.error(message);
      return;
    }
    const inferredImportType = inferImportTypeFromFileName(file.name);
    if (inferredImportType && inferredImportType !== importType) {
      const message = `This file name looks like ${inferredImportType.replace("_", " ")} data, but the selected import type is ${importType.replace("_", " ")}. Please switch the import type before uploading.`;
      setUploadError(message);
      toast.error(message);
      return;
    }

    try {
      setUploadError(null);
      const batch = await uploadMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId,
        import_template: selectedTemplateId ?? undefined,
        compliance_period: selectedPeriodId,
        import_type: importType,
        source_type: sourceType,
        file,
      });
      setSelectedBatchId(batch.id);
      setFile(null);
      setDetectedHeaders([]);
      setHeaderDetectionError(null);
      setIsDetectingHeaders(false);
      toast.success("Import batch uploaded and processed.");
    } catch (error) {
      const normalized = normalizeApiError(error);
      setUploadError(normalized.message);
      toast.error(normalized.message);
    }
  };

  const handleTemplateSubmit = async () => {
    setTemplateSubmitAttempted(true);
    if (!selectedWorkspaceId) {
      toast.error("Select a workspace before saving a template.");
      return;
    }
    if (hasTemplateErrors) {
      toast.error("Complete the required template details before saving.");
      return;
    }

    const cleanedMapping = Object.fromEntries(
      Object.entries(templateForm.column_mapping).filter(([, value]) => value.trim()),
    );

    try {
      if (editingTemplate) {
        await updateTemplateMutation.mutateAsync({
          name: templateForm.name,
          is_default: templateForm.is_default,
          column_mapping: cleanedMapping,
        });
        toast.success("Import template updated.");
      } else {
        const template = await createTemplateMutation.mutateAsync({
          name: templateForm.name,
          workspace: selectedWorkspaceId,
          import_type: importType,
          source_type: sourceType,
          column_mapping: cleanedMapping,
          is_default: templateForm.is_default,
        });
        setSelectedTemplateId(template.id);
        toast.success("Import template saved.");
      }
      setIsTemplateDialogOpen(false);
      resetTemplateForm();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleTemplateDelete = async (templateId: string) => {
    try {
      await deleteTemplateMutation.mutateAsync(templateId);
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
      }
      toast.success("Import template deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const selectedBatch = selectedBatchQuery.data;
  const correctionPolicy = correctionPolicyQuery.data;
  const rowErrors = useMemo(() => errorsQuery.data?.items ?? [], [errorsQuery.data?.items]);
  const contextReady = Boolean(selectedWorkspaceId && selectedClientId && selectedPeriodId);
  const templateReady = Boolean(selectedTemplateId || detectedHeaders.length > 0);
  const batches = batchesQuery.data?.items ?? [];
  const processedBatchCount = batches.filter((batch) => batch.status === "processed").length;
  const invalidRowTotal = batches.reduce((count, batch) => count + (batch.invalid_rows ?? 0), 0);
  const latestBatch = batches[0] ?? null;
  const transactionCount = selectedBatch?.transaction_count ?? latestBatch?.transaction_count ?? 0;
  const batchesRequiringRerun = batches.filter((batch) => batch.correction_summary?.requires_reconciliation_rerun).length;
  const filingLockedBatchCount = batches.filter((batch) => batch.correction_summary?.is_locked_by_filing).length;
  const selectedBatchHasOnlyInvalidRows = Boolean(
    selectedBatch &&
      selectedBatch.total_rows > 0 &&
      selectedBatch.valid_rows === 0 &&
      selectedBatch.invalid_rows === selectedBatch.total_rows,
  );
  const showInvalidOnlyWarning =
    selectedBatchHasOnlyInvalidRows && Boolean(correctionPolicy) && !correctionPolicy?.warning_message;
  const rowCorrectionEntries = useMemo(() => Object.entries(rowCorrectionDraft), [rowCorrectionDraft]);
  const rowCorrectionNeedsPeriodException = rowCorrectionTarget?.error_code === "period_mismatch";
  const lineageDetails = useMemo(() => {
    if (!selectedBatch) {
      return [];
    }
    const details: Array<{ label: string; value: string; hint?: string }> = [];
    if (selectedBatch.supersedes_batch) {
      details.push({
        label: "Replacement of",
        value: selectedBatch.supersedes_batch.slice(0, 8),
        hint: "This batch is now the active version for the same import context.",
      });
    }
    if (selectedBatch.superseded_by) {
      details.push({
        label: "Superseded by",
        value: selectedBatch.superseded_by.slice(0, 8),
        hint: "Use the newer replacement batch for review, reconciliation, and returns.",
      });
    }
    if (selectedBatch.status === "discarded") {
      details.push({
        label: "Terminal state",
        value: "Discarded from active workflow",
        hint: "This batch remains in audit history but should no longer be used operationally.",
      });
    }
    return details;
  }, [selectedBatch]);

  const handleExportErrors = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId || !selectedBatchId) {
      toast.error("Select a batch in the active context before exporting import errors.");
      return;
    }
    try {
      await downloadFile(
        "/exports/import-errors/",
        {
          workspace: selectedWorkspaceId,
          client: selectedClientId,
          gstin: selectedGstinId ?? undefined,
          compliance_period: selectedPeriodId,
          import_batch: selectedBatchId,
        },
        "import-errors.xlsx",
      );
      toast.success("Import errors export downloaded.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openRowCorrectionDialog = (error: ImportRowErrorRecord) => {
    if (!correctionPolicy?.can_edit_rows) {
      toast.error(correctionPolicy?.warning_message || "Row correction is not available for this batch.");
      return;
    }
    setRowCorrectionTarget(error);
    setRowCorrectionDraft(
      Object.fromEntries(
        Object.entries(error.raw_row ?? {}).map(([key, value]) => [key, String(value ?? "")]),
      ),
    );
    setRowCorrectionSubmitAttempted(false);
    setAllowPeriodException(error.error_code === "period_mismatch");
    setPeriodExceptionReason("");
    setPeriodExceptionCategory(periodExceptionOptions[0].value);
  };

  const closeRowCorrectionDialog = () => {
    setRowCorrectionTarget(null);
    setRowCorrectionDraft({});
    setRowCorrectionSubmitAttempted(false);
    setAllowPeriodException(false);
    setPeriodExceptionReason("");
    setPeriodExceptionCategory(periodExceptionOptions[0].value);
  };

  const openRowDiscardDialog = (error: ImportRowErrorRecord) => {
    if (!correctionPolicy?.can_discard_rows) {
      toast.error(correctionPolicy?.warning_message || "Row discard is not available for this batch.");
      return;
    }
    setRowDiscardTarget(error);
  };

  const closeRowDiscardDialog = () => {
    setRowDiscardTarget(null);
  };

  const openBatchDiscardDialog = (batch: ImportBatchRecord) => {
    if (!batch.correction_summary?.next_required_action && correctionPolicy && selectedBatchId === batch.id && !correctionPolicy.can_discard_batch) {
      toast.error(correctionPolicy.warning_message || "Batch discard is not available for this batch.");
      return;
    }
    setBatchDiscardTarget(batch);
  };

  const closeBatchDiscardDialog = () => {
    setBatchDiscardTarget(null);
  };

  const openBatchReplacementDialog = (batch: ImportBatchRecord) => {
    setBatchReplacementTarget(batch);
    setReplacementFile(null);
  };

  const closeBatchReplacementDialog = () => {
    setBatchReplacementTarget(null);
    setReplacementFile(null);
  };

  const openBatchReprocessDialog = (batch: ImportBatchRecord) => {
    setBatchReprocessTarget(batch);
  };

  const closeBatchReprocessDialog = () => {
    setBatchReprocessTarget(null);
  };

  const handleRowCorrectionFieldChange = (field: string, value: string) => {
    setRowCorrectionDraft((current) => ({ ...current, [field]: value }));
  };

  const handleApplyRowCorrection = async () => {
    if (!selectedBatchId || !rowCorrectionTarget) {
      return;
    }
    setRowCorrectionSubmitAttempted(true);
    if (rowCorrectionEntries.length === 0) {
      toast.error("Add corrected row values before reprocessing the batch.");
      return;
    }
    if (rowCorrectionNeedsPeriodException && allowPeriodException && !periodExceptionReason.trim()) {
      toast.error("Provide a reason before allowing an out-of-period document.");
      return;
    }
    try {
      await correctImportRowMutation.mutateAsync({
        batchId: selectedBatchId,
        rowNumber: rowCorrectionTarget.row_number,
        rawRow: rowCorrectionDraft,
        exceptionContext: rowCorrectionNeedsPeriodException
          ? {
              allow_period_override: allowPeriodException,
              reason: periodExceptionReason.trim(),
              category: periodExceptionCategory,
            }
          : undefined,
      });
      toast.success(
        rowCorrectionNeedsPeriodException && allowPeriodException
          ? "Period exception recorded, row corrected, and batch reprocessed."
          : "Row correction applied and batch reprocessed.",
      );
      closeRowCorrectionDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDiscardRow = async () => {
    if (!selectedBatchId || !rowDiscardTarget) {
      return;
    }
    try {
      await discardImportRowMutation.mutateAsync({
        batchId: selectedBatchId,
        rowNumber: rowDiscardTarget.row_number,
      });
      toast.success("Row discarded and batch reprocessed.");
      closeRowDiscardDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDiscardBatch = async () => {
    if (!batchDiscardTarget) {
      return;
    }
    try {
      await discardImportBatchMutation.mutateAsync({
        batchId: batchDiscardTarget.id,
      });
      if (selectedBatchId === batchDiscardTarget.id) {
        setSelectedBatchId(batchDiscardTarget.id);
      }
      toast.success("Batch discarded.");
      closeBatchDiscardDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleReplaceBatch = async () => {
    if (!batchReplacementTarget || !replacementFile) {
      toast.error("Choose a replacement file before continuing.");
      return;
    }
    try {
      const replacementBatch = await replaceImportBatchMutation.mutateAsync({
        batchId: batchReplacementTarget.id,
        file: replacementFile,
      });
      setSelectedBatchId(replacementBatch.id);
      toast.success("Replacement batch created.");
      closeBatchReplacementDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleReprocessBatch = async () => {
    if (!batchReprocessTarget) {
      return;
    }
    try {
      const batch = await reprocessImportBatchMutation.mutateAsync({
        batchId: batchReprocessTarget.id,
      });
      setSelectedBatchId(batch.id);
      toast.success("Batch reprocessed.");
      closeBatchReprocessDialog();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Center"
        description="Upload source files into the selected monthly workspace, validate rows, and convert accepted records into GST transactions."
        actions={[
          { label: "Open reconciliation", href: "/reconciliation" },
          { label: "Download sample CSV", href: "/sample-files/import-template-sample.csv" },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ImportStepCard
          title="1. Confirm monthly context"
          description="Workspace, client, and period must be selected before any batch is accepted."
          complete={contextReady}
        />
        <ImportStepCard
          title="2. Choose a source file"
          description={file ? `Selected ${file.name}` : "Upload CSV or Excel data for the active cycle."}
          complete={Boolean(file)}
        />
        <ImportStepCard
          title="3. Map or reuse headers"
          description={
            selectedTemplateId
              ? "A saved mapping template is ready for this upload."
              : detectedHeaders.length > 0
                ? "Headers were detected and are ready for mapping."
                : "Use a template or detect headers from the selected file."
          }
          complete={templateReady}
        />
        <ImportStepCard
          title="4. Review processed output"
          description={
            latestBatch
              ? `${latestBatch.valid_rows} valid rows and ${latestBatch.invalid_rows} invalid rows in the latest batch.`
              : "Processed batches and row-level issues will appear below."
          }
          complete={Boolean(latestBatch)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Upload source file"
          description="Choose the import category, confirm the selected workspace context, and upload CSV or Excel source data."
          action={
            <Button size="sm" onClick={handleUpload} disabled={!canUpload || uploadMutation.isPending}>
              {uploadMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Upload file"}
            </Button>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="field-label">Import type</p>
                  <Select value={importType} onValueChange={(value) => setImportType(value as ImportBatchRecord["import_type"])}>
                    <SelectTrigger className="h-10 bg-slate-50">
                      <SelectValue placeholder="Import type" />
                    </SelectTrigger>
                    <SelectContent>
                      {importTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="field-label">Source format</p>
                  <Select value={sourceType} onValueChange={(value) => setSourceType(value as ImportBatchRecord["source_type"])}>
                    <SelectTrigger className="h-10 bg-slate-50">
                      <SelectValue placeholder="Source type" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <p className="field-label">Mapping template</p>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <Select value={selectedTemplateId ?? "none"} onValueChange={(value) => setSelectedTemplateId(value === "none" ? null : value)}>
                      <SelectTrigger className="h-10 bg-slate-50">
                        <SelectValue placeholder="Select template (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No template</SelectItem>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}{template.is_default ? " • Default" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={openCreateTemplateDialog}>
                      Save mapping template
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-white text-indigo-600 ring-1 ring-slate-200">
                    <UploadCloud className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Operator checklist</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Keep uploads clean by matching the file type to the import category and reusing templates where possible.
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                    <span className="text-sm text-slate-600">Context ready</span>
                    <span className="text-sm font-semibold text-slate-900">{contextReady ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                    <span className="text-sm text-slate-600">Template support</span>
                    <span className="text-sm font-semibold text-slate-900">{templates.length} saved</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                    <span className="text-sm text-slate-600">Accepted formats</span>
                    <span className="text-sm font-semibold text-slate-900">CSV, XLSX</span>
                  </div>
                </div>
              </div>
            </div>

            <FileUploadDropzone
              fileName={file?.name ?? null}
              onFileSelect={handleFileSelect}
              disabled={!selectedWorkspaceId || !selectedClientId || !selectedPeriodId || isPeriodLocked}
              helperText={
                isPeriodLocked
                  ? "This period is locked. Unlock it before uploading any new files."
                  : uploadError ?? undefined
              }
            />
            {file ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSearch2 className="size-4 text-indigo-600" />
                  <p className="text-sm font-medium text-slate-900">Detected source headers</p>
                  {isDetectingHeaders ? <Loader2 className="size-4 animate-spin text-slate-500" /> : null}
                </div>
                {headerDetectionError ? (
                  <p className="mt-2 text-sm text-amber-700">{headerDetectionError}</p>
                ) : detectedHeaders.length > 0 ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detectedHeaders.map((header) => (
                        <Badge key={header} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                          {header}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Use “Save mapping template” to map these headers once for future uploads.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No readable headers were detected yet.</p>
                )}
              </div>
            ) : null}
            {uploadError ? (
              <ErrorState
                title="Upload validation needs attention"
                description={uploadError}
              />
            ) : null}

            <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Workspace</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedWorkspace?.name ?? "Not selected"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Client</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedClient?.legal_name ?? "Not selected"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">GSTIN</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedGstin?.gstin ?? "Optional"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Period</p>
                <p className="mt-1 font-semibold text-slate-900">{selectedPeriod?.period ?? "Not selected"}</p>
                {isPeriodLocked ? <p className="mt-1 text-xs font-medium text-rose-600">Locked for changes</p> : null}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Monthly import readiness" description="Imports need a live workspace context before batches can be accepted.">
          {selectedWorkspaceId && selectedClientId && selectedPeriodId ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1e3a8a_100%)] p-5 text-white">
                <p className="text-sm text-indigo-100">Ready to import</p>
                <h3 className="mt-2 text-xl font-semibold">{selectedClient?.legal_name ?? "Selected client"}</h3>
                <p className="mt-2 text-sm leading-6 text-indigo-100">
                  Upload files for {selectedPeriod?.period ?? "the active period"} and monitor validation issues before downstream reconciliation.
                </p>
                {isPeriodLocked ? (
                  <p className="mt-3 text-sm font-medium text-rose-100">This period is locked. Upload is disabled until an admin or owner unlocks it.</p>
                ) : null}
              </div>
              <div className="grid gap-3 text-sm text-slate-700">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <span>Supported files</span>
                  <span className="font-semibold text-slate-900">CSV, XLSX</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <span>Import categories</span>
                  <span className="font-semibold text-slate-900">Sales, Purchase, Notes, TDS, Advances, 2B</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                  <span>Latest batch status</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {latestBatch ? latestBatch.status.replace(/_/g, " ") : "No uploads yet"}
                    </span>
                    {latestBatch?.correction_summary ? (
                      <StatusBadge
                        label={getCorrectionStatusLabel(latestBatch.correction_summary) ?? "correction ready"}
                        variant={getCorrectionStatusVariant(latestBatch.correction_summary)}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Before you upload</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <li>Match the file name and selected import type.</li>
                  <li>Use a saved template when the source headers are non-standard.</li>
                  <li>Keep the active period open until all required batches are in.</li>
                </ul>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Select import context first"
              description="Choose workspace, client, and compliance period from the topbar before uploading files into the monthly workspace."
            />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Import operations snapshot"
        description="A fast summary of how the active monthly intake is progressing before you dive into templates or row-level details."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="surface-card px-5 py-5">
            <p className="text-sm font-medium text-slate-500">Total batches</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{batches.length}</p>
            <p className="mt-2 text-sm text-slate-600">Uploads recorded in the active workspace scope.</p>
          </div>
          <div className="surface-card px-5 py-5">
            <p className="text-sm font-medium text-slate-500">Processed successfully</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{processedBatchCount}</p>
            <p className="mt-2 text-sm text-slate-600">Batches that completed normalization and transaction creation.</p>
          </div>
          <div className="surface-card px-5 py-5">
            <p className="text-sm font-medium text-slate-500">Invalid rows</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{invalidRowTotal}</p>
            <p className="mt-2 text-sm text-slate-600">Rows that still need source cleanup or mapping adjustments.</p>
          </div>
          <div className="surface-card px-5 py-5">
            <p className="text-sm font-medium text-slate-500">Transactions created</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{transactionCount}</p>
            <p className="mt-2 text-sm text-slate-600">Live GST transactions created from the selected batch context.</p>
          </div>
        </div>
        {batchesRequiringRerun > 0 || filingLockedBatchCount > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {batchesRequiringRerun > 0 ? (
                <StatusBadge
                  label={`${batchesRequiringRerun} batch${batchesRequiringRerun > 1 ? "es" : ""} need reconciliation rerun`}
                  variant="warning"
                />
              ) : null}
              {filingLockedBatchCount > 0 ? (
                <StatusBadge
                  label={`${filingLockedBatchCount} batch${filingLockedBatchCount > 1 ? "es" : ""} locked by filing`}
                  variant="danger"
                />
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-amber-900">
              Source corrections now follow policy-based controls. Open a batch to review whether corrections are allowed and what downstream action is required next.
            </p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Import templates"
        description="Reusable column mappings for real-world files with different header names."
      >
        {!selectedWorkspaceId ? (
          <EmptyState
            title="Select a workspace to manage templates"
            description="Templates are scoped to the current workspace, import type, and source format."
          />
        ) : templatesQuery.isLoading ? (
          <LoadingState message="Loading import templates..." />
        ) : templatesQuery.isError ? (
          <ErrorState title="We couldn’t load import templates" description={getErrorMessage(templatesQuery.error)} />
        ) : templates.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Mapped fields</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium text-slate-900">{template.name}</TableCell>
                    <TableCell className="capitalize">{template.import_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="uppercase">{template.source_type}</TableCell>
                    <TableCell>{Object.keys(template.column_mapping ?? {}).length}</TableCell>
                    <TableCell>
                      <StatusBadge label={template.is_default ? "Default" : "Custom"} variant={template.is_default ? "primary" : "neutral"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditTemplateDialog(template)}>
                          <ActionLabel kind="edit" label="Edit" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleTemplateDelete(template.id)}>
                          <ActionLabel kind="delete" label="Delete" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No templates saved yet"
            description="Save a mapping template for this import type and source format so future uploads can normalize messy headers automatically."
            action={<Button size="sm" onClick={openCreateTemplateDialog}>Create template</Button>}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Import history"
        description="Track upload status, correction state, lineage, and inspect processing details for each batch."
      >
        {!selectedWorkspaceId || !selectedClientId || !selectedPeriodId ? (
          <EmptyState
            title="Import history unlocks after setup"
            description="Select a workspace, client, and compliance period to load import activity for the current operating context."
          />
        ) : batchesQuery.isLoading ? (
          <LoadingState message="Loading import batches..." />
        ) : batchesQuery.isError ? (
          <ErrorState
            title="We couldn’t load import history"
            description={getErrorMessage(batchesQuery.error)}
          />
        ) : batchesQuery.data && batchesQuery.data.items.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Batch</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Valid</TableHead>
                  <TableHead>Invalid</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchesQuery.data.items.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{batch.file_name}</p>
                        <p className="text-xs text-slate-500">{batch.id.slice(0, 8)}</p>
                        {batch.correction_summary ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge
                              label={getCorrectionStatusLabel(batch.correction_summary) ?? "correction ready"}
                              variant={getCorrectionStatusVariant(batch.correction_summary)}
                            />
                            {batch.status === "superseded" ? <StatusBadge label="superseded" variant="warning" /> : null}
                            {batch.status === "discarded" ? <StatusBadge label="discarded" variant="neutral" /> : null}
                            {batch.supersedes_batch ? <Badge variant="outline">replacement batch</Badge> : null}
                            {batch.correction_summary.next_required_action ? (
                              <p className="text-xs text-slate-500">{batch.correction_summary.next_required_action}</p>
                            ) : null}
                          </div>
                        ) : null}
                        {batch.superseded_by ? (
                          <p className="mt-2 text-xs text-slate-500">Superseded by batch {batch.superseded_by.slice(0, 8)}</p>
                        ) : batch.supersedes_batch ? (
                          <p className="mt-2 text-xs text-slate-500">Active replacement for batch {batch.supersedes_batch.slice(0, 8)}</p>
                        ) : batch.status === "discarded" ? (
                          <p className="mt-2 text-xs text-slate-500">Removed from active processing. Audit history remains intact.</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{batch.import_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="uppercase">{batch.source_type}</TableCell>
                    <TableCell>
                      <StatusBadge label={batch.status} variant={getStatusVariant(batch.status)} />
                    </TableCell>
                    <TableCell>{batch.total_rows}</TableCell>
                    <TableCell>{batch.valid_rows}</TableCell>
                    <TableCell>{batch.invalid_rows}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm text-slate-900">{batch.uploaded_by_name ?? "System"}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(batch.created_at)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelectedBatchId(batch.id)}>
                        <ActionLabel kind="view" label="View details" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No import batches yet"
            description="Upload your first source file for this workspace and period to start populating the import history."
            action={
              <Button size="sm" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Start upload
              </Button>
            }
          />
        )}
      </SectionCard>

      <Dialog open={Boolean(selectedBatchId)} onOpenChange={(open) => !open && setSelectedBatchId(null)}>
        <AppModalContent size="xl" className="overflow-x-hidden">
          <AppModalHeader
            title="Import batch details"
            description="Review the processing outcome, captured row issues, and created transaction count."
            icon={<FileSearch2 className="size-5" />}
          />

          <AppModalBody className="space-y-6">
            {selectedBatchQuery.isLoading ? (
              <LoadingState message="Loading batch details..." />
            ) : selectedBatchQuery.isError ? (
              <ErrorState description={getErrorMessage(selectedBatchQuery.error)} />
            ) : selectedBatch ? (
              <>
                <SectionCard
                  title="Batch summary"
                  description={selectedBatch.file_name}
                  action={
                    <div className="flex w-full flex-wrap justify-start gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openBatchReprocessDialog(selectedBatch)}
                        disabled={!correctionPolicy?.can_reprocess}
                      >
                        <ActionLabel kind="reprocess" label="Reprocess batch" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openBatchReplacementDialog(selectedBatch)}
                        disabled={!correctionPolicy?.can_replace_file}
                      >
                        Replace file
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openBatchDiscardDialog(selectedBatch)}
                        disabled={!correctionPolicy?.can_discard_batch}
                      >
                        Discard batch
                      </Button>
                    </div>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Status</p>
                      <div className="mt-2">
                        <StatusBadge label={selectedBatch.status} variant={getStatusVariant(selectedBatch.status)} />
                      </div>
                      <p className="mt-3 text-sm text-slate-600">Processed at {formatDateTime(selectedBatch.processed_at)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Rows</p>
                      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                        <div><span className="block text-slate-500">Total</span><span className="font-semibold text-slate-900">{selectedBatch.total_rows}</span></div>
                        <div><span className="block text-slate-500">Valid</span><span className="font-semibold text-emerald-700">{selectedBatch.valid_rows}</span></div>
                        <div><span className="block text-slate-500">Invalid</span><span className="font-semibold text-rose-700">{selectedBatch.invalid_rows}</span></div>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {lineageDetails.length > 0 ? (
                  <SectionCard
                    title="Batch lineage"
                    description="Version and terminal-state context for this import batch."
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      {lineageDetails.map((detail) => (
                        <div key={detail.label} className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">{detail.label}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{detail.value}</p>
                          {detail.hint ? <p className="mt-2 text-sm leading-6 text-slate-600">{detail.hint}</p> : null}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ) : null}

                <SectionCard
                  title="Correction governance"
                  description="Operational correction permissions and downstream effects for this batch."
                >
                  {correctionPolicyQuery.isLoading ? (
                    <LoadingState message="Evaluating correction policy..." />
                  ) : correctionPolicyQuery.isError ? (
                    <ErrorState description={getErrorMessage(correctionPolicyQuery.error)} />
                  ) : correctionPolicy ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={correctionPolicy.lifecycle_state.replace(/_/g, " ")}
                          variant={getCorrectionStatusVariant(correctionPolicy)}
                        />
                        {correctionPolicy.requires_reconciliation_rerun ? (
                          <StatusBadge label="reconciliation rerun required" variant="warning" />
                        ) : null}
                        {correctionPolicy.requires_return_refresh ? (
                          <StatusBadge label="return refresh required" variant="warning" />
                        ) : null}
                        {correctionPolicy.requires_elevated_role ? (
                          <StatusBadge label="elevated role required" variant="danger" />
                        ) : null}
                        {correctionPolicy.is_locked_by_filing ? (
                          <StatusBadge label="locked by filing" variant="danger" />
                        ) : null}
                      </div>

                      {correctionPolicy.warning_message ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
                            <div>
                              <p className="text-sm font-semibold text-amber-900">Downstream impact</p>
                              <p className="mt-1 text-sm leading-6 text-amber-800">{correctionPolicy.warning_message}</p>
                            </div>
                          </div>
                        </div>
                      ) : showInvalidOnlyWarning ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
                            <div>
                              <p className="text-sm font-semibold text-amber-900">No valid rows imported yet</p>
                              <p className="mt-1 text-sm leading-6 text-amber-800">
                                This batch only contains invalid rows, so nothing usable has been created yet. Replace the
                                file, correct the invalid rows, or discard the batch to start cleanly.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" />
                            <div>
                              <p className="text-sm font-semibold text-emerald-900">Correction ready</p>
                              <p className="mt-1 text-sm leading-6 text-emerald-800">
                                This batch can move into the correction workflow without invalidating downstream filing state.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Reconciliation runs</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{correctionPolicy.affected_reconciliation_runs}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Return drafts</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{correctionPolicy.affected_return_preparations}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Filings</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{correctionPolicy.affected_filings}</p>
                        </div>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Allowed actions</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant={correctionPolicy.can_edit_rows ? "secondary" : "outline"}>{correctionPolicy.can_edit_rows ? "Edit rows allowed" : "Edit rows blocked"}</Badge>
                            <Badge variant={correctionPolicy.can_discard_rows ? "secondary" : "outline"}>{correctionPolicy.can_discard_rows ? "Discard rows allowed" : "Discard rows blocked"}</Badge>
                            <Badge variant={correctionPolicy.can_discard_batch ? "secondary" : "outline"}>{correctionPolicy.can_discard_batch ? "Discard batch allowed" : "Discard batch blocked"}</Badge>
                            <Badge variant={correctionPolicy.can_replace_file ? "secondary" : "outline"}>{correctionPolicy.can_replace_file ? "Replace file allowed" : "Replace file blocked"}</Badge>
                            <Badge variant={correctionPolicy.can_reprocess ? "secondary" : "outline"}>{correctionPolicy.can_reprocess ? "Reprocess allowed" : "Reprocess blocked"}</Badge>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Next required action</p>
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            {correctionPolicy.next_required_action ||
                              (showInvalidOnlyWarning
                                ? "Use Replace file, row correction, or Discard batch to resolve this invalid-only upload."
                                : "Row-level correction actions will follow this policy when enabled.")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title="Correction policy unavailable"
                      description="The batch policy could not be evaluated for this import."
                    />
                  )}
                </SectionCard>

                <SectionCard
                  title="Impact preview"
                  description="Downstream operational impact once correction, discard, replacement, or reprocessing actions are used."
                >
                  {impactSummaryQuery.isLoading ? (
                    <LoadingState message="Building impact preview..." />
                  ) : impactSummaryQuery.isError ? (
                    <ErrorState description={getErrorMessage(impactSummaryQuery.error)} />
                  ) : impactSummary ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge
                                label={impactSummary.summary_title}
                                variant={getImpactSeverityVariant(impactSummary.severity)}
                              />
                              {impactSummary.invalidation_reason ? (
                                <Badge variant="outline">{impactSummary.invalidation_reason.replace(/_/g, " ")}</Badge>
                              ) : null}
                            </div>
                            <p className="text-sm leading-6 text-slate-700">{impactSummary.summary_message}</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 p-3">
                            {(() => {
                              const ImpactIcon = getImpactSeverityIcon(impactSummary.severity);
                              return <ImpactIcon className="size-5 text-slate-700" />;
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Reconciliation impact</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{impactSummary.affected_reconciliation_runs}</p>
                          <p className="mt-1 text-sm text-slate-600">Runs that may need a rerun after source correction.</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Return impact</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{impactSummary.affected_return_preparations}</p>
                          <p className="mt-1 text-sm text-slate-600">Drafts or prepared returns that may need refresh.</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Filing impact</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{impactSummary.affected_filings}</p>
                          <p className="mt-1 text-sm text-slate-600">Filed or in-progress filings linked to this import context.</p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Action preview</p>
                          <p className="text-xs text-slate-500">Driven by the active correction policy</p>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {impactSummary.actions.map((action) => {
                            const ActionIcon = getImpactActionIcon(action.key);
                            return (
                              <div
                                key={action.key}
                                className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
                                    <ActionIcon className="size-4 text-slate-700" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                                      <Badge variant={action.allowed ? "secondary" : "outline"}>
                                        {action.allowed ? "Allowed" : "Blocked"}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{action.reason}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Next operational step</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {impactSummary.next_required_action || "Correction actions will follow this preview once row editing is enabled."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      title="Impact preview unavailable"
                      description="The batch impact preview could not be generated for this import."
                    />
                  )}
                </SectionCard>

                <SectionCard title="Status timeline" description="Import lifecycle through queue, processing, and completion.">
                  <div className="flex flex-wrap gap-3">
                    {["uploaded", "queued", "processing", selectedBatch.status === "failed" ? "failed" : "processed"].map((step) => (
                      <div key={step} className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm">
                        <span className="size-2 rounded-full bg-indigo-500" />
                        <span className="capitalize text-slate-700">{step.replace(/_/g, " ")}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Error summary" description="Validation errors and warnings captured during normalization.">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-rose-50 p-4">
                      <p className="text-sm text-rose-700">Errors</p>
                      <p className="mt-2 text-2xl font-semibold text-rose-800">{selectedBatch.error_summary?.errors ?? 0}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="text-sm text-amber-700">Warnings</p>
                      <p className="mt-2 text-2xl font-semibold text-amber-800">{selectedBatch.error_summary?.warnings ?? 0}</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <p className="text-sm text-emerald-700">Transactions created</p>
                      <p className="mt-2 text-2xl font-semibold text-emerald-800">{transactionCount}</p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Row errors"
                  description="Per-row import issues captured during validation."
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExportErrors}
                      disabled={!selectedBatchId}
                    >
                      Export errors
                    </Button>
                  }
                >
                  {errorsQuery.isLoading ? (
                    <LoadingState message="Loading row errors..." />
                  ) : errorsQuery.data && errorsQuery.data.items.length > 0 ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Row</TableHead>
                            <TableHead>Field</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Severity</TableHead>
                            <TableHead>Message</TableHead>
                            <TableHead>Raw row</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rowErrors.map((error) => (
                            <TableRow key={error.id}>
                              <TableCell>{error.row_number}</TableCell>
                              <TableCell>{error.field_name}</TableCell>
                              <TableCell className="font-mono text-xs text-slate-500">{error.error_code || "n/a"}</TableCell>
                              <TableCell>
                                <StatusBadge
                                  label={error.severity}
                                  variant={error.severity === "error" ? "danger" : "warning"}
                                />
                              </TableCell>
                              <TableCell>{error.error_message}</TableCell>
                              <TableCell className="max-w-[240px] truncate text-xs text-slate-500">
                                {Object.entries(error.raw_row ?? {})
                                  .slice(0, 3)
                                  .map(([key, value]) => `${key}: ${value}`)
                                  .join(" | ") || "No raw preview"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openRowCorrectionDialog(error)}
                                    disabled={!correctionPolicy?.can_edit_rows}
                                  >
                                    Correct row
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openRowDiscardDialog(error)}
                                    disabled={!correctionPolicy?.can_discard_rows}
                                  >
                                    Discard row
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <EmptyState
                      title="No row-level issues"
                      description="This batch did not generate validation errors or warnings."
                    />
                  )}
                </SectionCard>
              </>
            ) : (
              <EmptyState title="No batch selected" description="Choose an import batch from the history table to inspect details." />
            )}
          </AppModalBody>
        </AppModalContent>
      </Dialog>

      <Dialog open={Boolean(rowCorrectionTarget)} onOpenChange={(open) => {
        if (!open) {
          closeRowCorrectionDialog();
        }
      }}>
        <DialogContent className="max-w-4xl border border-slate-200 bg-white p-0 shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
          <DialogTitle className="sr-only">Correct import row</DialogTitle>
          <DialogDescription className="sr-only">
            Update the raw source values for an invalid import row and reprocess the batch under the active correction policy.
          </DialogDescription>
          <div className="flex max-h-[88vh] flex-col overflow-hidden">
            <AppModalHeader
              title={rowCorrectionTarget ? `Correct row ${rowCorrectionTarget.row_number}` : "Correct import row"}
              description="Update the original source values, review downstream impact, and reprocess the batch using the active correction policy."
            />
            <AppModalBody className="space-y-6 overflow-y-auto">
              {rowCorrectionTarget ? (
                <>
                  <SectionCard
                    title="Correction checkpoint"
                    description="This edit will save as a row override on the batch and then reprocess the full import so validation and transactions stay consistent."
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={`Row ${rowCorrectionTarget.row_number}`}
                          variant={rowCorrectionTarget.severity === "error" ? "danger" : "warning"}
                        />
                        {correctionPolicy ? (
                          <StatusBadge
                            label={getCorrectionStatusLabel(correctionPolicy) ?? "correction ready"}
                            variant={getCorrectionStatusVariant(correctionPolicy)}
                          />
                        ) : null}
                        {impactSummary ? (
                          <StatusBadge
                            label={impactSummary.summary_title}
                            variant={getImpactSeverityVariant(impactSummary.severity)}
                          />
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-sm font-semibold text-slate-900">{rowCorrectionTarget.error_message}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {impactSummary?.summary_message || correctionPolicy?.warning_message || "Once saved, the batch will be reprocessed and downstream status will refresh automatically if required."}
                        </p>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Editable source values"
                    description="Keep the original column names intact. These values become the batch's row override and are revalidated on save."
                  >
                    {rowCorrectionEntries.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        {rowCorrectionEntries.map(([field, value]) => (
                          <div key={field} className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                              {field.replace(/_/g, " ")}
                            </label>
                            <Input
                              value={value}
                              onChange={(event) => handleRowCorrectionFieldChange(field, event.target.value)}
                              placeholder={`Enter ${field.replace(/_/g, " ")}`}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title="No row preview available"
                        description="The row preview could not be loaded into the correction form."
                      />
                    )}
                    {rowCorrectionSubmitAttempted && rowCorrectionEntries.length === 0 ? (
                      <p className="text-sm text-rose-600">At least one editable source field is required before reprocessing.</p>
                    ) : null}
                  </SectionCard>

                  {rowCorrectionNeedsPeriodException ? (
                    <SectionCard
                      title="Period exception"
                      description="Use this only when an out-of-period invoice is being intentionally accepted for a genuine GST exception scenario."
                    >
                      <div className="space-y-4">
                        <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 rounded border-slate-300"
                            checked={allowPeriodException}
                            onChange={(event) => setAllowPeriodException(event.target.checked)}
                          />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">Allow this out-of-period document</p>
                            <p className="mt-1 text-sm leading-6 text-amber-800">
                              Keep the selected compliance period and record why this invoice is still being taken up here.
                            </p>
                          </div>
                        </label>

                        {allowPeriodException ? (
                          <div className="grid gap-4 md:grid-cols-[0.42fr_0.58fr]">
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                Exception category
                              </label>
                              <Select value={periodExceptionCategory} onValueChange={setPeriodExceptionCategory}>
                                <SelectTrigger className="h-10 bg-slate-50">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {periodExceptionOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                Reason
                              </label>
                              <Input
                                value={periodExceptionReason}
                                onChange={(event) => setPeriodExceptionReason(event.target.value)}
                                placeholder="Example: supplier filed late, but the invoice still needs controlled follow-up in this cycle"
                              />
                            </div>
                          </div>
                        ) : null}

                        {rowCorrectionSubmitAttempted && rowCorrectionNeedsPeriodException && allowPeriodException && !periodExceptionReason.trim() ? (
                          <p className="text-sm text-rose-600">A reason is required when allowing an out-of-period document.</p>
                        ) : null}
                      </div>
                    </SectionCard>
                  ) : null}

                  <SectionCard
                    title="Next step after save"
                    description="The system will keep the existing correction policy and downstream invalidation rules."
                  >
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm leading-6 text-slate-700">
                        {impactSummary?.next_required_action || correctionPolicy?.next_required_action || "Reprocessing results will be reflected in the batch summary once the correction is applied."}
                      </p>
                    </div>
                  </SectionCard>
                </>
              ) : null}
            </AppModalBody>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <Button variant="outline" onClick={closeRowCorrectionDialog} disabled={correctImportRowMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleApplyRowCorrection} disabled={correctImportRowMutation.isPending || !correctionPolicy?.can_edit_rows}>
                {correctImportRowMutation.isPending ? "Reprocessing..." : "Apply correction"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rowDiscardTarget)} onOpenChange={(open) => {
        if (!open) {
          closeRowDiscardDialog();
        }
      }}>
        <DialogContent className="max-w-3xl border border-slate-200 bg-white p-0 shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
          <DialogTitle className="sr-only">Discard import row</DialogTitle>
          <DialogDescription className="sr-only">
            Remove an invalid import row from batch processing and reprocess the import under the active correction policy.
          </DialogDescription>
          <div className="flex max-h-[80vh] flex-col overflow-hidden">
            <AppModalHeader
              title={rowDiscardTarget ? `Discard row ${rowDiscardTarget.row_number}` : "Discard import row"}
              description="Remove this source row from the active batch and let the system reprocess the remaining import data."
            />
            <AppModalBody className="space-y-6">
              {rowDiscardTarget ? (
                <>
                  <SectionCard
                    title="Discard checkpoint"
                    description="Use this when the row should be excluded from import processing instead of corrected."
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={`Row ${rowDiscardTarget.row_number}`}
                          variant={rowDiscardTarget.severity === "error" ? "danger" : "warning"}
                        />
                        {impactSummary ? (
                          <StatusBadge
                            label={impactSummary.summary_title}
                            variant={getImpactSeverityVariant(impactSummary.severity)}
                          />
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">{rowDiscardTarget.error_message}</p>
                            <p className="mt-1 text-sm leading-6 text-amber-800">
                              {impactSummary?.summary_message || correctionPolicy?.warning_message || "Discarding the row will reprocess the batch and refresh downstream status if this import has already been used elsewhere."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Row preview"
                    description="This is the source row that will be excluded from the batch."
                  >
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        {Object.entries(rowDiscardTarget.raw_row ?? {}).map(([field, value]) => (
                          <div key={field}>
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{field.replace(/_/g, " ")}</p>
                            <p className="mt-1 text-sm text-slate-700">{value || "—"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Next step after discard"
                    description="The same correction policy and downstream invalidation rules will be applied after reprocessing."
                  >
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm leading-6 text-slate-700">
                        {impactSummary?.next_required_action || correctionPolicy?.next_required_action || "The batch summary and row issues will refresh after the row is removed."}
                      </p>
                    </div>
                  </SectionCard>
                </>
              ) : null}
            </AppModalBody>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <Button variant="outline" onClick={closeRowDiscardDialog} disabled={discardImportRowMutation.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDiscardRow} disabled={discardImportRowMutation.isPending || !correctionPolicy?.can_discard_rows}>
                {discardImportRowMutation.isPending ? "Reprocessing..." : "Discard row"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(batchDiscardTarget)} onOpenChange={(open) => {
        if (!open) {
          closeBatchDiscardDialog();
        }
      }}>
        <DialogContent className="max-w-3xl border border-slate-200 bg-white p-0 shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
          <DialogTitle className="sr-only">Discard import batch</DialogTitle>
          <DialogDescription className="sr-only">
            Remove the full import batch from active processing and invalidate downstream work where required.
          </DialogDescription>
          <div className="flex max-h-[80vh] flex-col overflow-hidden">
            <AppModalHeader
              title={batchDiscardTarget ? `Discard ${batchDiscardTarget.file_name}` : "Discard import batch"}
              description="Use this when the full source file should be removed from the current compliance workflow."
            />
            <AppModalBody className="space-y-6">
              {batchDiscardTarget ? (
                <>
                  <SectionCard
                    title="Batch discard checkpoint"
                    description="This action clears the batch output, sets the batch to a terminal discarded state, and keeps an audit trail."
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={batchDiscardTarget.status} variant={getStatusVariant(batchDiscardTarget.status)} />
                        {correctionPolicy ? (
                          <StatusBadge
                            label={getCorrectionStatusLabel(correctionPolicy) ?? "correction ready"}
                            variant={getCorrectionStatusVariant(correctionPolicy)}
                          />
                        ) : null}
                        {impactSummary ? (
                          <StatusBadge
                            label={impactSummary.summary_title}
                            variant={getImpactSeverityVariant(impactSummary.severity)}
                          />
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">
                              This will discard the full file from active processing.
                            </p>
                            <p className="mt-1 text-sm leading-6 text-amber-800">
                              {impactSummary?.summary_message || correctionPolicy?.warning_message || "Downstream summaries, reconciliation state, and return readiness will refresh automatically if this batch has already been used."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Batch impact snapshot"
                    description="Quick view of the volume that will be removed from this batch."
                  >
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Rows in batch</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{batchDiscardTarget.total_rows}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Valid rows</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{batchDiscardTarget.valid_rows}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Transactions created</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{batchDiscardTarget.transaction_count}</p>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Next step after discard"
                    description="The active correction policy still controls the follow-up path."
                  >
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm leading-6 text-slate-700">
                        {impactSummary?.next_required_action || correctionPolicy?.next_required_action || "Review imports, reconciliation, and returns after the batch is discarded."}
                      </p>
                    </div>
                  </SectionCard>
                </>
              ) : null}
            </AppModalBody>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <Button variant="outline" onClick={closeBatchDiscardDialog} disabled={discardImportBatchMutation.isPending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDiscardBatch} disabled={discardImportBatchMutation.isPending || !correctionPolicy?.can_discard_batch}>
                {discardImportBatchMutation.isPending ? "Discarding..." : "Discard batch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(batchReplacementTarget)} onOpenChange={(open) => {
        if (!open) {
          closeBatchReplacementDialog();
        }
      }}>
        <DialogContent className="max-w-4xl border border-slate-200 bg-white p-0 shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
          <DialogTitle className="sr-only">Replace import batch file</DialogTitle>
          <DialogDescription className="sr-only">
            Upload a replacement file that supersedes the current batch while preserving audit history.
          </DialogDescription>
          <div className="flex max-h-[88vh] flex-col overflow-hidden">
            <AppModalHeader
              title={batchReplacementTarget ? `Replace ${batchReplacementTarget.file_name}` : "Replace import batch"}
              description="Upload a corrected source file for the same workspace, client, GSTIN, period, import type, and source format."
            />
            <AppModalBody className="space-y-6 overflow-y-auto">
              {batchReplacementTarget ? (
                <>
                  <SectionCard
                    title="Replacement checkpoint"
                    description="The current batch will move into a superseded state and the new batch will become the active source version for this context."
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={batchReplacementTarget.status} variant={getStatusVariant(batchReplacementTarget.status)} />
                        {correctionPolicy ? (
                          <StatusBadge
                            label={getCorrectionStatusLabel(correctionPolicy) ?? "correction ready"}
                            variant={getCorrectionStatusVariant(correctionPolicy)}
                          />
                        ) : null}
                        {impactSummary ? (
                          <StatusBadge
                            label={impactSummary.summary_title}
                            variant={getImpactSeverityVariant(impactSummary.severity)}
                          />
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="mt-0.5 size-4 text-amber-700" />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">
                              Replacement creates a new batch version and retires the current one from active processing.
                            </p>
                            <p className="mt-1 text-sm leading-6 text-amber-800">
                              {impactSummary?.summary_message || correctionPolicy?.warning_message || "Downstream reconciliation and return state will refresh automatically if this batch has already been used."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Replacement file"
                    description="Use the same import type and source format. The current batch context and template linkage are preserved automatically."
                  >
                    <FileUploadDropzone
                      fileName={replacementFile?.name ?? null}
                      onFileSelect={setReplacementFile}
                      helperText="Upload the corrected CSV or Excel file that should supersede this batch."
                    />
                    {replacementFile ? (
                      <p className="text-sm text-slate-600">
                        New file selected: <span className="font-medium text-slate-900">{replacementFile.name}</span>
                      </p>
                    ) : null}
                  </SectionCard>

                  <SectionCard
                    title="Context carried forward"
                    description="These details stay fixed so replacement remains in the same operating scope."
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Import type</p>
                        <p className="mt-2 text-sm font-semibold capitalize text-slate-900">
                          {batchReplacementTarget.import_type.replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Source type</p>
                        <p className="mt-2 text-sm font-semibold uppercase text-slate-900">
                          {batchReplacementTarget.source_type}
                        </p>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Next step after replacement"
                    description="The shared correction policy still controls the post-replacement workflow."
                  >
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm leading-6 text-slate-700">
                        {impactSummary?.next_required_action || correctionPolicy?.next_required_action || "Review the new batch, then re-run downstream workflows if this import had already been used."}
                      </p>
                    </div>
                  </SectionCard>
                </>
              ) : null}
            </AppModalBody>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <Button variant="outline" onClick={closeBatchReplacementDialog} disabled={replaceImportBatchMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleReplaceBatch} disabled={replaceImportBatchMutation.isPending || !correctionPolicy?.can_replace_file || !replacementFile}>
                {replaceImportBatchMutation.isPending ? "Replacing..." : "Create replacement batch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(batchReprocessTarget)} onOpenChange={(open) => {
        if (!open) {
          closeBatchReprocessDialog();
        }
      }}>
        <DialogContent className="max-w-3xl border border-slate-200 bg-white p-0 shadow-[0_30px_100px_rgba(15,23,42,0.18)]">
          <DialogTitle className="sr-only">Reprocess import batch</DialogTitle>
          <DialogDescription className="sr-only">
            Rebuild the batch from the stored source file and the current correction state.
          </DialogDescription>
          <div className="flex max-h-[80vh] flex-col overflow-hidden">
            <AppModalHeader
              title={batchReprocessTarget ? `Reprocess ${batchReprocessTarget.file_name}` : "Reprocess import batch"}
              description="Use this when the batch should be rebuilt from the original file plus saved row corrections and discarded-row instructions."
            />
            <AppModalBody className="space-y-6">
              {batchReprocessTarget ? (
                <>
                  <SectionCard
                    title="Reprocess checkpoint"
                    description="This action regenerates validation issues and transactions in place while keeping the current batch version."
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={batchReprocessTarget.status} variant={getStatusVariant(batchReprocessTarget.status)} />
                        {correctionPolicy ? (
                          <StatusBadge
                            label={getCorrectionStatusLabel(correctionPolicy) ?? "correction ready"}
                            variant={getCorrectionStatusVariant(correctionPolicy)}
                          />
                        ) : null}
                        {impactSummary ? (
                          <StatusBadge
                            label={impactSummary.summary_title}
                            variant={getImpactSeverityVariant(impactSummary.severity)}
                          />
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <RefreshCw className="mt-0.5 size-4 text-amber-700" />
                          <div>
                            <p className="text-sm font-semibold text-amber-900">The batch will be regenerated in place.</p>
                            <p className="mt-1 text-sm leading-6 text-amber-800">
                              {impactSummary?.summary_message || correctionPolicy?.warning_message || "Downstream reconciliation and return state will refresh automatically if this import has already been used."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Next step after reprocess"
                    description="The active correction policy still controls the downstream follow-up path."
                  >
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-sm leading-6 text-slate-700">
                        {impactSummary?.next_required_action || correctionPolicy?.next_required_action || "Review refreshed row issues, reconciliation, and return readiness once reprocessing completes."}
                      </p>
                    </div>
                  </SectionCard>
                </>
              ) : null}
            </AppModalBody>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <Button variant="outline" onClick={closeBatchReprocessDialog} disabled={reprocessImportBatchMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={handleReprocessBatch} disabled={reprocessImportBatchMutation.isPending || !correctionPolicy?.can_reprocess}>
                {reprocessImportBatchMutation.isPending ? "Reprocessing..." : "Reprocess batch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTemplateDialogOpen} onOpenChange={handleTemplateDialogChange}>
        <DialogContent
          className="w-[95vw] max-w-5xl sm:max-w-5xl max-h-[90vh] sm:max-h-[90vh] overflow-hidden p-0 rounded-3xl border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {editingTemplate ? "Edit import template" : "Create import template"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Save workspace-specific header mappings so future uploads can normalize vendor files without manual cleanup.
          </DialogDescription>
          <div className="flex max-h-[90vh] flex-col">
            <div className="flex items-start justify-between border-b border-slate-200 px-8 py-6">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <Sparkles className="size-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h2 className="text-[1.75rem] font-semibold tracking-tight text-slate-950">
                    {editingTemplate ? "Edit import template" : "Create import template"}
                  </h2>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    Save workspace-specific header mappings so future uploads can normalize vendor files without manual cleanup.
                  </p>
                </div>
              </div>
              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm" className="shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogClose>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="space-y-6">
                <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-800">
                      Template name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={templateForm.name}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Purchase register standard"
                      className="h-11 w-full bg-white"
                      aria-invalid={templateSubmitAttempted && Boolean(templateNameError)}
                    />
                    {templateSubmitAttempted && templateNameError ? (
                      <p className="text-xs font-medium text-rose-600">{templateNameError}</p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={templateForm.is_default}
                        onChange={(event) => setTemplateForm((current) => ({ ...current, is_default: event.target.checked }))}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium text-slate-800">Mark as default</span>
                        <span className="block text-xs leading-5 text-slate-500">
                          Apply this template automatically for the active workspace, import type, and source type.
                        </span>
                      </span>
                    </label>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-slate-900">Header mapping</h3>
                    <p className="text-sm leading-6 text-slate-500">
                      Map your file headers to system fields. Unmapped columns will be ignored.
                    </p>
                    {detectedHeaders.length > 0 ? (
                      <p className="text-xs leading-5 text-indigo-600">
                        Using {detectedHeaders.length} detected headers from the selected file for guided mapping.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-5">
                    {mappingSections.map((section) => (
                      <div key={section.title} className="space-y-3">
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-slate-900">{section.title}</h4>
                          <p className="text-xs leading-5 text-slate-500">{section.description}</p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {section.fields.map((field) => {
                            const hasError = templateSubmitAttempted && Boolean(templateMappingErrors[field]);
                            return (
                              <div
                                key={field}
                                className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-[180px_1fr] sm:items-center"
                              >
                                <div className="min-w-0 space-y-1">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <label className="truncate text-sm font-medium text-slate-800">{fieldLabels[field]}</label>
                                    {requiredFieldSet.has(field) ? (
                                      <span className="text-xs font-medium text-rose-500">*</span>
                                    ) : null}
                                  </div>
                                  {fieldHints[field] ? (
                                    <p className="text-xs leading-5 text-slate-500">{fieldHints[field]}</p>
                                  ) : null}
                                </div>
                                <div className="min-w-0">
                                  {detectedHeaders.length > 0 ? (
                                    <Select
                                      value={templateForm.column_mapping[field] || "__unmapped__"}
                                      onValueChange={(value) =>
                                        setTemplateForm((current) => ({
                                          ...current,
                                          column_mapping: {
                                            ...current.column_mapping,
                                            [field]: value === "__unmapped__" ? "" : value,
                                          },
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="h-11 w-full bg-slate-50">
                                        <SelectValue placeholder={`Map ${fieldLabels[field].toLowerCase()}`} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__unmapped__">Leave unmapped</SelectItem>
                                        {templateForm.column_mapping[field] &&
                                        !detectedHeaders.includes(templateForm.column_mapping[field]) &&
                                        templateForm.column_mapping[field] !== headerSuggestions[field] ? (
                                          <SelectItem value={templateForm.column_mapping[field]}>
                                            {templateForm.column_mapping[field]}
                                          </SelectItem>
                                        ) : null}
                                        {headerSuggestions[field] && !detectedHeaders.includes(headerSuggestions[field]!) ? (
                                          <SelectItem value={headerSuggestions[field]!}>{headerSuggestions[field]}</SelectItem>
                                        ) : null}
                                        {detectedHeaders.map((header) => (
                                          <SelectItem key={`${field}-${header}`} value={header}>
                                            {header}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Input
                                      value={templateForm.column_mapping[field]}
                                      onChange={(event) =>
                                        setTemplateForm((current) => ({
                                          ...current,
                                          column_mapping: {
                                            ...current.column_mapping,
                                            [field]: event.target.value,
                                          },
                                        }))
                                      }
                                      placeholder={`Enter source header for ${fieldLabels[field].toLowerCase()}`}
                                      className="h-11 w-full bg-slate-50"
                                      aria-invalid={hasError}
                                    />
                                  )}
                                  {hasError ? (
                                    <p className="mt-2 text-xs font-medium text-rose-600">{templateMappingErrors[field]}</p>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  {filingMetadataWarnings.length > 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-amber-900">Filing metadata is still incomplete</p>
                          <p className="text-xs leading-5 text-amber-800">
                            The workbook export will work, but these unmapped fields reduce filing-grade accuracy:
                            {" "}
                            {filingMetadataWarnings.map((field) => fieldLabels[field]).join(", ")}.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-slate-900">Mapping preview</label>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      <FileJson2 className="size-3" />
                      JSON preview
                    </Badge>
                  </div>
                  <div className="max-h-40 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                    <pre className="font-mono whitespace-pre-wrap break-words">{mappingPreview || "{}"}</pre>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    Need help?{" "}
                    <a
                      href="/sample-files/import-template-sample.csv"
                      download
                      className="font-medium text-indigo-600 transition hover:text-indigo-700"
                    >
                      Download sample file
                    </a>
                  </p>
                </section>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-200 bg-white px-8 py-5">
              <div className="text-sm text-slate-600">
                Need help?{" "}
                <a
                  href="/sample-files/import-template-sample.csv"
                  download
                  className="font-medium text-indigo-600 transition hover:text-indigo-700"
                >
                  Download sample file
                </a>
              </div>
              <div className="flex items-center gap-2">
                <DialogClose asChild>
                  <Button variant="outline">
                    <ActionLabel kind="cancel" label="Cancel" />
                  </Button>
                </DialogClose>
                <Button
                  onClick={handleTemplateSubmit}
                  disabled={isTemplateSubmitting}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {isTemplateSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving template...
                    </>
                  ) : editingTemplate ? (
                    "Update template"
                  ) : (
                    "Save template"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
