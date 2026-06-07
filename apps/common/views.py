from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.audit_logs.models import AuditLog
from apps.clients.models import Client
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.throttling import SensitiveExportRateThrottle
from apps.common.cache_utils import get_cached_or_build, scoped_cache_key
from apps.common.services.dashboard import build_close_manager_dashboard, build_close_manager_report, build_dashboard_summary
from apps.common.services.exports import (
    export_audit_logs,
    export_close_manager_report,
    export_filing_evidence_pack,
    export_gstr1_workbook,
    export_gstr3b_workbook,
    export_gstr7_workbook,
    export_gstr9_workbook,
    export_import_errors,
    export_reconciliation,
    export_return_summary,
    export_transactions,
)
from apps.compliance_periods.models import CompliancePeriod
from apps.filings.models import ReturnFiling
from apps.gst_transactions.models import GSTTransaction
from apps.imports.models import ImportRowError
from apps.reconciliation.models import ReconciliationItem
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace


class WorkspaceScopedAPIView(APIView):
    permission_classes = [IsAuthenticated, WorkspaceRBACPermission]

    def get_workspace_and_client(self, request, obj=None):
        client_id = request.query_params.get("client")
        workspace_id = request.query_params.get("workspace")
        if client_id:
            client_queryset = Client.objects.filter(pk=client_id).select_related("workspace")
            if workspace_id:
                client_queryset = client_queryset.filter(workspace_id=workspace_id)
            client = client_queryset.first()
            return (client.workspace if client else None), client
        workspace = Workspace.objects.filter(pk=workspace_id).first() if workspace_id else None
        return workspace, None


class SensitiveExportAPIView(WorkspaceScopedAPIView):
    throttle_classes = [SensitiveExportRateThrottle]


class DashboardSummaryView(WorkspaceScopedAPIView):
    def get_permission_code(self, request):
        return "view_client"

    def get(self, request, *args, **kwargs):
        workspace_id = request.query_params.get("workspace")
        client_id = request.query_params.get("client")
        gstin_id = request.query_params.get("gstin")
        compliance_period_id = request.query_params.get("compliance_period")
        cache_key = scoped_cache_key(
            "dashboard-summary",
            user_id=request.user.id,
            workspace_id=workspace_id,
            client_id=client_id,
            gstin_id=gstin_id,
            compliance_period_id=compliance_period_id,
        )
        from rest_framework.response import Response
        from apps.common.api import api_response

        payload = get_cached_or_build(
            cache_key,
            settings.CACHE_DASHBOARD_SUMMARY_SECONDS,
            lambda: api_response(
                data=build_dashboard_summary(
                    workspace_id=workspace_id,
                    client_id=client_id,
                    gstin_id=gstin_id,
                    compliance_period_id=compliance_period_id,
                )
            ),
        )
        return Response(payload)


class DashboardCloseManagerView(WorkspaceScopedAPIView):
    def get_permission_code(self, request):
        return "view_client"

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response
        from apps.common.api import api_response

        workspace_id = request.query_params.get("workspace")
        cache_key = scoped_cache_key(
            "dashboard-close-manager",
            user_id=request.user.id,
            workspace_id=workspace_id,
        )
        payload = get_cached_or_build(
            cache_key,
            settings.CACHE_CLOSE_MANAGER_SECONDS,
            lambda: api_response(data=build_close_manager_dashboard(workspace_id=workspace_id)),
        )
        return Response(payload)


class DashboardCloseManagerReportView(WorkspaceScopedAPIView):
    def get_permission_code(self, request):
        return "view_client"

    def get(self, request, *args, **kwargs):
        from rest_framework.response import Response
        from apps.common.api import api_response

        workspace_id = request.query_params.get("workspace")
        days = request.query_params.get("days", 7)
        cache_key = scoped_cache_key(
            "dashboard-close-manager-report",
            user_id=request.user.id,
            workspace_id=workspace_id,
            days=days,
        )
        payload = get_cached_or_build(
            cache_key,
            settings.CACHE_CLOSE_MANAGER_SECONDS,
            lambda: api_response(
                data=build_close_manager_report(
                    workspace_id=workspace_id,
                    days=days,
                )
            ),
        )
        return Response(payload)


