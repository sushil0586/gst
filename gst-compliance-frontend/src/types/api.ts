export type ApiEnvelope<T> = {
  status: string;
  message: string;
  data: T;
  pagination?: {
    count: number;
    next: string | null;
    previous: string | null;
    page: number;
    page_size: number;
  };
};

export type PaginatedResult<T> = {
  items: T[];
  count: number;
  page: number;
  pageSize: number;
  next: string | null;
  previous: string | null;
};

export type Membership = {
  workspace_id: string;
  workspace_name: string;
  organization_id: string;
  organization_name: string;
  role: string;
  permissions: string[];
};

export type UserIdentity = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
};

export type WorkspaceAccessRecord = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  organization_id: string;
  organization_name: string;
  role: string | null;
  permissions: string[];
};

export type OrganizationAccessRecord = {
  id: string;
  name: string;
  code: string;
};

export type SessionPayload = {
  full_name: string;
  user: UserIdentity;
  organizations: OrganizationAccessRecord[];
  workspaces: WorkspaceAccessRecord[];
  default_workspace: WorkspaceAccessRecord | null;
  is_platform_admin: boolean;
  permissions_summary: {
    codes: string[];
    total: number;
    memberships: Membership[];
  };
};

export type TokenResponse = {
  access: string;
  refresh: string;
  user: SessionPayload;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};

export type WorkspaceRecord = {
  id: string;
  organization: string;
  name: string;
  code: string;
  timezone: string;
  is_active: boolean;
};

export type WorkspaceContextDataRecord = {
  workspace: WorkspaceRecord | null;
  clients: ClientRecord[];
  gstins: GSTINRecordApi[];
  periods: CompliancePeriodRecord[];
};

export type ClientRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  legal_name: string;
  trade_name: string;
  client_code: string;
  pan: string;
  email: string;
  transaction_count?: number;
  can_delete?: boolean;
  is_active: boolean;
};

export type ClientBootstrapRequest = {
  workspace: string;
  legal_name: string;
  trade_name?: string;
  client_code: string;
  pan: string;
  email?: string;
  gstin?: string;
  registration_type?: string;
  state_code?: string;
  whitebooks_gst_username?: string;
  taxpayer_lookup_payload?: Record<string, unknown>;
};

export type GSTINRecordApi = {
  id: string;
  client: string;
  client_name?: string;
  workspace_id?: string;
  gstin: string;
  registration_type: string;
  state_code: string;
  whitebooks_gst_username?: string;
  is_active: boolean;
};

export type GSTINTaxpayerSearchResult = {
  gstin: string;
  pan: string;
  legal_name: string;
  trade_name: string;
  state_code: string;
  registration_type: string;
  status: string;
  raw_payload: Record<string, unknown>;
};

export type GSTINTaxpayerProfileRecord = {
  id: string;
  gstin: string;
  gstin_value?: string;
  legal_name: string;
  trade_name: string;
  registration_type: string;
  status: string;
  constitution: string;
  registration_date: string;
  last_updated_date: string;
  state_jurisdiction_code: string;
  state_jurisdiction_name: string;
  center_jurisdiction_code: string;
  center_jurisdiction_name: string;
  principal_address: Record<string, unknown>;
  additional_addresses: unknown[];
  nature_of_business: unknown[];
  einvoice_status: string;
  raw_payload: Record<string, unknown>;
};

export type ClientBootstrapResult = {
  client: ClientRecord;
  gstin: GSTINRecordApi | null;
  taxpayer_profile: GSTINTaxpayerProfileRecord | null;
};

export type CompliancePeriodRecord = {
  id: string;
  gstin: string;
  gstin_value?: string;
  client_id?: string;
  client_name?: string;
  period: string;
  return_type: string;
  status: string;
  due_date: string | null;
  is_locked: boolean;
  locked_at?: string | null;
  locked_by?: number | null;
  locked_by_name?: string | null;
  is_active: boolean;
};

