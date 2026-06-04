"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageHeader } from "@/components/common/page-header";
import { ActionLabel } from "@/components/common/action-label";
import { AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from "@/components/common/app-modal";
import { SectionCard } from "@/components/common/section-card";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useBulkUpdateGstTransactionsMutation,
  useClearTransactionRemediationAssignmentEscalationMutation,
  useCompleteTransactionRemediationFollowUpMutation,
  useCreateTransactionRemediationAssignmentMutation,
  useCreateTransactionRemediationFollowUpMutation,
  useCreateTransactionReviewSnapshotMutation,
  useDeleteTransactionRemediationFollowUpMutation,
  useDeleteTransactionRemediationAssignmentMutation,
  useDeleteTransactionReviewSnapshotMutation,
  useDismissTransactionRemediationFollowUpMutation,
  useEscalateTransactionRemediationAssignmentMutation,
  useGstTransactionQuery,
  useGstTransactionsQuery,
  useImportBatchesQuery,
  useSendTransactionRemediationFollowUpMutation,
  useTransactionRemediationAssignmentsQuery,
  useTransactionRemediationFollowUpsQuery,
  useTransactionReviewSnapshotsQuery,
  useUpdateGstTransactionMutation,
  useUpdateTransactionRemediationFollowUpMutation,
  useUpdateTransactionRemediationAssignmentMutation,
  useWorkspaceMembersQuery,
} from "@/features/imports";
import { downloadFile } from "@/lib/api/download";
import { getErrorMessage } from "@/lib/api/error-handler";
import { useSession } from "@/lib/query/session-provider";
import { useWorkspaceContext } from "@/store/workspace-context";
import type { GSTTransactionLineItem } from "@/types/api";

const transactionTypeOptions = [
  { value: "all", label: "All transaction types" },
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
  { value: "gstr_2b", label: "GSTR-2B" },
];

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "imported", label: "Imported" },
  { value: "review", label: "Review" },
  { value: "locked", label: "Locked" },
];

function formatCurrency(value: string) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return format(new Date(value), "dd MMM yyyy");
}

type EditableLineItem = {
  hsn_code: string;
  description: string;
  uqc: string;
  quantity: string;
  is_service: boolean;
  supply_category: string;
  ecommerce_gstin: string;
  taxable_value: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  cess_amount: string;
  total_amount: string;
};

function normalizeLineItems(metadata: Record<string, unknown>): EditableLineItem[] {
  const rawLineItems = Array.isArray(metadata.line_items) ? (metadata.line_items as GSTTransactionLineItem[]) : [];
  if (rawLineItems.length === 0) {
    return [
      {
        hsn_code: String(metadata.hsn_code ?? ""),
        description: String(metadata.description ?? ""),
        uqc: String(metadata.uqc ?? ""),
        quantity: String(metadata.quantity ?? ""),
        is_service: Boolean(metadata.is_service),
        supply_category: String(metadata.supply_category ?? ""),
        ecommerce_gstin: String(metadata.ecommerce_gstin ?? ""),
        taxable_value: "",
        cgst_amount: "",
        sgst_amount: "",
        igst_amount: "",
        cess_amount: "",
        total_amount: "",
      },
    ];
  }
  return rawLineItems.map((item) => ({
    hsn_code: String(item.hsn_code ?? ""),
    description: String(item.description ?? ""),
    uqc: String(item.uqc ?? ""),
    quantity: String(item.quantity ?? ""),
    is_service: Boolean(item.is_service),
    supply_category: String(item.supply_category ?? ""),
    ecommerce_gstin: String(item.ecommerce_gstin ?? ""),
    taxable_value: String(item.taxable_value ?? ""),
    cgst_amount: String(item.cgst_amount ?? ""),
    sgst_amount: String(item.sgst_amount ?? ""),
    igst_amount: String(item.igst_amount ?? ""),
    cess_amount: String(item.cess_amount ?? ""),
    total_amount: String(item.total_amount ?? ""),
  }));
}

type SuggestedFixConfig = {
  mode: "bulk_correct" | "row_review";
  fields: string[];
  title: string;
  detail: string;
};

type RemediationBucket = {
  code: string;
  title: string;
  detail: string;
  count: number;
  transactionIds: string[];
  suggestedFix: SuggestedFixConfig;
};

type AssignmentDialogTarget =
  | { mode: "bucket"; bucketCode: string; title: string; transactionIds: string[] }
  | { mode: "selection"; title: string; transactionIds: string[] };

type SavedReviewView = {
  id: string;
  name: string;
  filters: {
    selectedBatchId: string;
    transactionType: string;
    status: string;
    counterpartyGstin: string;
    dateFrom: string;
    dateTo: string;
    activeRemediationBucketCode: string | null;
    showRemediationOnly: boolean;
  };
};

type FollowUpDialogMode = "create" | "edit";

const readinessSuggestions: Record<string, SuggestedFixConfig> = {
  missing_hsn: {
    mode: "bulk_correct",
    fields: ["hsn_code"],
    title: "Suggested bulk fix: fill HSN code",
    detail: "If the selected rows share the same classification, use bulk correction to apply one HSN code across all of them.",
  },
  missing_uqc: {
    mode: "bulk_correct",
    fields: ["uqc"],
    title: "Suggested bulk fix: fill UQC",
    detail: "Use bulk correction when the selected rows share the same unit quantity code.",
  },
  missing_supply_category: {
    mode: "bulk_correct",
    fields: ["supply_category"],
    title: "Suggested bulk fix: classify supply category",
    detail: "Use bulk correction to mark the selected rows as taxable, nil-rated, exempt, or non-GST when they share the same treatment.",
  },
  missing_quantity: {
    mode: "row_review",
    fields: ["quantity"],
    title: "Suggested review: verify quantities one by one",
    detail: "Quantities usually vary by line item, so review each affected transaction individually instead of applying one bulk value.",
  },
  conflicting_supply_category: {
    mode: "row_review",
    fields: ["supply_category"],
    title: "Suggested review: resolve conflicting line items",
    detail: "These transactions have mixed line-item classifications. Open the detail drawer and review them individually.",
  },
  unresolved_reconciliation_items: {
    mode: "row_review",
    fields: [],
    title: "Suggested review: inspect linked reconciliation rows",
    detail: "Review the books and 2B transactions behind these reconciliation issues before filing.",
  },
  itc_at_risk: {
    mode: "row_review",
    fields: [],
    title: "Suggested review: investigate ITC at risk",
    detail: "Start from the affected transactions, then resolve or defer the related reconciliation items before filing.",
  },
};