class TransactionExportView(WorkspaceScopedAPIView):
    def get_permission_code(self, request):
        return "view_client"

    def get(self, request, *args, **kwargs):
        queryset = GSTTransaction.objects.filter(is_active=True).select_related("import_batch")
        workspace_id = request.query_params.get("workspace")
        client_id = request.query_params.get("client")
        gstin_id = request.query_params.get("gstin")
        period_id = request.query_params.get("compliance_period") or request.query_params.get("period")
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        if request.query_params.get("transaction_type"):
            queryset = queryset.filter(transaction_type=request.query_params["transaction_type"])
        if request.query_params.get("document_type"):
            queryset = queryset.filter(document_type=request.query_params["document_type"])
        if request.query_params.get("status"):
            queryset = queryset.filter(status=request.query_params["status"])
        if request.query_params.get("counterparty_gstin"):
            queryset = queryset.filter(counterparty_gstin__icontains=request.query_params["counterparty_gstin"])
        if request.query_params.get("date_from"):
            queryset = queryset.filter(transaction_date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            queryset = queryset.filter(transaction_date__lte=request.query_params["date_to"])
        source_import_batch_id = request.query_params.get("source_import_batch") or request.query_params.get("import_batch")
        if source_import_batch_id:
            queryset = queryset.filter(import_batch_id=source_import_batch_id)
        return export_transactions(queryset.order_by("-transaction_date", "-created_at"))


class ImportErrorsExportView(SensitiveExportAPIView):
    def get_permission_codes(self, request):
        return ["import_data", "view_audit_log"]

    def get(self, request, *args, **kwargs):
        queryset = ImportRowError.objects.filter(is_active=True).select_related("import_batch")
        workspace_id = request.query_params.get("workspace")
        client_id = request.query_params.get("client")
        gstin_id = request.query_params.get("gstin")
        period_id = request.query_params.get("compliance_period") or request.query_params.get("period")
        if workspace_id:
            queryset = queryset.filter(import_batch__workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(import_batch__client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(import_batch__gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(import_batch__compliance_period_id=period_id)
        if request.query_params.get("import_batch"):
            queryset = queryset.filter(import_batch_id=request.query_params["import_batch"])
        return export_import_errors(queryset.order_by("import_batch__created_at", "row_number"))


class ReconciliationExportView(SensitiveExportAPIView):
    def get_permission_codes(self, request):
        return ["run_reconciliation", "view_audit_log"]

    def get(self, request, *args, **kwargs):
        queryset = ReconciliationItem.objects.filter(is_active=True).select_related(
            "reconciliation_run",
            "books_transaction",
            "portal_transaction",
        )
        workspace_id = request.query_params.get("workspace")
        client_id = request.query_params.get("client")
        gstin_id = request.query_params.get("gstin")
        period_id = request.query_params.get("compliance_period") or request.query_params.get("period")
        if workspace_id:
            queryset = queryset.filter(reconciliation_run__workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(reconciliation_run__client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(reconciliation_run__gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(reconciliation_run__compliance_period_id=period_id)
        if request.query_params.get("run"):
            queryset = queryset.filter(reconciliation_run_id=request.query_params["run"])
        if request.query_params.get("match_status"):
            queryset = queryset.filter(match_status=request.query_params["match_status"])
        if request.query_params.get("action_status"):
            queryset = queryset.filter(action_status=request.query_params["action_status"])
        if request.query_params.get("mismatch_reason"):
            queryset = queryset.filter(mismatch_reason=request.query_params["mismatch_reason"])
        if request.query_params.get("date_from"):
            queryset = queryset.filter(reconciliation_run__created_at__date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            queryset = queryset.filter(reconciliation_run__created_at__date__lte=request.query_params["date_to"])
        return export_reconciliation(queryset.order_by("-reconciliation_run__created_at", "-created_at"))


class ReturnSummaryExportView(SensitiveExportAPIView):
    def get_permission_codes(self, request):
        return ["prepare_return", "approve_return", "file_return", "view_audit_log"]

    def get(self, request, *args, **kwargs):
        queryset = ReturnPreparation.objects.filter(is_active=True).select_related(
            "compliance_period",
            "compliance_period__gstin",
            "compliance_period__gstin__client",
            "prepared_by",
            "approved_by",
            "filed_by",
        )
        workspace_id = request.query_params.get("workspace")
        client_id = request.query_params.get("client")
        gstin_id = request.query_params.get("gstin")
        period_id = request.query_params.get("compliance_period") or request.query_params.get("period")
        if workspace_id:
            queryset = queryset.filter(compliance_period__gstin__client__workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(compliance_period__gstin__client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(compliance_period__gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        if request.query_params.get("return_type"):
            queryset = queryset.filter(return_type=request.query_params["return_type"])
        if request.query_params.get("date_from"):
            queryset = queryset.filter(created_at__date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            queryset = queryset.filter(created_at__date__lte=request.query_params["date_to"])
        queryset = queryset.order_by("-created_at")
        export_mode = request.query_params.get("export_mode")
        if export_mode == "full_gstr1":
            compliance_period = None
            if period_id:
                compliance_period = CompliancePeriod.objects.select_related("gstin", "gstin__client", "gstin__client__workspace").filter(pk=period_id).first()
            prepared_return = queryset.filter(return_type=ReturnPreparation.ReturnType.GSTR1).first()
            if compliance_period is None and prepared_return is not None:
                compliance_period = prepared_return.compliance_period
            if compliance_period is not None:
                return export_gstr1_workbook(compliance_period=compliance_period, prepared_return=prepared_return)
        if export_mode == "full_gstr3b":
            compliance_period = None
            if period_id:
                compliance_period = CompliancePeriod.objects.select_related("gstin", "gstin__client", "gstin__client__workspace").filter(pk=period_id).first()
            prepared_return = queryset.filter(return_type=ReturnPreparation.ReturnType.GSTR3B).first()
            if compliance_period is None and prepared_return is not None:
                compliance_period = prepared_return.compliance_period
            if compliance_period is not None:
                return export_gstr3b_workbook(compliance_period=compliance_period, prepared_return=prepared_return)
        if export_mode == "full_gstr9":
            compliance_period = None
            if period_id:
                compliance_period = CompliancePeriod.objects.select_related("gstin", "gstin__client", "gstin__client__workspace").filter(pk=period_id).first()
            prepared_return = queryset.filter(return_type=ReturnPreparation.ReturnType.GSTR9).first()
            if compliance_period is None and prepared_return is not None:
                compliance_period = prepared_return.compliance_period
            if compliance_period is not None:
                return export_gstr9_workbook(compliance_period=compliance_period, prepared_return=prepared_return)
        if export_mode == "full_gstr7":
            compliance_period = None
            if period_id:
                compliance_period = CompliancePeriod.objects.select_related("gstin", "gstin__client", "gstin__client__workspace").filter(pk=period_id).first()
            prepared_return = queryset.filter(return_type=ReturnPreparation.ReturnType.GSTR7).first()
            if compliance_period is None and prepared_return is not None:
                compliance_period = prepared_return.compliance_period
            if compliance_period is not None:
                return export_gstr7_workbook(compliance_period=compliance_period, prepared_return=prepared_return)
        return export_return_summary(queryset)


class AuditLogsExportView(SensitiveExportAPIView):
    def get_permission_code(self, request):
        return "view_audit_log"

    def get(self, request, *args, **kwargs):
        queryset = AuditLog.objects.filter(is_active=True).select_related("actor")
        workspace_id = request.query_params.get("workspace")
        client_id = request.query_params.get("client")
        gstin_id = request.query_params.get("gstin")
        period_id = request.query_params.get("compliance_period") or request.query_params.get("period")
        if workspace_id:
            queryset = queryset.filter(workspace_id_ref=workspace_id)
        if client_id:
            queryset = queryset.filter(client_id_ref=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id_ref=gstin_id)
        if period_id:
            queryset = queryset.filter(compliance_period_id_ref=period_id)
        if request.query_params.get("action"):
            queryset = queryset.filter(action__icontains=request.query_params["action"])
        if request.query_params.get("entity_type"):
            queryset = queryset.filter(entity_type__icontains=request.query_params["entity_type"])
        if request.query_params.get("actor"):
            queryset = queryset.filter(actor_id=request.query_params["actor"])
        if request.query_params.get("date_from"):
            queryset = queryset.filter(created_at__date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            queryset = queryset.filter(created_at__date__lte=request.query_params["date_to"])
        return export_audit_logs(queryset.order_by("-created_at"))


class CloseManagerReportExportView(SensitiveExportAPIView):
    def get_permission_codes(self, request):
        return ["view_audit_log", "manage_settings"]

    def get(self, request, *args, **kwargs):
        return export_close_manager_report(
            workspace_id=request.query_params.get("workspace"),
            days=request.query_params.get("days", 7),
        )


class FilingEvidencePackExportView(SensitiveExportAPIView):
    def get_permission_codes(self, request):
        return ["file_return", "view_audit_log"]

    def get(self, request, *args, **kwargs):
        filing_id = request.query_params.get("filing")
        filing = (
            ReturnFiling.objects.select_related(
                "workspace",
                "client",
                "gstin",
                "compliance_period",
                "prepared_return",
                "approval_request",
                "approved_by",
                "filed_by",
            )
            .filter(pk=filing_id, is_active=True)
            .first()
        )
        if filing is None:
            from rest_framework.response import Response
            from apps.common.api import api_response

            return Response(api_response(message="Filing not found"), status=404)
        return export_filing_evidence_pack(filing=filing)