export type ImportBatchRecord = {
  id: string;
  workspace: string | null;
  workspace_name?: string | null;
  client: string | null;
  client_name?: string | null;
  gstin: string | null;
  gstin_value?: string | null;
  import_template?: string | null;
  import_template_name?: string | null;
  compliance_period: string;
  compliance_period_label?: string;
  import_type: "sales" | "purchase" | "credit_note" | "debit_note" | "gstr_2b";
  source_type: "csv" | "excel" | "provider";
  file_name: string;
  source_metadata?: Record<string, unknown>;
  status:
    | "uploaded"
    | "queued"
    | "processing"
    | "validated"
    | "processed"
    | "corrected"
    | "superseded"
    | "discarded"
    | "locked"
    | "failed";
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  processed_rows: number;
  error_summary: {
    errors?: number;
    warnings?: number;
    by_field?: Record<string, number>;
    message?: string;
  };
  processed_at: string | null;
  uploaded_by_name?: string | null;
  transaction_count: number;
  correction_summary?: ImportBatchCorrectionSummary | null;
  superseded_by?: string | null;
  supersedes_batch?: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatchCorrectionSummary = {
  lifecycle_state: ImportBatchRecord["status"] | string;
  has_downstream_dependencies: boolean;
  requires_reconciliation_rerun: boolean;
  requires_return_refresh: boolean;
  is_locked_by_filing: boolean;
  warning_message: string;
  next_required_action: string;
};

export type ImportBatchCorrectionPolicyRecord = {
  lifecycle_state: ImportBatchRecord["status"] | string;
  can_edit_rows: boolean;
  can_discard_rows: boolean;
  can_discard_batch: boolean;
  can_replace_file: boolean;
  can_reprocess: boolean;
  has_downstream_dependencies: boolean;
  requires_reconciliation_rerun: boolean;
  requires_return_refresh: boolean;
  is_locked_by_filing: boolean;
  requires_elevated_role: boolean;
  warning_message: string;
  next_required_action: string;
  affected_reconciliation_runs: number;
  affected_return_preparations: number;
  affected_filings: number;
  invalidation_reason: string;
};

export type ImportImpactActionRecord = {
  key: "edit_rows" | "discard_rows" | "discard_batch" | "replace_file" | "reprocess" | string;
  label: string;
  allowed: boolean;
  reason: string;
};

export type ImportImpactSummaryRecord = {
  summary_title: string;
  summary_message: string;
  severity: "success" | "warning" | "danger" | "primary" | string;
  next_required_action: string;
  invalidation_reason: string;
  lifecycle_state: ImportBatchRecord["status"] | string;
  actions: ImportImpactActionRecord[];
  affected_reconciliation_runs: number;
  affected_return_preparations: number;
  affected_filings: number;
};

export type ImportRowErrorRecord = {
  id: string;
  row_number: number;
  field_name: string;
  severity: "error" | "warning";
  error_code: string;
  error_message: string;
  raw_row: Record<string, string>;
};

export type GSTTransactionRecord = {
  id: string;
  workspace: string | null;
  client: string | null;
  client_name?: string;
  gstin: string | null;
  gstin_value?: string | null;
  compliance_period: string | null;
  compliance_period_label?: string | null;
  transaction_type: string;
  document_type: string;
  document_number: string;
  document_date: string;
  counterparty_gstin: string;
  counterparty_name: string;
  taxable_value: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  cess_amount: string;
  tax_amount: string;
  total_amount: string;
  place_of_supply: string;
  reverse_charge: boolean;
  source_import_batch: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GSTTransactionLineItem = {
  hsn_code?: string | null;
  description?: string | null;
  uqc?: string | null;
  quantity?: string | null;
  is_service?: boolean | null;
  supply_category?: string | null;
  ecommerce_gstin?: string | null;
  taxable_value?: string | null;
  cgst_amount?: string | null;
  sgst_amount?: string | null;
  igst_amount?: string | null;
  cess_amount?: string | null;
  total_amount?: string | null;
};

export type TransactionReviewSnapshotRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  client: string;
  client_name?: string;
  gstin: string | null;
  gstin_value?: string | null;
  compliance_period: string;
  compliance_period_label?: string;
  name: string;
  filters: Record<string, unknown>;
  bucket_counts: Record<string, number>;
  created_at: string;
  created_by: number | null;
  created_by_name?: string | null;
};

export type WorkspaceMemberRecord = {
  id: string;
  workspace_id: string;
  workspace_name?: string;
  user_id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SelfRegistrationPayload = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  organization_name: string;
  workspace_name: string;
  timezone?: string;
};

export type TransactionRemediationAssignmentRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  client: string;
  client_name?: string;
  gstin: string | null;
  gstin_value?: string | null;
  compliance_period: string;
  compliance_period_label?: string;
  snapshot: string | null;
  bucket_code: string;
  title: string;
  transaction_ids: string[];
  transaction_count: number;
  filters: Record<string, unknown>;
  status: "open" | "in_progress" | "resolved" | "deferred";
  assigned_to: number | null;
  assigned_to_name?: string | null;
  notes: string;
  is_escalated: boolean;
  escalated_at: string | null;
  escalated_by: number | null;
  escalated_by_name?: string | null;
  escalation_notes: string;
  created_at: string;
  created_by: number | null;
  created_by_name?: string | null;
  updated_at: string;
};

export type TransactionRemediationFollowUpRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  client: string;
  client_name?: string;
  gstin: string | null;
  gstin_value?: string | null;
  compliance_period: string;
  compliance_period_label?: string;
  assignment: string;
  assignment_title?: string;
  assigned_to: number | null;
  assigned_to_name?: string | null;
  follow_up_type: "reminder" | "manager_review" | "escalation_check" | "close_checkpoint";
  status: "open" | "sent" | "completed" | "dismissed";
  title: string;
  notes: string;
  remind_at: string;
  last_notified_at: string | null;
  reminder_count: number;
  auto_escalated_at: string | null;
  completed_at: string | null;
  completed_by: number | null;
  completed_by_name?: string | null;
  is_overdue: boolean;
  created_at: string;
  created_by: number | null;
  created_by_name?: string | null;
  updated_at: string;
};

export type TransactionRemediationDigestRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  generated_for: number | null;
  generated_for_name?: string | null;
  generated_by: number | null;
  generated_by_name?: string | null;
  title: string;
  delivery_channel: "in_app" | "email_preview" | "email";
  status: "generated" | "dispatched" | "acknowledged" | "failed";
  summary: Record<string, unknown>;
  rendered_payload: {
    subject?: string;
    body_text?: string;
    delivery_channel?: string;
    generated_for_name?: string | null;
    recipient_email?: string | null;
    preview?: {
      highlights?: string[];
      queues?: Array<Record<string, unknown>>;
      next_follow_ups?: Array<Record<string, unknown>>;
    };
  };
  dispatched_at: string | null;
  dispatched_by: number | null;
  dispatched_by_name?: string | null;
  dispatch_error: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  acknowledged_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportTemplateRecord = {
  id: string;
  name: string;
  workspace: string;
  workspace_name?: string;
  import_type: ImportBatchRecord["import_type"];
  source_type: ImportBatchRecord["source_type"];
  column_mapping: Record<string, string>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ReconciliationRunRecord = {
  id: string;
  workspace: string | null;
  workspace_name?: string | null;
  client: string | null;
  client_name?: string | null;
  gstin: string | null;
  gstin_value?: string | null;
  compliance_period: string;
  compliance_period_label?: string;
  run_type: "gstr_2b_purchase";
  status: "queued" | "running" | "completed" | "failed";
  notes: string;
  matched_count: number;
  mismatch_count: number;
  partial_match_count: number;
  missing_in_books_count: number;
  missing_in_portal_count: number;
  duplicate_count: number;
  total_tax_difference: string;
  total_itc_at_risk: string;
  processed_at: string | null;
  error_summary: Record<string, unknown>;
  is_stale: boolean;
  invalidated_at: string | null;
  invalidated_by: number | null;
  invalidated_by_name?: string | null;
  invalidation_reason: string;
  created_at: string;
  updated_at: string;
};

export type ReconciliationItemRecord = {
  id: string;
  reconciliation_run: string;
  books_transaction: string | null;
  portal_transaction: string | null;
  books_invoice: string;
  portal_invoice: string;
  books_date: string | null;
  portal_date: string | null;
  books_tax: string | null;
  portal_tax: string | null;
  counterparty_name: string;
  counterparty_gstin: string;
  match_status:
    | "matched"
    | "partial_match"
    | "mismatch"
    | "missing_in_books"
    | "missing_in_portal"
    | "duplicate_in_books"
    | "duplicate_in_portal";
  mismatch_reason:
    | ""
    | "gstin_mismatch"
    | "document_number_mismatch"
    | "date_mismatch"
    | "taxable_value_mismatch"
    | "tax_amount_mismatch"
    | "total_amount_mismatch"
    | "duplicate_invoice"
    | "missing_in_books"
    | "missing_in_portal";
  tax_difference: string;
  taxable_difference: string;
  total_difference: string;
  action_status: "open" | "assigned" | "resolved" | "deferred" | "ignored";
  assigned_to: number | null;
  assigned_to_name?: string | null;
  remarks: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ReturnPreparationRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  client: string;
  client_name?: string;
  gstin: string;
  gstin_value?: string;
  compliance_period: string;
  compliance_period_label?: string;
  return_type: "gstr1" | "gstr3b";
  status: "draft" | "validating" | "ready_for_review" | "blocked_by_stale_reconciliation" | "approved" | "filed" | "failed";
  summary_snapshot: Record<string, unknown>;
  prepared_by: number | null;
  prepared_by_name?: string | null;
  approved_by: number | null;
  approved_by_name?: string | null;
  filed_by: number | null;
  filed_by_name?: string | null;
  filed_at: string | null;
  arn: string;
  is_blocked_by_stale_reconciliation: boolean;
  blocking_reason: string;
  created_at: string;
  updated_at: string;
};

export type ReturnReadinessIssue = {
  code: string;
  severity: "error" | "warning";
  title: string;
  detail: string;
  action_label?: string | null;
  action_target?: string | null;
  transaction_ids?: string[];
  suggested_fix?: {
    mode: "bulk_correct" | "row_review";
    fields?: string[];
    title?: string;
    detail?: string;
  } | null;
};

export type ReturnReadinessResult = {
  return_type: "gstr1" | "gstr3b";
  status: "ready" | "ready_with_warnings" | "blocked";
  can_prepare: boolean;
  can_export: boolean;
  warning_count: number;
  error_count: number;
  issues: ReturnReadinessIssue[];
  prepared_return: {
    id: string;
    status: ReturnPreparationRecord["status"];
    updated_at: string;
  } | null;
  metrics: Record<string, string | number | null>;
};

export type ReturnReadinessPayload = {
  context: {
    workspace: string;
    workspace_name: string;
    client: string;
    client_name: string;
    gstin: string;
    gstin_value: string;
    compliance_period: string;
    period_label: string;
    is_locked: boolean;
  };
  gstr1: ReturnReadinessResult;
  gstr3b: ReturnReadinessResult;
  overall_status: "ready" | "ready_with_warnings" | "blocked";
};

export type ReturnFilingAttemptRecord = {
  id: string;
  attempt_number: number;
  status: "created" | "queued" | "in_progress" | "submitted_to_provider" | "awaiting_status" | "completed" | "failed" | "cancelled";
  provider_request_id: string;
  idempotency_key: string;
  request_payload_hash: string;
  request_summary: Record<string, unknown>;
  response_summary: Record<string, unknown>;
  provider_status_raw: Record<string, unknown>;
  failure_code: string;
  failure_message: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  triggered_by: number | null;
  triggered_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type WhiteBooksProviderStage =
  | "draft_saved"
  | "offset_applied"
  | "proceeded_to_file"
  | "file_requested"
  | "sandbox_submitted"
  | "submitted"
  | "";

export type ReturnFilingEventRecord = {
  id: string;
  filing_attempt: string | null;
  event_type: string;
  old_status: string;
  new_status: string;
  actor: number | null;
  actor_name?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ReturnFilingInterventionRecord = {
  id: string;
  event_type: string;
  label: string;
  new_status: string;
  actor_name?: string | null;
  created_at: string;
  note: string;
};

export type ReturnFilingIncidentNoteRecord = {
  id: string;
  return_filing: string;
  title: string;
  note: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "resolved";
  alert_code: string;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  resolved_by: number | null;
  resolved_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type ReturnFilingOperationalAlert = {
  code: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
};

export type ReturnFilingAlertRoutingSummary = {
  email_delivery_enabled: boolean;
  routing_mode: "rule" | "default" | "none";
  default_roles: string[];
  matched_rules: Array<{
    id: string;
    target_role: string;
    minimum_severity: "info" | "warning" | "critical";
    alert_code: string;
    scope: string[];
  }>;
  recipients: Array<{
    user_id: number;
    name: string;
    email: string;
    role: string;
  }>;
};

export type ReturnFilingProviderEvidenceSummary = {
  provider_stage: string;
  latest_message: string;
  next_action: string;
  auth_session_id: string;
  operations_requested: string[];
  operations_completed: string[];
  operations_failed: string[];
  evidence_available: {
    save_response: boolean;
    offset_response: boolean;
    proceed_response: boolean;
    file_response: boolean;
    status_response: boolean;
    track_response: boolean;
  };
  latest_failure: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
};

export type ReturnFilingSupportActionSummary = {
  recommended_action: "none" | "retry_filing" | "resync_status" | "review_provider_error" | "review_rollout_controls";
  summary_reason: string;
  actions: Array<{
    action: "retry" | "resync" | "requeue_after_review";
    label: string;
    allowed: boolean;
    reason: string;
  }>;
};

export type ReturnFilingSupportStatusSummary = {
  filing_status: ReturnFilingRecord["status"];
  provider_stage: string;
  recommended_action: ReturnFilingSupportActionSummary["recommended_action"];
  summary_reason: string;
  latest_message: string;
  has_provider_failure: boolean;
  intervention_count: number;
  evidence_flags: ReturnFilingProviderEvidenceSummary["evidence_available"];
};

export type ReturnFilingRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  client: string;
  client_name?: string;
  gstin: string;
  gstin_value?: string;
  compliance_period: string;
  compliance_period_label?: string;
  prepared_return: string;
  prepared_return_status?: ReturnPreparationRecord["status"];
  prepared_snapshot_version: number;
  approval_request: string | null;
  approval_request_status?: string;
  provider: "whitebooks";
  return_type: "gstr1" | "gstr3b";
  status: "draft" | "ready_for_review" | "approved" | "queued_for_filing" | "submitted" | "arn_received" | "filed" | "failed" | "needs_retry" | "cancelled";
  provider_reference_id: string;
  provider_acknowledgement_id: string;
  arn: string;
  readiness_snapshot: Record<string, unknown>;
  error_summary: Record<string, unknown>;
  submitted_at: string | null;
  arn_received_at: string | null;
  filed_at: string | null;
  last_status_sync_at: string | null;
  approved_by: number | null;
  approved_by_name?: string | null;
  filed_by: number | null;
  filed_by_name?: string | null;
  latest_attempt?: ReturnFilingAttemptRecord | null;
  recovery_actions: {
    can_retry: boolean;
    can_resync: boolean;
    recommended_action: "none" | "retry_filing" | "resync_status" | "review_provider_error" | "review_rollout_controls";
    reason: string;
  };
  intervention_history: ReturnFilingInterventionRecord[];
  provider_evidence_summary: ReturnFilingProviderEvidenceSummary;
  support_actions_summary: ReturnFilingSupportActionSummary;
  support_status_summary: ReturnFilingSupportStatusSummary;
  rollout_policy_summary: ReturnFilingRolloutPolicySummary;
  operational_alerts: ReturnFilingOperationalAlert[];
  alert_routing_summary: ReturnFilingAlertRoutingSummary;
  incident_notes: ReturnFilingIncidentNoteRecord[];
  created_at: string;
  updated_at: string;
};

export type ReturnFilingRolloutPolicySummary = {
  enforced: boolean;
  policy_present: boolean;
  policy_scope: string[];
  provider: "whitebooks";
  return_type: "gstr1" | "gstr3b";
  enable_live_submission: boolean;
  enable_live_status_sync: boolean;
  live_submission_allowed: boolean;
  live_status_sync_allowed: boolean;
  submission_reason: string;
  status_sync_reason: string;
  notes: string;
  effective_from: string | null;
  effective_to: string | null;
};

export type ReturnFilingOperationsRecord = Pick<
  ReturnFilingRecord,
  | "id"
  | "workspace"
  | "workspace_name"
  | "client"
  | "client_name"
  | "gstin"
  | "gstin_value"
  | "compliance_period"
  | "compliance_period_label"
  | "prepared_return"
  | "provider"
  | "return_type"
  | "status"
  | "provider_reference_id"
  | "arn"
  | "last_status_sync_at"
  | "support_actions_summary"
  | "support_status_summary"
  | "provider_evidence_summary"
  | "rollout_policy_summary"
  | "operational_alerts"
  | "alert_routing_summary"
  | "incident_notes"
  | "intervention_history"
  | "updated_at"
>;

export type ProviderAuthSessionRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  client: string;
  client_name?: string;
  gstin: string | null;
  gstin_value?: string;
  provider: "whitebooks";
  email: string;
  txn: string;
  status: "created" | "otp_requested" | "auth_token_received" | "session_active" | "failed";
  otp_request_payload: Record<string, unknown>;
  auth_token_payload: Record<string, unknown>;
  session_metadata: Record<string, unknown>;
  error_summary: Record<string, unknown>;
  response_contract_confirmed: boolean;
  last_requested_at: string | null;
  verified_at: string | null;
  initiated_by: number | null;
  initiated_by_name?: string | null;
  verified_by: number | null;
  verified_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export type WhiteBooksAuthSessionRecord = ProviderAuthSessionRecord;

export type ApprovalRequestRecord = {
  id: string;
  workspace: string;
  workspace_name?: string;
  client: string;
  client_name?: string;
  gstin: string | null;
  gstin_value?: string | null;
  compliance_period: string | null;
  compliance_period_label?: string | null;
  entity_type: "import_batch" | "reconciliation_run" | "return_preparation" | "compliance_period";
  entity_id: string;
  requested_to: number | null;
  requested_to_name?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  comments: string;
  resolution_comments: string;
  resolved_by: number | null;
  resolved_by_name?: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLogRecord = {
  id: string;
  actor: number | null;
  actor_name?: string;
  workspace_id_ref: string | null;
  client_id_ref: string | null;
  gstin_id_ref: string | null;
  compliance_period_id_ref: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  created_at: string;
};

export type ActivitySummaryRecord = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name: string;
  description: string;
  timestamp: string;
};

export type DashboardSummaryRecord = {
  selected_context: {
    workspace: { id: string; name: string } | null;
    client: { id: string; name: string } | null;
    gstin: { id: string; value: string } | null;
    compliance_period: {
      id: string;
      period: string;
      return_type: string;
      status: string;
      due_date: string | null;
    } | null;
  };
  compliance_health_score: number;
  import_summary: {
    total_batches: number;
    by_type: Record<string, number>;
    by_status: Record<string, number>;
    latest_batches: Array<Record<string, unknown>>;
  };
  transaction_summary: {
    total_transactions: number;
    by_type: Record<string, number>;
    sales_count: number;
    purchase_count: number;
    gstr_2b_count: number;
  };
  reconciliation_summary: {
    latest_run: { id: string; status: string; processed_at: string | null } | null;
    matched_count: number;
    mismatch_count: number;
    partial_match_count: number;
    missing_in_books_count: number;
    missing_in_portal_count: number;
    duplicate_count: number;
    total_itc_at_risk: string;
    open_issue_count: number;
    mismatch_breakdown: Array<{ name: string; value: number; color: string }>;
    top_vendors: Array<Record<string, string>>;
  };
  return_summary: {
    gstr1: Record<string, unknown>;
    gstr3b: Record<string, unknown>;
    filed_count: number;
    total_expected: number;
    display_status: string;
  };
  approval_summary: {
    pending_count: number;
    approved_count: number;
    rejected_count: number;
    cancelled_count: number;
    latest: Record<string, unknown> | null;
  };
  filing_status: {
    gstr1_status: string;
    gstr3b_status: string;
    all_filed: boolean;
  };
  lock_status: {
    is_locked: boolean;
    locked_at: string | null;
    locked_by_name: string | null;
  };
  close_management_summary: {
    assignment_count: number;
    open_assignment_count: number;
    in_progress_count: number;
    resolved_count: number;
    deferred_count: number;
    overdue_assignment_count: number;
    stale_assignment_count: number;
    escalated_assignment_count: number;
    follow_up_count: number;
    open_follow_up_count: number;
    follow_ups_due_today_count: number;
    owner_workload: Array<{ name: string; count: number; escalated: number }>;
    next_follow_ups: Array<{
      id: string;
      title: string;
      status: string;
      follow_up_type: string;
      remind_at: string;
      assigned_to_name: string | null;
      assignment_title: string;
    }>;
  };
  workspace_close_manager_summary?: CloseManagerDashboardRecord | null;
  open_issues: number;
  recent_activity: ActivitySummaryRecord[];
};

export type CloseManagerDashboardRecord = {
  workspace: { id: string; name: string } | null;
  assignment_count: number;
  open_assignment_count: number;
  escalated_assignment_count: number;
  overdue_assignment_count: number;
  stale_assignment_count: number;
  follow_up_count: number;
  open_follow_up_count: number;
  follow_ups_due_today_count: number;
  queues: Array<{
    client_id: string;
    client_name: string;
    period_id: string;
    period: string;
    gstin_value: string | null;
    open_assignments: number;
    in_progress_assignments: number;
    resolved_assignments: number;
    deferred_assignments: number;
    escalated_assignments: number;
    overdue_assignments: number;
    follow_ups_due: number;
  }>;
  owner_workload: Array<{ name: string; count: number; overdue: number; escalated: number }>;
  attention_items: Array<{
    assignment_id: string;
    title: string;
    client_name: string;
    period: string;
    assigned_to_name: string;
    status: string;
    is_escalated: boolean;
    is_overdue: boolean;
    age_days: number;
    updated_days: number;
  }>;
  next_follow_ups: Array<{
    id: string;
    title: string;
    client_name: string;
    period: string;
    status: string;
    follow_up_type: string;
    remind_at: string;
    assigned_to_name: string | null;
    assignment_title: string;
  }>;
};

export type CloseManagerReportRecord = {
  workspace: { id: string; name: string } | null;
  window_days: number;
  summary: {
    digests_generated: number;
    digests_dispatched: number;
    digests_acknowledged: number;
    digest_failures: number;
    reminders_sent: number;
    follow_ups_completed: number;
    follow_ups_dismissed: number;
    auto_escalations: number;
  };
  daily: Array<{
    date: string;
    digests_generated: number;
    digests_dispatched: number;
    digest_failures: number;
    reminders_sent: number;
    follow_ups_completed: number;
    auto_escalations: number;
  }>;
  recent_activity: Array<{
    id: string;
    action: string;
    actor_name: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
};

export type WorkspaceSummaryRecord = {
  period_details: {
    id: string;
    period: string;
    return_type: string;
    status: string;
    due_date: string | null;
  } | null;
  imports_by_type_status: DashboardSummaryRecord["import_summary"];
  latest_reconciliation_run: DashboardSummaryRecord["reconciliation_summary"]["latest_run"];
  reconciliation_issue_counts: {
    mismatches: number;
    partial_matches: number;
    missing_in_books: number;
    missing_in_portal: number;
    duplicates: number;
  };
  return_preparation_statuses: DashboardSummaryRecord["return_summary"];
  approvals: DashboardSummaryRecord["approval_summary"];
  audit_activity: ActivitySummaryRecord[];
  lock_state: DashboardSummaryRecord["lock_status"];
  next_recommended_action: string;
};