const REVIEW_VIEW_STORAGE_PREFIX = "gst_compliance.transaction_review_views";

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const { selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId, selectedPeriod } = useWorkspaceContext();
  const transactionsSectionRef = useRef<HTMLDivElement | null>(null);
  const advancedSectionsTriggerRef = useRef<HTMLDivElement | null>(null);
  const idsFilterFromUrl = searchParams.get("ids") ?? "";
  const focusIssueFromUrl = searchParams.get("focus") ?? "";
  const suggestedModeFromUrl = searchParams.get("suggest_mode") ?? "";
  const suggestedFieldsFromUrl = searchParams.get("suggest_fields") ?? "";
  const [selectedBatchId, setSelectedBatchId] = useState<string>("all");
  const [transactionType, setTransactionType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [counterpartyGstin, setCounterpartyGstin] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [counterpartyNameDraft, setCounterpartyNameDraft] = useState("");
  const [counterpartyGstinDraft, setCounterpartyGstinDraft] = useState("");
  const [placeOfSupplyDraft, setPlaceOfSupplyDraft] = useState("");
  const [documentTypeDraft, setDocumentTypeDraft] = useState("");
  const [transactionStatusDraft, setTransactionStatusDraft] = useState("imported");
  const [reverseChargeDraft, setReverseChargeDraft] = useState("no");
  const [lineItemsDraft, setLineItemsDraft] = useState<EditableLineItem[]>([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkPlaceOfSupply, setBulkPlaceOfSupply] = useState("");
  const [bulkStatus, setBulkStatus] = useState("review");
  const [bulkReverseCharge, setBulkReverseCharge] = useState("unchanged");
  const [bulkHsnCode, setBulkHsnCode] = useState("");
  const [bulkUqc, setBulkUqc] = useState("");
  const [bulkSupplyCategory, setBulkSupplyCategory] = useState("__empty__");
  const [bulkEcommerceGstin, setBulkEcommerceGstin] = useState("");
  const [bulkIsService, setBulkIsService] = useState("unchanged");
  const [activeRemediationBucketCode, setActiveRemediationBucketCode] = useState<string | null>(null);
  const [activeRemediationSuggestion, setActiveRemediationSuggestion] = useState<SuggestedFixConfig | null>(null);
  const [showRemediationOnly, setShowRemediationOnly] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedReviewView[]>([]);
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  const [savedViewName, setSavedViewName] = useState("");
  const [correctedThisSessionCount, setCorrectedThisSessionCount] = useState(0);
  const [isAssignmentOpen, setIsAssignmentOpen] = useState(false);
  const [assignmentTarget, setAssignmentTarget] = useState<AssignmentDialogTarget | null>(null);
  const [assignmentRecordId, setAssignmentRecordId] = useState<string | null>(null);
  const [assignmentAssignee, setAssignmentAssignee] = useState("unassigned");
  const [assignmentStatusDraft, setAssignmentStatusDraft] = useState("open");
  const [assignmentNotesDraft, setAssignmentNotesDraft] = useState("");
  const [assignmentEscalationNotesDraft, setAssignmentEscalationNotesDraft] = useState("");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("all");
  const [assignmentOwnerFilter, setAssignmentOwnerFilter] = useState("all");
  const [showOnlyMyAssignments, setShowOnlyMyAssignments] = useState(false);
  const [showOnlyEscalatedAssignments, setShowOnlyEscalatedAssignments] = useState(false);
  const [isFollowUpOpen, setIsFollowUpOpen] = useState(false);
  const [followUpDialogMode, setFollowUpDialogMode] = useState<FollowUpDialogMode>("create");
  const [followUpAssignmentId, setFollowUpAssignmentId] = useState<string>("");
  const [followUpRecordId, setFollowUpRecordId] = useState<string | null>(null);
  const [followUpTitleDraft, setFollowUpTitleDraft] = useState("");
  const [followUpTypeDraft, setFollowUpTypeDraft] = useState("reminder");
  const [followUpStatusDraft, setFollowUpStatusDraft] = useState("open");
  const [followUpAssigneeDraft, setFollowUpAssigneeDraft] = useState("unassigned");
  const [followUpNotesDraft, setFollowUpNotesDraft] = useState("");
  const [followUpRemindAtDraft, setFollowUpRemindAtDraft] = useState("");
  const [advancedSectionsVisible, setAdvancedSectionsVisible] = useState(false);
  const hasAppliedSuggestedBulkFixRef = useRef(false);
  const reviewViewStorageKey = useMemo(
    () =>
      [
        REVIEW_VIEW_STORAGE_PREFIX,
        selectedWorkspaceId ?? "workspace",
        selectedClientId ?? "client",
        selectedGstinId ?? "gstin",
        selectedPeriodId ?? "period",
      ].join("."),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );

  const batchFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId,
      client: selectedClientId,
      gstin: selectedGstinId,
      compliance_period: selectedPeriodId,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );
  const batchesQuery = useImportBatchesQuery(batchFilters);
  const transactionsQuery = useGstTransactionsQuery({
    ids: idsFilterFromUrl || undefined,
    client: selectedClientId,
    gstin: selectedGstinId,
    period: selectedPeriodId,
    import_batch: selectedBatchId !== "all" ? selectedBatchId : undefined,
    transaction_type: transactionType !== "all" ? transactionType : undefined,
    status: status !== "all" ? status : undefined,
    counterparty_gstin: counterpartyGstin || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const transactionDetailQuery = useGstTransactionQuery(selectedTransactionId ?? undefined);
  const updateTransactionMutation = useUpdateGstTransactionMutation({
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    import_batch: selectedBatchId !== "all" ? selectedBatchId : undefined,
    transaction_type: transactionType !== "all" ? transactionType : undefined,
    status: status !== "all" ? status : undefined,
    counterparty_gstin: counterpartyGstin || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const bulkUpdateMutation = useBulkUpdateGstTransactionsMutation({
    ids: idsFilterFromUrl || undefined,
    client: selectedClientId ?? undefined,
    gstin: selectedGstinId ?? undefined,
    period: selectedPeriodId ?? undefined,
    import_batch: selectedBatchId !== "all" ? selectedBatchId : undefined,
    transaction_type: transactionType !== "all" ? transactionType : undefined,
    status: status !== "all" ? status : undefined,
    counterparty_gstin: counterpartyGstin || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const remediationSnapshotFilters = useMemo(
    () => ({
      workspace: selectedWorkspaceId ?? undefined,
      client: selectedClientId ?? undefined,
      gstin: selectedGstinId ?? undefined,
      compliance_period: selectedPeriodId ?? undefined,
    }),
    [selectedWorkspaceId, selectedClientId, selectedGstinId, selectedPeriodId],
  );
  const advancedSectionQueriesEnabled = advancedSectionsVisible || isAssignmentOpen || isFollowUpOpen;
  const remediationSnapshotsQuery = useTransactionReviewSnapshotsQuery(remediationSnapshotFilters, { enabled: advancedSectionQueriesEnabled });
  const createRemediationSnapshotMutation = useCreateTransactionReviewSnapshotMutation(remediationSnapshotFilters);
  const deleteRemediationSnapshotMutation = useDeleteTransactionReviewSnapshotMutation(remediationSnapshotFilters);
  const workspaceMembersQuery = useWorkspaceMembersQuery(selectedWorkspaceId ?? undefined, { enabled: advancedSectionQueriesEnabled });
  const remediationAssignmentsQuery = useTransactionRemediationAssignmentsQuery(remediationSnapshotFilters, { enabled: advancedSectionQueriesEnabled });
  const remediationFollowUpsQuery = useTransactionRemediationFollowUpsQuery(remediationSnapshotFilters, { enabled: advancedSectionQueriesEnabled });
  const createRemediationAssignmentMutation = useCreateTransactionRemediationAssignmentMutation(remediationSnapshotFilters);
  const updateRemediationAssignmentMutation = useUpdateTransactionRemediationAssignmentMutation(remediationSnapshotFilters);
  const deleteRemediationAssignmentMutation = useDeleteTransactionRemediationAssignmentMutation(remediationSnapshotFilters);
  const escalateRemediationAssignmentMutation = useEscalateTransactionRemediationAssignmentMutation(remediationSnapshotFilters);
  const clearRemediationAssignmentEscalationMutation = useClearTransactionRemediationAssignmentEscalationMutation(remediationSnapshotFilters);
  const createRemediationFollowUpMutation = useCreateTransactionRemediationFollowUpMutation(remediationSnapshotFilters);
  const updateRemediationFollowUpMutation = useUpdateTransactionRemediationFollowUpMutation(remediationSnapshotFilters);
  const deleteRemediationFollowUpMutation = useDeleteTransactionRemediationFollowUpMutation(remediationSnapshotFilters);
  const completeRemediationFollowUpMutation = useCompleteTransactionRemediationFollowUpMutation(remediationSnapshotFilters);
  const dismissRemediationFollowUpMutation = useDismissTransactionRemediationFollowUpMutation(remediationSnapshotFilters);
  const sendRemediationFollowUpMutation = useSendTransactionRemediationFollowUpMutation(remediationSnapshotFilters);
  const suggestedFix = useMemo(() => {
    const baseSuggestion = readinessSuggestions[focusIssueFromUrl] ?? null;
    if (!baseSuggestion && !suggestedModeFromUrl) {
      return null;
    }
    const fieldsFromUrl = suggestedFieldsFromUrl
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return {
      mode: (suggestedModeFromUrl || baseSuggestion?.mode || "row_review") as "bulk_correct" | "row_review",
      fields: fieldsFromUrl.length > 0 ? fieldsFromUrl : (baseSuggestion?.fields ?? []),
      title: baseSuggestion?.title ?? "Suggested fix",
      detail: baseSuggestion?.detail ?? "Review the selected transactions and apply the suggested correction.",
    };
  }, [focusIssueFromUrl, suggestedFieldsFromUrl, suggestedModeFromUrl]);
  const effectiveSuggestedFix = activeRemediationSuggestion ?? suggestedFix;
  const remediationSnapshot = remediationSnapshotsQuery.data?.items[0] ?? null;
  const selectedPeriodDueDate = selectedPeriod?.due_date ?? null;
  const remediationAssignments = useMemo(
    () => remediationAssignmentsQuery.data?.items ?? [],
    [remediationAssignmentsQuery.data?.items],
  );
  const remediationFollowUps = useMemo(
    () => remediationFollowUpsQuery.data?.items ?? [],
    [remediationFollowUpsQuery.data?.items],
  );
  const filteredRemediationAssignments = useMemo(() => {
    return remediationAssignments.filter((assignment) => {
      if (assignmentStatusFilter !== "all" && assignment.status !== assignmentStatusFilter) {
        return false;
      }
      if (assignmentOwnerFilter !== "all") {
        const normalizedOwner = assignment.assigned_to ? String(assignment.assigned_to) : "unassigned";
        if (normalizedOwner !== assignmentOwnerFilter) {
          return false;
        }
      }
      if (showOnlyMyAssignments && assignment.assigned_to !== user?.id) {
        return false;
      }
      if (showOnlyEscalatedAssignments && !assignment.is_escalated) {
        return false;
      }
      return true;
    });
  }, [assignmentOwnerFilter, assignmentStatusFilter, remediationAssignments, showOnlyEscalatedAssignments, showOnlyMyAssignments, user?.id]);
  const openRemediationFollowUps = useMemo(
    () => remediationFollowUps.filter((followUp) => followUp.status === "open" || followUp.status === "sent"),
    [remediationFollowUps],
  );
  const followUpsDueSoon = useMemo(() => {
    const now = new Date();
    return openRemediationFollowUps
      .filter((followUp) => new Date(followUp.remind_at).getTime() <= now.getTime() + 2 * 24 * 60 * 60 * 1000)
      .sort((left, right) => new Date(left.remind_at).getTime() - new Date(right.remind_at).getTime());
  }, [openRemediationFollowUps]);
  const remediationBucketAssignments = useMemo(() => {
    const map = new Map<string, (typeof remediationAssignments)[number]>();
    for (const assignment of remediationAssignments) {
      if (!assignment.bucket_code) {
        continue;
      }
      const current = map.get(assignment.bucket_code);
      if (!current) {
        map.set(assignment.bucket_code, assignment);
        continue;
      }
      const currentRank = current.status === "resolved" ? 2 : current.status === "deferred" ? 1 : 0;
      const nextRank = assignment.status === "resolved" ? 2 : assignment.status === "deferred" ? 1 : 0;
      if (nextRank < currentRank || new Date(assignment.updated_at).getTime() > new Date(current.updated_at).getTime()) {
        map.set(assignment.bucket_code, assignment);
      }
    }
    return map;
  }, [remediationAssignments]);
  const assignmentMetrics = useMemo(() => {
    const now = new Date();
    const periodDueDate = selectedPeriodDueDate ? new Date(selectedPeriodDueDate) : null;
    const overdueCount = filteredRemediationAssignments.filter((assignment) => {
      if (assignment.status === "resolved" || assignment.status === "deferred") {
        return false;
      }
      if (periodDueDate) {
        return now.getTime() > periodDueDate.getTime();
      }
      const ageMs = now.getTime() - new Date(assignment.created_at).getTime();
      return ageMs >= 5 * 24 * 60 * 60 * 1000;
    }).length;
    const assigneeCounts = new Map<string, { name: string; count: number }>();
    for (const assignment of filteredRemediationAssignments) {
      const key = assignment.assigned_to ? String(assignment.assigned_to) : "unassigned";
      const current = assigneeCounts.get(key);
      if (current) {
        current.count += 1;
      } else {
        assigneeCounts.set(key, {
          name: assignment.assigned_to_name ?? "Unassigned",
          count: 1,
        });
      }
    }
    const workload = Array.from(assigneeCounts.values()).sort((left, right) => right.count - left.count);
    return {
      total: filteredRemediationAssignments.length,
      open: filteredRemediationAssignments.filter((assignment) => assignment.status === "open").length,
      inProgress: filteredRemediationAssignments.filter((assignment) => assignment.status === "in_progress").length,
      resolved: filteredRemediationAssignments.filter((assignment) => assignment.status === "resolved").length,
      deferred: filteredRemediationAssignments.filter((assignment) => assignment.status === "deferred").length,
      overdue: overdueCount,
      workload,
    };
  }, [filteredRemediationAssignments, selectedPeriodDueDate]);
  const assignmentRowMeta = useMemo(() => {
    const nowTime = new Date().getTime();
    const dueDateTime = selectedPeriodDueDate ? new Date(selectedPeriodDueDate).getTime() : null;
    return Object.fromEntries(
      filteredRemediationAssignments.map((assignment) => {
        const createdAtTime = new Date(assignment.created_at).getTime();
        const updatedAtTime = new Date(assignment.updated_at).getTime();
        const ageDays = Math.max(0, Math.floor((nowTime - createdAtTime) / (24 * 60 * 60 * 1000)));
        const updatedDays = Math.max(0, Math.floor((nowTime - updatedAtTime) / (24 * 60 * 60 * 1000)));
        const isOverdue =
          assignment.status !== "resolved" &&
          assignment.status !== "deferred" &&
          (dueDateTime ? nowTime > dueDateTime : ageDays >= 5);
        const isStale =
          !isOverdue && assignment.status !== "resolved" && assignment.status !== "deferred" && updatedDays >= 3;
        return [
          assignment.id,
          {
            ageDays,
            updatedDays,
            isOverdue,
            isStale,
          },
        ];
      }),
    );
  }, [filteredRemediationAssignments, selectedPeriodDueDate]);
  const assignmentAttentionItems = useMemo(() => {
    const now = new Date();
    const periodDueDate = selectedPeriodDueDate ? new Date(selectedPeriodDueDate) : null;
    return filteredRemediationAssignments
      .filter((assignment) => assignment.status !== "resolved" && assignment.status !== "deferred")
      .map((assignment) => {
        const createdAt = new Date(assignment.created_at);
        const updatedAt = new Date(assignment.updated_at);
        const ageDays = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)));
        const updatedDays = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000)));
        const isOverdue = periodDueDate ? now.getTime() > periodDueDate.getTime() : ageDays >= 5;
        const priority = isOverdue ? "overdue" : updatedDays >= 3 ? "stale" : "watch";
        return {
          assignment,
          ageDays,
          updatedDays,
          isOverdue,
          priority,
        };
      })
      .sort((left, right) => {
        const rank = (value: string) => (value === "overdue" ? 0 : value === "stale" ? 1 : 2);
        const byPriority = rank(left.priority) - rank(right.priority);
        if (byPriority !== 0) {
          return byPriority;
        }
        return right.ageDays - left.ageDays;
      });
  }, [filteredRemediationAssignments, selectedPeriodDueDate]);

  const remediationBuckets = useMemo<RemediationBucket[]>(() => {
    const transactions = transactionsQuery.data?.items ?? [];
    if (transactions.length === 0) {
      return [];
    }

    const buckets = new Map<string, { title: string; detail: string; transactionIds: string[]; suggestedFix: SuggestedFixConfig }>();
    const register = (code: string, title: string, detail: string, transactionId: string, suggestedFixConfig: SuggestedFixConfig) => {
      const existing = buckets.get(code);
      if (existing) {
        if (!existing.transactionIds.includes(transactionId)) {
          existing.transactionIds.push(transactionId);
        }
        return;
      }
      buckets.set(code, {
        title,
        detail,
        transactionIds: [transactionId],
        suggestedFix: suggestedFixConfig,
      });
    };

    for (const transaction of transactions) {
      const metadata = (transaction.metadata ?? {}) as Record<string, unknown>;
      const lineItems = normalizeLineItems(metadata);
      const missingHsn = lineItems.some((lineItem) => !lineItem.hsn_code);
      const missingUqc = lineItems.some((lineItem) => !lineItem.uqc);
      const missingQuantity = lineItems.some((lineItem) => !lineItem.quantity || lineItem.quantity === "0" || lineItem.quantity === "0.00");
      const missingSupplyCategory = lineItems.some((lineItem) => !lineItem.supply_category);
      const conflictingSupplyCategory =
        Array.isArray(metadata.mixed_fields) &&
        metadata.mixed_fields.map((value) => String(value)).includes("supply_category");

      if (missingHsn) {
        register("missing_hsn", "Missing HSN", "Transactions missing HSN codes that will weaken HSN summaries and filing output.", transaction.id, readinessSuggestions.missing_hsn);
      }
      if (missingUqc) {
        register("missing_uqc", "Missing UQC", "Transactions missing unit quantity codes that should be completed before final export.", transaction.id, readinessSuggestions.missing_uqc);
      }
      if (missingQuantity) {
        register("missing_quantity", "Missing quantity", "Transactions with incomplete quantity values that usually need invoice-level review.", transaction.id, readinessSuggestions.missing_quantity);
      }
      if (missingSupplyCategory) {
        register("missing_supply_category", "Missing supply category", "Transactions that still need taxable, nil-rated, exempt, or non-GST classification.", transaction.id, readinessSuggestions.missing_supply_category);
      }
      if (conflictingSupplyCategory) {
        register("conflicting_supply_category", "Conflicting supply category", "Transactions with mixed supply categories across line items that need manual review.", transaction.id, readinessSuggestions.conflicting_supply_category);
      }
    }

    return Array.from(buckets.entries())
      .map(([code, value]) => ({
        code,
        title: value.title,
        detail: value.detail,
        count: value.transactionIds.length,
        transactionIds: value.transactionIds,
        suggestedFix: value.suggestedFix,
      }))
      .sort((left, right) => right.count - left.count);
  }, [transactionsQuery.data?.items]);
  const activeRemediationBucket =
    remediationBuckets.find((bucket) => bucket.code === activeRemediationBucketCode) ?? null;
  const remediationSnapshotMetrics = useMemo(() => {
    const currentCounts = Object.fromEntries(remediationBuckets.map((bucket) => [bucket.code, bucket.count]));
    const snapshotCounts = remediationSnapshot?.bucket_counts ?? {};
    const resolvedSinceSnapshot = Object.keys(snapshotCounts).reduce((sum, code) => {
      const previous = snapshotCounts[code] ?? 0;
      const current = currentCounts[code] ?? 0;
      return sum + Math.max(previous - current, 0);
    }, 0);
    const newSinceSnapshot = Object.keys(currentCounts).reduce((sum, code) => {
      const previous = snapshotCounts[code] ?? 0;
      const current = currentCounts[code] ?? 0;
      return sum + Math.max(current - previous, 0);
    }, 0);
    return {
      resolvedSinceSnapshot,
      newSinceSnapshot,
    };
  }, [remediationBuckets, remediationSnapshot]);
  const displayedTransactions = useMemo(() => {
    const baseTransactions = transactionsQuery.data?.items ?? [];
    if (!showRemediationOnly || !activeRemediationBucket) {
      return baseTransactions;
    }
    const activeIds = new Set(activeRemediationBucket.transactionIds);
    return baseTransactions.filter((transaction) => activeIds.has(transaction.id));
  }, [activeRemediationBucket, showRemediationOnly, transactionsQuery.data?.items]);
  const remediationMetrics = useMemo(
    () => ({
      totalVisibleRows: displayedTransactions.length,
      totalIssueBuckets: remediationBuckets.length,
      activeBucketRows: activeRemediationBucket?.transactionIds.length ?? 0,
      selectedRows: selectedTransactionIds.length,
      remainingOpenRows:
        showRemediationOnly && activeRemediationBucket
          ? displayedTransactions.length
          : remediationBuckets.reduce((sum, bucket) => sum + bucket.transactionIds.length, 0),
    }),
    [activeRemediationBucket, displayedTransactions.length, remediationBuckets, selectedTransactionIds.length, showRemediationOnly],
  );

  useEffect(() => {
    hasAppliedSuggestedBulkFixRef.current = false;
  }, [idsFilterFromUrl, focusIssueFromUrl, suggestedFieldsFromUrl, suggestedModeFromUrl]);

  useEffect(() => {
    const element = advancedSectionsTriggerRef.current;
    if (!element || advancedSectionsVisible) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setAdvancedSectionsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [advancedSectionsVisible]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(reviewViewStorageKey);
    const nextViews = raw ? (JSON.parse(raw) as SavedReviewView[]) : [];
    window.setTimeout(() => {
      setSavedViews(nextViews);
    }, 0);
  }, [reviewViewStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(reviewViewStorageKey, JSON.stringify(savedViews));
  }, [reviewViewStorageKey, savedViews]);

  const handleExport = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId) {
      toast.error("Select workspace, client, and period before exporting transactions.");
      return;
    }
    try {
      await downloadFile(
        "/exports/transactions/",
        {
          workspace: selectedWorkspaceId,
          client: selectedClientId,
          gstin: selectedGstinId ?? undefined,
          compliance_period: selectedPeriodId,
          import_batch: selectedBatchId !== "all" ? selectedBatchId : undefined,
          transaction_type: transactionType !== "all" ? transactionType : undefined,
          status: status !== "all" ? status : undefined,
          counterparty_gstin: counterpartyGstin || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
        "transaction-review.xlsx",
      );
      toast.success("Transaction review export downloaded.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleLineItemChange = (index: number, field: keyof EditableLineItem, value: string | boolean) => {
    setLineItemsDraft((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  const openEditDialog = () => {
    if (!transactionDetailQuery.data) {
      return;
    }
    setCounterpartyNameDraft(transactionDetailQuery.data.counterparty_name ?? "");
    setCounterpartyGstinDraft(transactionDetailQuery.data.counterparty_gstin ?? "");
    setPlaceOfSupplyDraft(transactionDetailQuery.data.place_of_supply ?? "");
    setDocumentTypeDraft(transactionDetailQuery.data.document_type ?? "");
    setTransactionStatusDraft(transactionDetailQuery.data.status ?? "imported");
    setReverseChargeDraft(transactionDetailQuery.data.reverse_charge ? "yes" : "no");
    setLineItemsDraft(normalizeLineItems(transactionDetailQuery.data.metadata));
    setIsEditOpen(true);
  };

  const handleSaveCorrections = async () => {
    if (!transactionDetailQuery.data) {
      return;
    }
    try {
      await updateTransactionMutation.mutateAsync({
        transactionId: transactionDetailQuery.data.id,
        counterparty_name: counterpartyNameDraft,
        counterparty_gstin: counterpartyGstinDraft,
        place_of_supply: placeOfSupplyDraft,
        document_type: documentTypeDraft,
        reverse_charge: reverseChargeDraft === "yes",
        status: transactionStatusDraft,
        metadata: {
          line_items: lineItemsDraft.map((item) => ({
            hsn_code: item.hsn_code,
            description: item.description,
            uqc: item.uqc,
            quantity: item.quantity,
            is_service: item.is_service,
            supply_category: item.supply_category,
            ecommerce_gstin: item.ecommerce_gstin,
            taxable_value: item.taxable_value,
            cgst_amount: item.cgst_amount,
            sgst_amount: item.sgst_amount,
            igst_amount: item.igst_amount,
            cess_amount: item.cess_amount,
            total_amount: item.total_amount,
          })),
        },
      });
      toast.success("Transaction corrections saved.");
      setCorrectedThisSessionCount((current) => current + 1);
      setIsEditOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const toggleTransactionSelection = (transactionId: string) => {
    setSelectedTransactionIds((current) =>
      current.includes(transactionId) ? current.filter((id) => id !== transactionId) : [...current, transactionId],
    );
  };

  const visibleTransactionIds = displayedTransactions.map((transaction) => transaction.id);
  const allVisibleSelected = visibleTransactionIds.length > 0 && visibleTransactionIds.every((id) => selectedTransactionIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedTransactionIds((current) => current.filter((id) => !visibleTransactionIds.includes(id)));
      return;
    }
    setSelectedTransactionIds((current) => Array.from(new Set([...current, ...visibleTransactionIds])));
  };

  const openBulkEditDialog = () => {
    setBulkPlaceOfSupply("");
    setBulkStatus("review");
    setBulkReverseCharge("unchanged");
    setBulkHsnCode("");
    setBulkUqc("");
    setBulkSupplyCategory("__empty__");
    setBulkEcommerceGstin("");
    setBulkIsService("unchanged");
    setIsBulkEditOpen(true);
  };

  useEffect(() => {
    if (!idsFilterFromUrl || !suggestedFix || suggestedFix.mode !== "bulk_correct" || hasAppliedSuggestedBulkFixRef.current) {
      return;
    }
    if (!transactionsQuery.data || transactionsQuery.data.items.length === 0) {
      return;
    }
    if (selectedPeriod?.is_locked) {
      return;
    }
    const autoSelectedIds = transactionsQuery.data.items.map((transaction) => transaction.id);
    const alreadySelected =
      autoSelectedIds.length > 0 &&
      autoSelectedIds.length === selectedTransactionIds.length &&
      autoSelectedIds.every((id) => selectedTransactionIds.includes(id));
    if (!alreadySelected) {
      window.setTimeout(() => {
        setSelectedTransactionIds(autoSelectedIds);
      }, 0);
    }
    if (!isBulkEditOpen) {
      window.setTimeout(() => {
        openBulkEditDialog();
      }, 0);
    }
    hasAppliedSuggestedBulkFixRef.current = true;
  }, [
    idsFilterFromUrl,
    isBulkEditOpen,
    selectedPeriod?.is_locked,
    selectedTransactionIds,
    suggestedFix,
    transactionsQuery.data,
  ]);

  const handleBulkSave = async () => {
    if (selectedTransactionIds.length === 0) {
      toast.error("Select at least one transaction for bulk correction.");
      return;
    }
    try {
      await bulkUpdateMutation.mutateAsync({
        ids: selectedTransactionIds,
        place_of_supply: bulkPlaceOfSupply || undefined,
        status: bulkStatus || undefined,
        reverse_charge: bulkReverseCharge === "unchanged" ? undefined : bulkReverseCharge === "yes",
        metadata_updates: {
          hsn_code: bulkHsnCode || undefined,
          uqc: bulkUqc || undefined,
          supply_category: bulkSupplyCategory === "__empty__" ? undefined : bulkSupplyCategory,
          ecommerce_gstin: bulkEcommerceGstin || undefined,
          is_service: bulkIsService === "unchanged" ? undefined : bulkIsService === "yes",
        },
      });
      toast.success(`${selectedTransactionIds.length} transaction(s) corrected.`);
      setCorrectedThisSessionCount((current) => current + selectedTransactionIds.length);
      setSelectedTransactionIds([]);
      setIsBulkEditOpen(false);
      setActiveRemediationBucketCode(null);
      setActiveRemediationSuggestion(null);
      setShowRemediationOnly(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const suggestedFieldSet = new Set(effectiveSuggestedFix?.fields ?? []);
  const getSuggestedFieldClassName = (field: string) =>
    suggestedFieldSet.has(field) ? "border-indigo-300 bg-indigo-50/60" : "";

  const handleRemediationBucket = (bucket: RemediationBucket) => {
    setActiveRemediationBucketCode(bucket.code);
    setActiveRemediationSuggestion(bucket.suggestedFix);
    setShowRemediationOnly(true);
    setSelectedTransactionIds(bucket.transactionIds);
    transactionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (bucket.suggestedFix.mode === "bulk_correct" && !selectedPeriod?.is_locked) {
      openBulkEditDialog();
      return;
    }
    if (bucket.transactionIds.length > 0) {
      setSelectedTransactionId(bucket.transactionIds[0]);
    }
  };

  const handleSaveCurrentView = () => {
    const trimmedName = savedViewName.trim();
    if (!trimmedName) {
      toast.error("Name the saved view before storing it.");
      return;
    }
    const nextView: SavedReviewView = {
      id: `${Date.now()}`,
      name: trimmedName,
      filters: {
        selectedBatchId,
        transactionType,
        status,
        counterpartyGstin,
        dateFrom,
        dateTo,
        activeRemediationBucketCode,
        showRemediationOnly,
      },
    };
    setSavedViews((current) => [nextView, ...current].slice(0, 8));
    setSavedViewName("");
    setIsSaveViewOpen(false);
    toast.success("Review view saved.");
  };

  const applySavedView = (view: SavedReviewView) => {
    setSelectedBatchId(view.filters.selectedBatchId);
    setTransactionType(view.filters.transactionType);
    setStatus(view.filters.status);
    setCounterpartyGstin(view.filters.counterpartyGstin);
    setDateFrom(view.filters.dateFrom);
    setDateTo(view.filters.dateTo);
    setActiveRemediationBucketCode(view.filters.activeRemediationBucketCode);
    setShowRemediationOnly(view.filters.showRemediationOnly);
    setSelectedTransactionIds([]);
    setActiveRemediationSuggestion(
      view.filters.activeRemediationBucketCode
        ? remediationBuckets.find((bucket) => bucket.code === view.filters.activeRemediationBucketCode)?.suggestedFix ?? null
        : null,
    );
    toast.success(`Applied view: ${view.name}`);
  };

  const removeSavedView = (viewId: string) => {
    setSavedViews((current) => current.filter((view) => view.id !== viewId));
    toast.success("Saved view removed.");
  };

  const openAssignmentDialog = (target: AssignmentDialogTarget, existingAssignmentId?: string) => {
    const existingAssignment = existingAssignmentId
      ? remediationAssignments.find((assignment) => assignment.id === existingAssignmentId) ?? null
      : target.mode === "bucket"
        ? remediationBucketAssignments.get(target.bucketCode) ?? null
        : null;
    setAssignmentTarget(target);
    setAssignmentRecordId(existingAssignment?.id ?? null);
    setAssignmentAssignee(existingAssignment?.assigned_to ? String(existingAssignment.assigned_to) : "unassigned");
    setAssignmentStatusDraft(existingAssignment?.status ?? "open");
    setAssignmentNotesDraft(existingAssignment?.notes ?? "");
    setAssignmentEscalationNotesDraft(existingAssignment?.escalation_notes ?? "");
    setIsAssignmentOpen(true);
  };

  const handleAssignmentSubmit = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId || !assignmentTarget) {
      toast.error("Choose workspace, client, and period before assigning remediation work.");
      return;
    }
    try {
      if (assignmentRecordId) {
        await updateRemediationAssignmentMutation.mutateAsync({
          assignmentId: assignmentRecordId,
          assigned_to: assignmentAssignee === "unassigned" ? null : Number(assignmentAssignee),
          status: assignmentStatusDraft,
          notes: assignmentNotesDraft,
        });
        toast.success("Remediation assignment updated.");
      } else {
        await createRemediationAssignmentMutation.mutateAsync({
          workspace: selectedWorkspaceId,
          client: selectedClientId,
          gstin: selectedGstinId ?? null,
          compliance_period: selectedPeriodId,
          snapshot: remediationSnapshot?.id ?? null,
          bucket_code: assignmentTarget.mode === "bucket" ? assignmentTarget.bucketCode : "",
          title: assignmentTarget.title,
          transaction_ids: assignmentTarget.transactionIds,
          filters: {
            selectedBatchId,
            transactionType,
            status,
            counterpartyGstin,
            dateFrom,
            dateTo,
            activeRemediationBucketCode,
            showRemediationOnly,
          },
          status: assignmentStatusDraft as "open" | "in_progress" | "resolved" | "deferred",
          assigned_to: assignmentAssignee === "unassigned" ? null : Number(assignmentAssignee),
          notes: assignmentNotesDraft,
          escalation_notes: assignmentEscalationNotesDraft,
        });
        toast.success("Remediation assignment created.");
      }
      setIsAssignmentOpen(false);
      setAssignmentTarget(null);
      setAssignmentRecordId(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      await deleteRemediationAssignmentMutation.mutateAsync(assignmentId);
      toast.success("Remediation assignment deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleEscalateAssignment = async (assignmentId: string, escalationNotes?: string) => {
    try {
      await escalateRemediationAssignmentMutation.mutateAsync({
        assignmentId,
        escalation_notes: escalationNotes,
      });
      toast.success("Remediation assignment escalated.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleClearEscalation = async (assignmentId: string) => {
    try {
      await clearRemediationAssignmentEscalationMutation.mutateAsync(assignmentId);
      toast.success("Remediation escalation cleared.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openFollowUpDialog = (assignmentId: string, followUpId?: string) => {
    const existingFollowUp = followUpId
      ? remediationFollowUps.find((followUp) => followUp.id === followUpId) ?? null
      : null;
    const assignment = remediationAssignments.find((entry) => entry.id === assignmentId) ?? null;
    const nextRemindAt =
      existingFollowUp?.remind_at ??
      (() => {
        const date = new Date();
        date.setHours(date.getHours() + 24);
        return date.toISOString().slice(0, 16);
      })();
    setFollowUpDialogMode(existingFollowUp ? "edit" : "create");
    setFollowUpAssignmentId(assignmentId);
    setFollowUpRecordId(existingFollowUp?.id ?? null);
    setFollowUpTitleDraft(existingFollowUp?.title ?? `${assignment?.title ?? "Remediation queue"} follow-up`);
    setFollowUpTypeDraft(existingFollowUp?.follow_up_type ?? (assignment?.is_escalated ? "manager_review" : "reminder"));
    setFollowUpStatusDraft(existingFollowUp?.status ?? "open");
    setFollowUpAssigneeDraft(existingFollowUp?.assigned_to ? String(existingFollowUp.assigned_to) : (assignment?.assigned_to ? String(assignment.assigned_to) : "unassigned"));
    setFollowUpNotesDraft(existingFollowUp?.notes ?? "");
    setFollowUpRemindAtDraft(nextRemindAt.slice(0, 16));
    setIsFollowUpOpen(true);
  };

  const handleFollowUpSubmit = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId || !followUpAssignmentId) {
      toast.error("Choose workspace, client, period, and assignment before creating a follow-up.");
      return;
    }
    try {
      if (followUpDialogMode === "edit" && followUpRecordId) {
        await updateRemediationFollowUpMutation.mutateAsync({
          followUpId: followUpRecordId,
          assigned_to: followUpAssigneeDraft === "unassigned" ? null : Number(followUpAssigneeDraft),
          follow_up_type: followUpTypeDraft as "reminder" | "manager_review" | "escalation_check" | "close_checkpoint",
          status: followUpStatusDraft as "open" | "sent" | "completed" | "dismissed",
          title: followUpTitleDraft,
          notes: followUpNotesDraft,
          remind_at: new Date(followUpRemindAtDraft).toISOString(),
        });
        toast.success("Follow-up updated.");
      } else {
        await createRemediationFollowUpMutation.mutateAsync({
          workspace: selectedWorkspaceId,
          client: selectedClientId,
          gstin: selectedGstinId ?? null,
          compliance_period: selectedPeriodId,
          assignment: followUpAssignmentId,
          assigned_to: followUpAssigneeDraft === "unassigned" ? null : Number(followUpAssigneeDraft),
          follow_up_type: followUpTypeDraft as "reminder" | "manager_review" | "escalation_check" | "close_checkpoint",
          status: followUpStatusDraft as "open" | "sent" | "completed" | "dismissed",
          title: followUpTitleDraft,
          notes: followUpNotesDraft,
          remind_at: new Date(followUpRemindAtDraft).toISOString(),
        });
        toast.success("Follow-up created.");
      }
      setIsFollowUpOpen(false);
      setFollowUpRecordId(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDeleteFollowUp = async (followUpId: string) => {
    try {
      await deleteRemediationFollowUpMutation.mutateAsync(followUpId);
      toast.success("Follow-up deleted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleCompleteFollowUp = async (followUpId: string) => {
    try {
      await completeRemediationFollowUpMutation.mutateAsync({ followUpId });
      toast.success("Follow-up completed.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDismissFollowUp = async (followUpId: string) => {
    try {
      await dismissRemediationFollowUpMutation.mutateAsync({ followUpId });
      toast.success("Follow-up dismissed.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSendFollowUp = async (followUpId: string) => {
    try {
      await sendRemediationFollowUpMutation.mutateAsync(followUpId);
      toast.success("Follow-up reminder sent.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const captureRemediationSnapshot = async () => {
    if (!selectedWorkspaceId || !selectedClientId || !selectedPeriodId) {
      toast.error("Select workspace, client, and period before capturing a remediation snapshot.");
      return;
    }
    try {
      await createRemediationSnapshotMutation.mutateAsync({
        workspace: selectedWorkspaceId,
        client: selectedClientId,
        gstin: selectedGstinId ?? undefined,
        compliance_period: selectedPeriodId,
        name: activeRemediationBucket?.title ?? "Monthly remediation checkpoint",
        filters: {
          selectedBatchId,
          transactionType,
          status,
          counterpartyGstin,
          dateFrom,
          dateTo,
          activeRemediationBucketCode,
          showRemediationOnly,
        },
        bucket_counts: Object.fromEntries(remediationBuckets.map((bucket) => [bucket.code, bucket.count])),
      });
      toast.success("Shared remediation snapshot captured.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const clearRemediationSnapshot = async () => {
    if (!remediationSnapshot) {
      return;
    }
    try {
      await deleteRemediationSnapshotMutation.mutateAsync(remediationSnapshot.id);
      toast.success("Shared remediation snapshot cleared.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaction Review"
        description="Review normalized GST transactions after import, inspect source context, and isolate rows that need follow-up before reconciliation."
        actions={[
          {
            label: "Export XLSX",
            onClick: handleExport,
            disabled: !selectedWorkspaceId || !selectedClientId || !selectedPeriodId,
          },
          {
            label: selectedTransactionIds.length > 0 ? `Bulk correct (${selectedTransactionIds.length})` : "Bulk correct",
            onClick: openBulkEditDialog,
            disabled: selectedTransactionIds.length === 0 || Boolean(selectedPeriod?.is_locked),
          },
        ]}
      />

      <SectionCard title="Review filters" description="Narrow the imported transaction stream by workspace context, batch, type, status, GSTIN, and date range.">
        {!selectedClientId || !selectedPeriodId ? (
          <EmptyState
            title="Select client and period first"
            description="Use the topbar selectors to choose a client and compliance period before reviewing normalized transactions."
          />
        ) : (
          <div className="space-y-4">
            {idsFilterFromUrl ? (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                Showing the exact transactions linked to <span className="font-semibold">{focusIssueFromUrl.replace(/_/g, " ") || "a readiness issue"}</span>.
                Clear the URL query to return to the full transaction review set.
              </div>
            ) : null}
            {suggestedFix ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">{suggestedFix.title}</p>
                <p className="mt-1">{suggestedFix.detail}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={showRemediationOnly ? "default" : "outline"} onClick={() => setShowRemediationOnly((current) => !current)}>
                {showRemediationOnly ? "Showing remediation only" : "Show remediation only"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsSaveViewOpen(true)}>
                <ActionLabel kind="save" label="Save current view" />
              </Button>
              {activeRemediationBucket ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActiveRemediationBucketCode(null);
                    setActiveRemediationSuggestion(null);
                    setShowRemediationOnly(false);
                  }}
                >
                  <ActionLabel kind="clear" label="Clear active bucket" />
                </Button>
              ) : null}
            </div>
            {savedViews.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">Saved review views</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {savedViews.map((view) => (
                    <div key={view.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                      <button type="button" className="font-medium hover:text-indigo-600" onClick={() => applySavedView(view)}>
                        {view.name}
                      </button>
                      <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => removeSavedView(view.id)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
              <SelectTrigger className="h-10 bg-slate-50">
                <SelectValue placeholder="Import batch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All import batches</SelectItem>
                {(batchesQuery.data?.items ?? []).map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.file_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={transactionType} onValueChange={setTransactionType}>
              <SelectTrigger className="h-10 bg-slate-50">
                <SelectValue placeholder="Transaction type" />
              </SelectTrigger>
              <SelectContent>
                {transactionTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 bg-slate-50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input value={counterpartyGstin} onChange={(event) => setCounterpartyGstin(event.target.value)} placeholder="Counterparty GSTIN" />
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            {selectedTransactionIds.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span>{selectedTransactionIds.length} transaction(s) selected for bulk correction.</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openAssignmentDialog({
                      mode: "selection",
                      title: `Selected remediation rows (${selectedTransactionIds.length})`,
                      transactionIds: selectedTransactionIds,
                    })
                  }
                >
                  <ActionLabel kind="manage" label="Assign selected rows" />
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Visible Rows"
          value={String(remediationMetrics.totalVisibleRows)}
          detail="Transactions currently visible under the active filters and remediation mode."
          tone="primary"
        />
        <StatCard
          label="Issue Buckets"
          value={String(remediationMetrics.totalIssueBuckets)}
          detail="Distinct remediation groups currently detected in the working transaction set."
          tone="warning"
        />
        <StatCard
          label="Active Bucket"
          value={activeRemediationBucket ? String(remediationMetrics.activeBucketRows) : "—"}
          detail={activeRemediationBucket ? `${activeRemediationBucket.title} rows in focus.` : "No remediation bucket is currently active."}
          tone="danger"
        />
        <StatCard
          label="Selected Rows"
          value={String(remediationMetrics.selectedRows)}
          detail="Transactions selected right now for bulk correction or targeted review."
          tone="success"
        />
        <StatCard
          label="Corrected This Session"
          value={String(correctedThisSessionCount)}
          detail="Rows updated during this browser session through single-row or bulk correction."
          tone="primary"
        />
        <StatCard
          label="Remaining Queue"
          value={String(remediationMetrics.remainingOpenRows)}
          detail={
            showRemediationOnly && activeRemediationBucket
              ? "Rows still visible in the active remediation bucket."
              : "Total transactions still represented across the current remediation buckets."
          }
          tone="warning"
        />
        <StatCard
          label="Resolved Since Snapshot"
          value={String(remediationSnapshotMetrics.resolvedSinceSnapshot)}
          detail={
            remediationSnapshot
              ? `Compared with snapshot captured on ${format(new Date(remediationSnapshot.created_at), "dd MMM yyyy, h:mm a")}.`
              : "Capture a snapshot to measure remediation progress over time."
          }
          tone="success"
        />
        <StatCard
          label="New Since Snapshot"
          value={String(remediationSnapshotMetrics.newSinceSnapshot)}
          detail={
            remediationSnapshot
              ? "Rows added to the remediation queue after the last snapshot."
              : "Tracks newly surfaced queue rows once a snapshot exists."
          }
          tone="danger"
        />
      </div>

      <div ref={advancedSectionsTriggerRef}>
      <SectionCard
        title="Remediation snapshots"
        description="Checkpoint the current remediation queue so you can measure what was resolved or newly surfaced later."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={captureRemediationSnapshot} disabled={remediationBuckets.length === 0}>
              {createRemediationSnapshotMutation.isPending ? "Capturing..." : <ActionLabel kind="save" label="Capture snapshot" />}
            </Button>
            {remediationSnapshot ? (
              <Button size="sm" variant="outline" onClick={clearRemediationSnapshot} disabled={deleteRemediationSnapshotMutation.isPending}>
                {deleteRemediationSnapshotMutation.isPending ? "Clearing..." : <ActionLabel kind="clear" label="Clear snapshot" />}
              </Button>
            ) : null}
          </div>
        }
      >
        {!advancedSectionQueriesEnabled ? (
          <LoadingState message="Preparing remediation analytics..." />
        ) : remediationSnapshotsQuery.isLoading ? (
          <LoadingState message="Loading remediation snapshot..." />
        ) : remediationSnapshot ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">
              Current snapshot: {format(new Date(remediationSnapshot.created_at), "dd MMM yyyy, h:mm a")}
            </p>
            <p className="mt-1 text-slate-600">
              Captured by {remediationSnapshot.created_by_name ?? "a team member"}{remediationSnapshot.name ? ` • ${remediationSnapshot.name}` : ""}.
            </p>
            <p className="mt-1">
              Use this as your baseline for monthly close progress. The analytics cards above now compare current bucket counts
              against this saved checkpoint.
            </p>
          </div>
        ) : (
          <EmptyState
            title="No remediation snapshot yet"
            description="Capture the current queue after triage begins, then come back later to see how many issue rows were resolved or newly added."
          />
        )}
      </SectionCard>
      </div>

      <SectionCard
        title="Remediation ownership"
        description="Track who owns each remediation queue so issue buckets can move through close as shared team work."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={assignmentStatusFilter} onValueChange={setAssignmentStatusFilter}>
              <SelectTrigger className="h-9 w-[170px] bg-slate-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="deferred">Deferred</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assignmentOwnerFilter} onValueChange={setAssignmentOwnerFilter}>
              <SelectTrigger className="h-9 w-[190px] bg-slate-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(workspaceMembersQuery.data?.items ?? []).map((member) => (
                  <SelectItem key={member.id} value={String(member.user_id)}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={showOnlyMyAssignments ? "default" : "outline"}
              onClick={() => setShowOnlyMyAssignments((current) => !current)}
              disabled={!user}
            >
              {showOnlyMyAssignments ? "Showing my queue" : "My queue"}
            </Button>
            <Button
              size="sm"
              variant={showOnlyEscalatedAssignments ? "default" : "outline"}
              onClick={() => setShowOnlyEscalatedAssignments((current) => !current)}
            >
              {showOnlyEscalatedAssignments ? "Showing escalations" : "Escalations only"}
            </Button>
          </div>
        }
      >
        {!selectedClientId || !selectedPeriodId ? (
          <EmptyState
            title="Choose a working context first"
            description="Select a client and compliance period to view or assign remediation ownership."
          />
        ) : !advancedSectionQueriesEnabled ? (
          <LoadingState message="Preparing remediation ownership..." />
        ) : remediationAssignmentsQuery.isLoading ? (
          <LoadingState message="Loading remediation ownership..." />
        ) : filteredRemediationAssignments.length > 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <StatCard label="Assignments" value={String(assignmentMetrics.total)} detail="Shared remediation tasks in the current close scope." tone="primary" />
              <StatCard label="Open" value={String(assignmentMetrics.open)} detail="Assignments waiting for work to start." tone="warning" />
              <StatCard label="In Progress" value={String(assignmentMetrics.inProgress)} detail="Assignments actively being worked by the team." tone="primary" />
              <StatCard label="Resolved" value={String(assignmentMetrics.resolved)} detail="Assignments completed in the current filtered queue." tone="success" />
              <StatCard label="Deferred" value={String(assignmentMetrics.deferred)} detail="Assignments intentionally pushed out of the current close cycle." tone="warning" />
              <StatCard
                label="Overdue"
                value={String(assignmentMetrics.overdue)}
                detail={selectedPeriod?.due_date ? `Counts open work after due date ${format(new Date(selectedPeriod.due_date), "dd MMM yyyy")}.` : "Uses a 5-day age fallback when no due date exists."}
                tone="danger"
              />
            </div>
            {filteredRemediationAssignments.some((assignment) => assignment.is_escalated) ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">Escalated assignments</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {filteredRemediationAssignments
                    .filter((assignment) => assignment.is_escalated)
                    .slice(0, 4)
                    .map((assignment) => (
                      <div key={assignment.id} className="rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-900">{assignment.title}</p>
                          <StatusBadge label="escalated" variant="danger" />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {assignment.assigned_to_name ?? "Unassigned"} • escalated by {assignment.escalated_by_name ?? "team member"}
                          {assignment.escalated_at ? ` on ${format(new Date(assignment.escalated_at), "dd MMM, h:mm a")}` : ""}
                        </p>
                        {assignment.escalation_notes ? (
                          <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-900">{assignment.escalation_notes}</p>
                        ) : null}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
            {assignmentMetrics.workload.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">Assignee workload</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {assignmentMetrics.workload.map((entry) => (
                    <div key={entry.name} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">{entry.name}</span> • {entry.count}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {assignmentAttentionItems.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Needs attention</p>
                    <p className="mt-1 text-sm text-slate-700">
                      Surface overdue or stale remediation assignments before the close queue slips.
                    </p>
                  </div>
                  <StatusBadge label={`${assignmentAttentionItems.filter((item) => item.isOverdue).length} overdue`} variant="danger" />
                </div>
                <div className="mt-3 space-y-2">
                  {assignmentAttentionItems.slice(0, 4).map(({ assignment, ageDays, updatedDays, priority }) => (
                    <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-white px-4 py-3 text-sm text-slate-700">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{assignment.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {assignment.assigned_to_name ?? "Unassigned"} • {assignment.transaction_count} row(s) • age {ageDays}d • updated {updatedDays}d ago
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={priority === "overdue" ? "overdue" : priority === "stale" ? "stale" : "watch"}
                          variant={priority === "overdue" ? "danger" : priority === "stale" ? "warning" : "primary"}
                        />
                        {assignment.is_escalated ? <StatusBadge label="escalated" variant="danger" /> : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openAssignmentDialog(
                              assignment.bucket_code
                                ? {
                                    mode: "bucket",
                                    bucketCode: assignment.bucket_code,
                                    title: assignment.title,
                                    transactionIds: assignment.transaction_ids,
                                  }
                                : {
                                    mode: "selection",
                                    title: assignment.title,
                                    transactionIds: assignment.transaction_ids,
                                  },
                              assignment.id,
                            )
                          }
                        >
                          <ActionLabel kind="review" label="Review" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Assignment</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRemediationAssignments.map((assignment) => {
                  const meta = assignmentRowMeta[assignment.id] ?? {
                    ageDays: 0,
                    updatedDays: 0,
                    isOverdue: false,
                    isStale: false,
                  };
                  return (
                  <TableRow key={assignment.id} className={meta.isOverdue ? "bg-rose-50/60" : meta.isStale ? "bg-amber-50/50" : undefined}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{assignment.title}</p>
                        <p className="text-xs text-slate-500">{assignment.bucket_code || "Selected rows"}{assignment.created_by_name ? ` • by ${assignment.created_by_name}` : ""}</p>
                      </div>
                    </TableCell>
                    <TableCell>{assignment.assigned_to_name ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={meta.isOverdue ? "overdue" : meta.isStale ? "stale" : "on track"}
                        variant={meta.isOverdue ? "danger" : meta.isStale ? "warning" : "success"}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={assignment.status.replace(/_/g, " ")}
                          variant={
                            assignment.status === "resolved"
                              ? "success"
                              : assignment.status === "deferred"
                                ? "warning"
                                : assignment.status === "in_progress"
                                  ? "primary"
                                  : "danger"
                          }
                        />
                        {assignment.is_escalated ? <StatusBadge label="escalated" variant="danger" /> : null}
                      </div>
                    </TableCell>
                    <TableCell>{assignment.transaction_count}</TableCell>
                    <TableCell>{meta.ageDays}d</TableCell>
                    <TableCell>{format(new Date(assignment.updated_at), "dd MMM, h:mm a")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openAssignmentDialog(
                              assignment.bucket_code
                                ? {
                                    mode: "bucket",
                                    bucketCode: assignment.bucket_code,
                                    title: assignment.title,
                                    transactionIds: assignment.transaction_ids,
                                  }
                                : {
                                    mode: "selection",
                                    title: assignment.title,
                                    transactionIds: assignment.transaction_ids,
                                  },
                              assignment.id,
                            )
                          }
                        >
                          <ActionLabel kind="manage" label="Manage" />
                        </Button>
                        {assignment.is_escalated ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleClearEscalation(assignment.id)}
                            disabled={clearRemediationAssignmentEscalationMutation.isPending}
                          >
                            <ActionLabel kind="clear" label="Clear escalation" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEscalateAssignment(assignment.id, assignment.escalation_notes)}
                            disabled={escalateRemediationAssignmentMutation.isPending}
                          >
                            <ActionLabel kind="escalate" label="Escalate" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteAssignment(assignment.id)}>
                          <ActionLabel kind="delete" label="Delete" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </div>
        ) : (
          <EmptyState
            title={remediationAssignments.length > 0 ? "No assignments match these filters" : "No remediation ownership yet"}
            description={
              remediationAssignments.length > 0
                ? "Try a different status or owner filter, or turn off My queue to widen the ownership view."
                : "Assign a bucket or a selected row set to a teammate so remediation can be tracked as close work."
            }
          />
        )}
      </SectionCard>

      <SectionCard
        title="Follow-up queue"
        description="Track reminder-style follow-ups for unresolved remediation work so month-close ownership does not stall."
        action={
          remediationAssignments.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => openFollowUpDialog(remediationAssignments[0].id)}>
              <ActionLabel kind="create" label="Create follow-up" />
            </Button>
          ) : undefined
        }
      >
        {!selectedClientId || !selectedPeriodId ? (
          <EmptyState
            title="Choose a working context first"
            description="Select a client and compliance period to manage follow-ups for remediation assignments."
          />
        ) : !advancedSectionQueriesEnabled ? (
          <LoadingState message="Preparing follow-up queue..." />
        ) : remediationFollowUpsQuery.isLoading ? (
          <LoadingState message="Loading follow-up queue..." />
        ) : remediationFollowUps.length > 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Open follow-ups" value={String(openRemediationFollowUps.length)} detail="Reminder items still waiting for closure." tone={openRemediationFollowUps.length > 0 ? "warning" : "success"} />
              <StatCard label="Due soon" value={String(followUpsDueSoon.length)} detail="Open follow-ups due in the next 48 hours or already overdue." tone={followUpsDueSoon.length > 0 ? "danger" : "success"} />
              <StatCard label="Completed" value={String(remediationFollowUps.filter((followUp) => followUp.status === "completed").length)} detail="Follow-ups completed in the current close scope." tone="success" />
              <StatCard label="Dismissed" value={String(remediationFollowUps.filter((followUp) => followUp.status === "dismissed").length)} detail="No-longer-needed reminders and manager checks." tone="primary" />
            </div>
            <div className="space-y-3">
              {remediationFollowUps.slice(0, 8).map((followUp) => (
                <div key={followUp.id} className={`rounded-2xl border px-4 py-4 ${followUp.is_overdue ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{followUp.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {followUp.assignment_title} • {followUp.assigned_to_name ?? "Unassigned"} • due {format(new Date(followUp.remind_at), "dd MMM, h:mm a")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Reminders sent {followUp.reminder_count}
                        {followUp.last_notified_at ? ` • last sent ${format(new Date(followUp.last_notified_at), "dd MMM, h:mm a")}` : " • not sent yet"}
                        {followUp.auto_escalated_at ? ` • auto-escalated ${format(new Date(followUp.auto_escalated_at), "dd MMM, h:mm a")}` : ""}
                      </p>
                      {followUp.notes ? <p className="mt-2 text-sm text-slate-600">{followUp.notes}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={followUp.follow_up_type.replace(/_/g, " ")} variant="primary" />
                      <StatusBadge label={followUp.status.replace(/_/g, " ")} variant={followUp.status === "completed" ? "success" : followUp.status === "dismissed" ? "warning" : followUp.is_overdue ? "danger" : "primary"} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openFollowUpDialog(followUp.assignment, followUp.id)}>
                      <ActionLabel kind="manage" label="Manage" />
                    </Button>
                    {followUp.status !== "completed" && followUp.status !== "dismissed" ? (
                      <Button size="sm" variant="outline" onClick={() => handleSendFollowUp(followUp.id)}>
                        <ActionLabel kind="send" label="Send now" />
                      </Button>
                    ) : null}
                    {followUp.status !== "completed" ? (
                      <Button size="sm" variant="outline" onClick={() => handleCompleteFollowUp(followUp.id)}>
                        <ActionLabel kind="complete" label="Mark completed" />
                      </Button>
                    ) : null}
                    {followUp.status !== "dismissed" ? (
                      <Button size="sm" variant="outline" onClick={() => handleDismissFollowUp(followUp.id)}>
                        <ActionLabel kind="dismiss" label="Dismiss" />
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteFollowUp(followUp.id)}>
                      <ActionLabel kind="delete" label="Delete" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No follow-ups yet"
            description="Create reminder, manager review, or escalation-check follow-ups for unresolved assignments so the close queue stays visible."
            action={
              remediationAssignments.length > 0 ? (
                <Button onClick={() => openFollowUpDialog(remediationAssignments[0].id)}>
                  <ActionLabel kind="create" label="Create first follow-up" />
                </Button>
              ) : undefined
            }
          />
        )}
      </SectionCard>

      <SectionCard
        title="Readiness remediation buckets"
        description="Work issue-first by grouping transactions that need the same filing correction before exports and approvals."
      >
        {!selectedClientId || !selectedPeriodId ? (
          <EmptyState
            title="Choose a working context first"
            description="Select a client and compliance period to surface remediation buckets for imported transactions."
          />
        ) : transactionsQuery.isLoading ? (
          <LoadingState message="Building remediation buckets..." />
        ) : remediationBuckets.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {remediationBuckets.map((bucket) => {
              const bucketAssignment = remediationBucketAssignments.get(bucket.code);
              return (
              <div
                key={bucket.code}
                className={`rounded-3xl border p-5 shadow-sm transition ${
                  activeRemediationBucketCode === bucket.code
                    ? "border-indigo-300 bg-indigo-50/60"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Issue bucket</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900">{bucket.title}</h3>
                  </div>
                  <StatusBadge
                    label={`${bucket.count} txns`}
                    variant={bucket.suggestedFix.mode === "bulk_correct" ? "primary" : "warning"}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{bucket.detail}</p>
                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">{bucket.suggestedFix.title}</p>
                  <p className="mt-1">{bucket.suggestedFix.detail}</p>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">
                    {bucketAssignment ? `Owner: ${bucketAssignment.assigned_to_name ?? "Unassigned"}` : "No owner assigned"}
                  </p>
                  <p className="mt-1">
                    {bucketAssignment
                      ? `${bucketAssignment.status.replace(/_/g, " ")} • ${bucketAssignment.transaction_count} row(s)`
                      : "Assign this issue bucket to a teammate so remediation can be tracked as close work."}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleRemediationBucket(bucket)}
                    disabled={bucket.suggestedFix.mode === "bulk_correct" && Boolean(selectedPeriod?.is_locked)}
                  >
                    {bucket.suggestedFix.mode === "bulk_correct" ? "Select & bulk correct" : "Review affected rows"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActiveRemediationBucketCode(bucket.code);
                      setActiveRemediationSuggestion(bucket.suggestedFix);
                      setSelectedTransactionIds(bucket.transactionIds);
                    }}
                  >
                    Select only
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      openAssignmentDialog(
                        {
                          mode: "bucket",
                          bucketCode: bucket.code,
                          title: `${bucket.title} remediation`,
                          transactionIds: bucket.transactionIds,
                        },
                        bucketAssignment?.id,
                      )
                    }
                  >
                    {bucketAssignment ? "Manage owner" : "Assign bucket"}
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No remediation buckets found"
            description="The current filtered transactions do not show missing HSN, UQC, quantity, or supply category issues."
          />
        )}
      </SectionCard>

      <div ref={transactionsSectionRef}>
      <SectionCard title="Normalized GST transactions" description="Imported records ready for operational review before reconciliation and return workflows.">
        {!selectedClientId || !selectedPeriodId ? (
          <EmptyState
            title="Transaction review will appear here"
            description="Choose the working context above to load imported GST transactions."
          />
        ) : transactionsQuery.isLoading ? (
          <LoadingState message="Loading normalized transactions..." />
        ) : transactionsQuery.isError ? (
          <ErrorState title="We couldn’t load GST transactions" description={getErrorMessage(transactionsQuery.error)} />
        ) : displayedTransactions.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible transactions"
                    />
                  </TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Taxable</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedTransactionIds.includes(transaction.id)}
                        onChange={() => toggleTransactionSelection(transaction.id)}
                        aria-label={`Select transaction ${transaction.document_number}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900">{transaction.document_number}</p>
                        <p className="text-xs text-slate-500">{transaction.document_type}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(transaction.document_date)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm text-slate-900">{transaction.counterparty_name || "Unnamed counterparty"}</p>
                        <p className="text-xs text-slate-500">{transaction.counterparty_gstin || "GSTIN unavailable"}</p>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{transaction.transaction_type.replace(/_/g, " ")}</TableCell>
                    <TableCell>{formatCurrency(transaction.taxable_value)}</TableCell>
                    <TableCell>{formatCurrency(transaction.total_amount)}</TableCell>
                    <TableCell>
                      <StatusBadge label={transaction.status} variant={transaction.status === "locked" ? "primary" : transaction.status === "review" ? "warning" : "success"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        onClick={() => setSelectedTransactionId(transaction.id)}
                      >
                        View detail
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No transactions match these filters"
            description={
              showRemediationOnly
                ? "The active remediation bucket has no rows under the current filters. Clear the bucket or widen the review filters."
                : "Try a different import batch or clear the GSTIN/date filters to widen the review set."
            }
          />
        )}
      </SectionCard>
      </div>

      <Dialog open={Boolean(selectedTransactionId)} onOpenChange={(open) => !open && setSelectedTransactionId(null)}>
        <AppModalContent size="lg">
          <AppModalHeader
            title="Transaction detail"
            description="Inspect the normalized payload created from the import batch before downstream matching begins."
          />

          <AppModalBody className="space-y-6">
            {transactionDetailQuery.isLoading ? (
              <LoadingState message="Loading transaction detail..." />
            ) : transactionDetailQuery.isError ? (
              <ErrorState description={getErrorMessage(transactionDetailQuery.error)} />
            ) : transactionDetailQuery.data ? (
              <>
                <SectionCard title="Document summary" description={transactionDetailQuery.data.document_number}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3 text-sm">
                      <div><span className="text-slate-500">Document type:</span> <span className="font-medium text-slate-900">{transactionDetailQuery.data.document_type}</span></div>
                      <div><span className="text-slate-500">Transaction type:</span> <span className="font-medium text-slate-900">{transactionDetailQuery.data.transaction_type}</span></div>
                      <div><span className="text-slate-500">Document date:</span> <span className="font-medium text-slate-900">{formatDate(transactionDetailQuery.data.document_date)}</span></div>
                      <div><span className="text-slate-500">Status:</span> <span className="font-medium text-slate-900">{transactionDetailQuery.data.status}</span></div>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div><span className="text-slate-500">Counterparty:</span> <span className="font-medium text-slate-900">{transactionDetailQuery.data.counterparty_name || "Unnamed counterparty"}</span></div>
                      <div><span className="text-slate-500">GSTIN:</span> <span className="font-medium text-slate-900">{transactionDetailQuery.data.counterparty_gstin || "Unavailable"}</span></div>
                      <div><span className="text-slate-500">Place of supply:</span> <span className="font-medium text-slate-900">{transactionDetailQuery.data.place_of_supply || "Unavailable"}</span></div>
                      <div><span className="text-slate-500">Reverse charge:</span> <span className="font-medium text-slate-900">{transactionDetailQuery.data.reverse_charge ? "Yes" : "No"}</span></div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Tax breakdown" description="Normalized values derived from the import parser.">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Taxable value</p><p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(transactionDetailQuery.data.taxable_value)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Total tax</p><p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(transactionDetailQuery.data.tax_amount)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Invoice total</p><p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(transactionDetailQuery.data.total_amount)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">CGST</p><p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(transactionDetailQuery.data.cgst_amount)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">SGST</p><p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(transactionDetailQuery.data.sgst_amount)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">IGST / CESS</p><p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(transactionDetailQuery.data.igst_amount)} / {formatCurrency(transactionDetailQuery.data.cess_amount)}</p></div>
                  </div>
                </SectionCard>
                <SectionCard
                  title="Correction workflow"
                  description="Update filing metadata and line-item details to resolve readiness warnings without re-importing the source file."
                  action={
                    <Button
                      size="sm"
                      onClick={openEditDialog}
                      disabled={Boolean(selectedPeriod?.is_locked) || transactionDetailQuery.data.status === "locked"}
                    >
                      Edit metadata
                    </Button>
                  }
                >
                  {selectedPeriod?.is_locked || transactionDetailQuery.data.status === "locked" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      This transaction cannot be edited while the period or transaction is locked.
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                      Use the editor to fix HSN, UQC, quantity, supply category, service flags, and counterparty details.
                      Financial values remain read-only to keep corrections safe.
                    </div>
                  )}
                </SectionCard>
              </>
            ) : (
              <EmptyState title="No transaction selected" description="Choose a row from the review table to inspect the normalized transaction detail." />
            )}
          </AppModalBody>
        </AppModalContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <AppModalContent size="xl">
          <AppModalHeader
            title="Correct transaction metadata"
            description="Update filing metadata and line-item classification so exports and return readiness reflect the real business context."
          />
          <AppModalBody>
            <div className="grid gap-6">
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">Document metadata</h3>
                  <p className="text-sm leading-6 text-slate-500">Keep core document context and review fields aligned before downstream reconciliation and filing.</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label className="text-sm font-medium text-slate-900">Counterparty name</Label>
                    <Input value={counterpartyNameDraft} onChange={(event) => setCounterpartyNameDraft(event.target.value)} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label className="text-sm font-medium text-slate-900">Counterparty GSTIN</Label>
                    <Input value={counterpartyGstinDraft} onChange={(event) => setCounterpartyGstinDraft(event.target.value)} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label className="text-sm font-medium text-slate-900">Place of supply</Label>
                    <Input value={placeOfSupplyDraft} onChange={(event) => setPlaceOfSupplyDraft(event.target.value)} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label className="text-sm font-medium text-slate-900">Document type</Label>
                    <Input value={documentTypeDraft} onChange={(event) => setDocumentTypeDraft(event.target.value)} />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label className="text-sm font-medium text-slate-900">Review status</Label>
                    <Select value={transactionStatusDraft} onValueChange={setTransactionStatusDraft}>
                      <SelectTrigger className="h-10 bg-slate-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="imported">Imported</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="locked">Locked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label className="text-sm font-medium text-slate-900">Reverse charge</Label>
                    <Select value={reverseChargeDraft} onValueChange={setReverseChargeDraft}>
                      <SelectTrigger className="h-10 bg-slate-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Line item metadata</h3>
                    <p className="text-sm text-slate-600">Correct HSN, UQC, quantity, service flags, and supply category per line item. Tax values are shown for reference and stay unchanged.</p>
                  </div>
                  <div className="space-y-4">
                    {lineItemsDraft.map((lineItem, index) => (
                      <div key={`${index}-${lineItem.hsn_code}-${lineItem.description}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <p className="font-medium text-slate-900">Line item {index + 1}</p>
                          <p className="text-xs text-slate-500">
                            Taxable {lineItem.taxable_value || "0.00"} • Tax {(Number(lineItem.cgst_amount || 0) + Number(lineItem.sgst_amount || 0) + Number(lineItem.igst_amount || 0) + Number(lineItem.cess_amount || 0)).toFixed(2)}
                          </p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="min-w-0 space-y-2">
                            <Label className="text-sm font-medium text-slate-900">HSN code</Label>
                            <Input value={lineItem.hsn_code} onChange={(event) => handleLineItemChange(index, "hsn_code", event.target.value)} />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <Label className="text-sm font-medium text-slate-900">Description</Label>
                            <Input value={lineItem.description} onChange={(event) => handleLineItemChange(index, "description", event.target.value)} />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <Label className="text-sm font-medium text-slate-900">UQC</Label>
                            <Input value={lineItem.uqc} onChange={(event) => handleLineItemChange(index, "uqc", event.target.value)} />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <Label className="text-sm font-medium text-slate-900">Quantity</Label>
                            <Input value={lineItem.quantity} onChange={(event) => handleLineItemChange(index, "quantity", event.target.value)} />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <Label className="text-sm font-medium text-slate-900">Supply category</Label>
                            <Select value={lineItem.supply_category || "__empty__"} onValueChange={(value) => handleLineItemChange(index, "supply_category", value === "__empty__" ? "" : value)}>
                              <SelectTrigger className="h-10 bg-white">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__empty__">Unspecified</SelectItem>
                                <SelectItem value="taxable">Taxable</SelectItem>
                                <SelectItem value="nil_rated">Nil rated</SelectItem>
                                <SelectItem value="exempt">Exempt</SelectItem>
                                <SelectItem value="non_gst">Non-GST</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="min-w-0 space-y-2">
                            <Label className="text-sm font-medium text-slate-900">E-commerce GSTIN</Label>
                            <Input value={lineItem.ecommerce_gstin} onChange={(event) => handleLineItemChange(index, "ecommerce_gstin", event.target.value)} />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <Label className="text-sm font-medium text-slate-900">Service item</Label>
                            <Select value={lineItem.is_service ? "yes" : "no"} onValueChange={(value) => handleLineItemChange(index, "is_service", value === "yes")}>
                              <SelectTrigger className="h-10 bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="no">No</SelectItem>
                                <SelectItem value="yes">Yes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Financial totals remain read-only so metadata corrections stay safe and auditable.</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                <ActionLabel kind="cancel" label="Cancel" />
              </Button>
              <Button onClick={handleSaveCorrections} disabled={updateTransactionMutation.isPending}>
                {updateTransactionMutation.isPending ? "Saving..." : <ActionLabel kind="save" label="Save corrections" />}
              </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>

      <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <AppModalContent size="lg">
          <AppModalHeader
            title="Bulk correct filing metadata"
            description="Apply the same safe metadata fixes across the selected transactions. Tax amounts stay unchanged."
          />
          <AppModalBody className="space-y-4">
          {effectiveSuggestedFix?.mode === "bulk_correct" ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
              <p className="font-semibold">{effectiveSuggestedFix.title}</p>
              <p className="mt-1">{effectiveSuggestedFix.detail}</p>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("place_of_supply")}`}>
              <Label className="text-sm font-medium text-slate-900">Place of supply</Label>
              <Input value={bulkPlaceOfSupply} onChange={(event) => setBulkPlaceOfSupply(event.target.value)} placeholder="Optional" />
            </div>
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("status")}`}>
              <Label className="text-sm font-medium text-slate-900">Review status</Label>
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="imported">Imported</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("reverse_charge")}`}>
              <Label className="text-sm font-medium text-slate-900">Reverse charge</Label>
              <Select value={bulkReverseCharge} onValueChange={setBulkReverseCharge}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unchanged">Leave unchanged</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("hsn_code")}`}>
              <Label className="text-sm font-medium text-slate-900">HSN code</Label>
              <Input value={bulkHsnCode} onChange={(event) => setBulkHsnCode(event.target.value)} placeholder="Optional" />
            </div>
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("uqc")}`}>
              <Label className="text-sm font-medium text-slate-900">UQC</Label>
              <Input value={bulkUqc} onChange={(event) => setBulkUqc(event.target.value)} placeholder="Optional" />
            </div>
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("supply_category")}`}>
              <Label className="text-sm font-medium text-slate-900">Supply category</Label>
              <Select value={bulkSupplyCategory} onValueChange={setBulkSupplyCategory}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">Leave unchanged</SelectItem>
                  <SelectItem value="taxable">Taxable</SelectItem>
                  <SelectItem value="nil_rated">Nil rated</SelectItem>
                  <SelectItem value="exempt">Exempt</SelectItem>
                  <SelectItem value="non_gst">Non-GST</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("ecommerce_gstin")}`}>
              <Label className="text-sm font-medium text-slate-900">E-commerce GSTIN</Label>
              <Input value={bulkEcommerceGstin} onChange={(event) => setBulkEcommerceGstin(event.target.value)} placeholder="Optional" />
            </div>
            <div className={`space-y-2 rounded-2xl border px-3 py-3 ${getSuggestedFieldClassName("is_service")}`}>
              <Label className="text-sm font-medium text-slate-900">Service item</Label>
              <Select value={bulkIsService} onValueChange={setBulkIsService}>
                <SelectTrigger className="h-10 bg-slate-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unchanged">Leave unchanged</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Only safe metadata fields are changed in bulk. Tax values and invoice totals stay untouched.</div>
            <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>
              <ActionLabel kind="cancel" label="Cancel" />
            </Button>
            <Button onClick={handleBulkSave} disabled={bulkUpdateMutation.isPending}>
              {bulkUpdateMutation.isPending ? "Applying..." : `Apply to ${selectedTransactionIds.length} transaction(s)`}
            </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>

      <Dialog open={isAssignmentOpen} onOpenChange={setIsAssignmentOpen}>
        <AppModalContent size="md">
          <AppModalHeader
            title={assignmentRecordId ? "Manage remediation owner" : "Assign remediation work"}
            description="Turn the current remediation queue into an owned close task so the team can track who is responsible for resolving it."
          />
          <AppModalBody className="space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">{assignmentTarget?.title ?? "No assignment target selected"}</p>
              <p className="mt-1">
                {assignmentTarget ? `${assignmentTarget.transactionIds.length} transaction(s) included in this assignment.` : "Choose a remediation bucket or selected rows first."}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Assignee</Label>
                <Select value={assignmentAssignee} onValueChange={setAssignmentAssignee}>
                  <SelectTrigger className="h-10 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {(workspaceMembersQuery.data?.items ?? []).map((member) => (
                      <SelectItem key={member.id} value={String(member.user_id)}>
                        {member.full_name} • {member.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Status</Label>
                <Select value={assignmentStatusDraft} onValueChange={setAssignmentStatusDraft}>
                  <SelectTrigger className="h-10 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="deferred">Deferred</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-900">Notes</Label>
              <Input
                value={assignmentNotesDraft}
                onChange={(event) => setAssignmentNotesDraft(event.target.value)}
                placeholder="Add close notes, dependencies, or reviewer guidance"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-900">Escalation notes</Label>
              <Input
                value={assignmentEscalationNotesDraft}
                onChange={(event) => setAssignmentEscalationNotesDraft(event.target.value)}
                placeholder="Why does this need manager attention or follow-up?"
              />
            </div>
            {assignmentRecordId ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEscalateAssignment(assignmentRecordId, assignmentEscalationNotesDraft)}
                  disabled={escalateRemediationAssignmentMutation.isPending}
                >
                  {escalateRemediationAssignmentMutation.isPending ? "Escalating..." : <ActionLabel kind="escalate" label="Escalate assignment" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleClearEscalation(assignmentRecordId)}
                  disabled={clearRemediationAssignmentEscalationMutation.isPending}
                >
                  {clearRemediationAssignmentEscalationMutation.isPending ? "Clearing..." : <ActionLabel kind="clear" label="Clear escalation" />}
                </Button>
              </div>
            ) : null}
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Assignments help track ownership, escalation, and close accountability across the workspace.</div>
            <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setIsAssignmentOpen(false)}>
              <ActionLabel kind="cancel" label="Cancel" />
            </Button>
            <Button
              onClick={handleAssignmentSubmit}
              disabled={
                !assignmentTarget ||
                createRemediationAssignmentMutation.isPending ||
                updateRemediationAssignmentMutation.isPending
              }
            >
              {createRemediationAssignmentMutation.isPending || updateRemediationAssignmentMutation.isPending
                ? "Saving..."
                : assignmentRecordId
                  ? <ActionLabel kind="manage" label="Update assignment" />
                  : <ActionLabel kind="create" label="Create assignment" />}
            </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>

      <Dialog open={isFollowUpOpen} onOpenChange={setIsFollowUpOpen}>
        <AppModalContent size="md">
          <AppModalHeader
            title={followUpDialogMode === "edit" ? "Manage follow-up" : "Create follow-up"}
            description="Schedule reminder-style follow-up on a remediation assignment so close work gets reviewed, chased, and completed on time."
          />
          <AppModalBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Assignment</Label>
                <Select value={followUpAssignmentId} onValueChange={setFollowUpAssignmentId}>
                  <SelectTrigger className="h-10 bg-slate-50">
                    <SelectValue placeholder="Select assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {remediationAssignments.map((assignment) => (
                      <SelectItem key={assignment.id} value={assignment.id}>
                        {assignment.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Assignee</Label>
                <Select value={followUpAssigneeDraft} onValueChange={setFollowUpAssigneeDraft}>
                  <SelectTrigger className="h-10 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {(workspaceMembersQuery.data?.items ?? []).map((member) => (
                      <SelectItem key={member.id} value={String(member.user_id)}>
                        {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Title</Label>
                <Input value={followUpTitleDraft} onChange={(event) => setFollowUpTitleDraft(event.target.value)} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Due at</Label>
                <Input type="datetime-local" value={followUpRemindAtDraft} onChange={(event) => setFollowUpRemindAtDraft(event.target.value)} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Follow-up type</Label>
                <Select value={followUpTypeDraft} onValueChange={setFollowUpTypeDraft}>
                  <SelectTrigger className="h-10 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="manager_review">Manager review</SelectItem>
                    <SelectItem value="escalation_check">Escalation check</SelectItem>
                    <SelectItem value="close_checkpoint">Close checkpoint</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-2">
                <Label className="text-sm font-medium text-slate-900">Status</Label>
                <Select value={followUpStatusDraft} onValueChange={setFollowUpStatusDraft}>
                  <SelectTrigger className="h-10 bg-slate-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-900">Notes</Label>
              <Input
                value={followUpNotesDraft}
                onChange={(event) => setFollowUpNotesDraft(event.target.value)}
                placeholder="Add reminder detail, reviewer context, or manager ask"
              />
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Follow-ups support reminders, manager reviews, and checkpoint tracking for close work.</div>
            <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setIsFollowUpOpen(false)}>
              <ActionLabel kind="cancel" label="Cancel" />
            </Button>
            <Button
              onClick={handleFollowUpSubmit}
              disabled={createRemediationFollowUpMutation.isPending || updateRemediationFollowUpMutation.isPending}
            >
              {createRemediationFollowUpMutation.isPending || updateRemediationFollowUpMutation.isPending
                ? "Saving..."
                : followUpDialogMode === "edit"
                  ? <ActionLabel kind="save" label="Save follow-up" />
                  : <ActionLabel kind="create" label="Create follow-up" />}
            </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>

      <Dialog open={isSaveViewOpen} onOpenChange={setIsSaveViewOpen}>
        <AppModalContent size="sm">
          <AppModalHeader
            title="Save review view"
            description="Store the current filters and remediation focus so you can reopen this working set later."
          />
          <AppModalBody className="space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-900">View name</Label>
              <Input
                value={savedViewName}
                onChange={(event) => setSavedViewName(event.target.value)}
                placeholder="April filing fixes"
              />
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">This view will save</p>
              <p className="mt-1">Batch, transaction type, status, GSTIN filter, date range, active remediation bucket, and whether remediation-only mode is enabled.</p>
            </div>
          </AppModalBody>
          <AppModalFooter>
            <div className="text-sm text-slate-500">Saved views make recurring monthly correction queues faster to reopen.</div>
            <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setIsSaveViewOpen(false)}>
              <ActionLabel kind="cancel" label="Cancel" />
            </Button>
            <Button onClick={handleSaveCurrentView}>
              <ActionLabel kind="save" label="Save view" />
            </Button>
            </div>
          </AppModalFooter>
        </AppModalContent>
      </Dialog>
    </div>
  );
}
