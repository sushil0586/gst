from apps.accounts.views import WorkspaceMemberViewSet
from rest_framework.routers import DefaultRouter
from django.urls import path

from apps.approvals.views import ApprovalRequestViewSet
from apps.audit_logs.views import AuditLogViewSet
from apps.clients.views import ClientViewSet
from apps.compliance_periods.views import CompliancePeriodViewSet
from apps.filings.views import ProviderAuthSessionViewSet, ReturnFilingViewSet, WhiteBooksAuthSessionViewSet
from apps.gst_transactions.views import (
    GSTTransactionViewSet,
    TransactionRemediationAssignmentViewSet,
    TransactionRemediationDigestViewSet,
    TransactionRemediationFollowUpViewSet,
    TransactionReviewSnapshotViewSet,
)
from apps.gstins.views import GSTINViewSet
from apps.imports.views import ImportBatchViewSet, ImportTemplateViewSet
from apps.notices.views import NoticeViewSet
from apps.organizations.views import OrganizationViewSet
from apps.reconciliation.views import ReconciliationItemViewSet, ReconciliationRunViewSet
from apps.returns.views import ReturnPreparationViewSet
from apps.workspaces.views import WorkspaceViewSet
from apps.common.views import (
    AuditLogsExportView,
    CloseManagerReportExportView,
    DashboardCloseManagerView,
    DashboardCloseManagerReportView,
    DashboardSummaryView,
    FilingEvidencePackExportView,
    ImportErrorsExportView,
    ReconciliationExportView,
    ReturnSummaryExportView,
    TransactionExportView,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("workspaces", WorkspaceViewSet, basename="workspace")
router.register("clients", ClientViewSet, basename="client")
router.register("gstins", GSTINViewSet, basename="gstin")
router.register("compliance-periods", CompliancePeriodViewSet, basename="compliance-period")
router.register("import-templates", ImportTemplateViewSet, basename="import-template")
router.register("imports/batches", ImportBatchViewSet, basename="import-batch")
router.register("gst-transactions", GSTTransactionViewSet, basename="gst-transaction")
router.register("gst-transaction-review-snapshots", TransactionReviewSnapshotViewSet, basename="gst-transaction-review-snapshot")
router.register("gst-transaction-remediation-assignments", TransactionRemediationAssignmentViewSet, basename="gst-transaction-remediation-assignment")
router.register("gst-transaction-remediation-digests", TransactionRemediationDigestViewSet, basename="gst-transaction-remediation-digest")
router.register("gst-transaction-remediation-follow-ups", TransactionRemediationFollowUpViewSet, basename="gst-transaction-remediation-follow-up")
router.register("workspace-members", WorkspaceMemberViewSet, basename="workspace-member")
router.register("reconciliation/runs", ReconciliationRunViewSet, basename="reconciliation-run")
router.register("reconciliation/items", ReconciliationItemViewSet, basename="reconciliation-item")
router.register("returns", ReturnPreparationViewSet, basename="return-preparation")
router.register("filings", ReturnFilingViewSet, basename="return-filing")
router.register("provider-auth-sessions", ProviderAuthSessionViewSet, basename="provider-auth-session")
router.register("whitebooks-auth-sessions", WhiteBooksAuthSessionViewSet, basename="whitebooks-auth-session")
router.register("approvals", ApprovalRequestViewSet, basename="approval-request")
router.register("notices", NoticeViewSet, basename="notice")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/close-manager/", DashboardCloseManagerView.as_view(), name="dashboard-close-manager"),
    path("dashboard/close-manager/report/", DashboardCloseManagerReportView.as_view(), name="dashboard-close-manager-report"),
    path("exports/transactions/", TransactionExportView.as_view(), name="export-transactions"),
    path("exports/import-errors/", ImportErrorsExportView.as_view(), name="export-import-errors"),
    path("exports/reconciliation/", ReconciliationExportView.as_view(), name="export-reconciliation"),
    path("exports/return-summary/", ReturnSummaryExportView.as_view(), name="export-return-summary"),
    path("exports/audit-logs/", AuditLogsExportView.as_view(), name="export-audit-logs"),
    path("exports/filing-evidence-pack/", FilingEvidencePackExportView.as_view(), name="export-filing-evidence-pack"),
    path("exports/close-manager-report/", CloseManagerReportExportView.as_view(), name="export-close-manager-report"),
    *router.urls,
]
