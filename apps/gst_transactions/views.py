from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.compliance_periods.models import CompliancePeriod
from apps.accounts.models import WorkspaceMembership
from apps.audit_logs.services.audit import record_audit_log
from apps.gst_transactions.selectors.gst_transactions import get_gst_transaction_queryset
from apps.gst_transactions.serializers import (
    GSTTransactionBulkUpdateSerializer,
    GSTTransactionSerializer,
    GSTTransactionUpdateSerializer,
    TransactionRemediationEscalationSerializer,
    TransactionRemediationAssignmentSerializer,
    TransactionRemediationDigestAcknowledgeSerializer,
    TransactionRemediationDigestSerializer,
    TransactionRemediationFollowUpSerializer,
    TransactionRemediationFollowUpStatusSerializer,
    TransactionReviewSnapshotSerializer,
    WorkspaceMemberSerializer,
)
from apps.gst_transactions.models import (
    TransactionRemediationAssignment,
    TransactionRemediationDigest,
    TransactionRemediationFollowUp,
    TransactionReviewSnapshot,
)
from apps.gst_transactions.services.digests import create_remediation_digest, enqueue_digest_dispatch
from apps.gst_transactions.services.follow_ups import dispatch_follow_up_reminder
from apps.gst_transactions.services.transactions import bulk_update_gst_transactions, update_gst_transaction
from apps.gstins.models import GSTIN
from apps.imports.models import ImportBatch


class GSTTransactionViewSet(StandardizedModelViewSet):
    serializer_class = GSTTransactionSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "GST Transaction"
    filterset_fields = [
        "client",
        "gstin",
        "compliance_period",
        "transaction_type",
        "document_type",
        "counterparty_gstin",
        "status",
    ]
    search_fields = ["reference_number", "counterparty_name", "counterparty_gstin"]
    ordering_fields = ["transaction_date", "created_at", "taxable_value", "total_amount"]
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_queryset(self):
        queryset = get_gst_transaction_queryset()
        period_id = self.request.query_params.get("period")
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        batch_id = self.request.query_params.get("source_import_batch")
        if batch_id:
            queryset = queryset.filter(import_batch_id=batch_id)
        import_batch_id = self.request.query_params.get("import_batch")
        if import_batch_id:
            queryset = queryset.filter(import_batch_id=import_batch_id)
        ids = self.request.query_params.get("ids")
        if ids:
            queryset = queryset.filter(id__in=[value for value in ids.split(",") if value])
        start_date = self.request.query_params.get("date_from")
        if start_date:
            queryset = queryset.filter(transaction_date__gte=start_date)
        end_date = self.request.query_params.get("date_to")
        if end_date:
            queryset = queryset.filter(transaction_date__lte=end_date)
        return queryset

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return GSTTransactionUpdateSerializer
        if self.action == "bulk_correct":
            return GSTTransactionBulkUpdateSerializer
        return GSTTransactionSerializer

    def get_permission_code(self, request):
        return "view_client" if request.method in {"GET", "HEAD", "OPTIONS"} else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        client_id = self.request.query_params.get("client")
        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client
        gstin_id = self.request.query_params.get("gstin")
        if gstin_id:
            gstin = GSTIN.objects.filter(pk=gstin_id).select_related("client", "client__workspace").first()
            return (gstin.client.workspace if gstin else None), (gstin.client if gstin else None)
        batch_id = self.request.query_params.get("source_import_batch")
        if batch_id:
            batch = ImportBatch.objects.filter(pk=batch_id).select_related("workspace", "client").first()
            return (batch.workspace if batch else None), (batch.client if batch else None)
        ids = self.request.query_params.get("ids")
        if ids:
            transaction = (
                get_gst_transaction_queryset()
                .filter(id__in=[value for value in ids.split(",") if value])
                .select_related("workspace", "client")
                .first()
            )
            return (transaction.workspace if transaction else None), (transaction.client if transaction else None)
        request_ids = request.data.get("ids") if hasattr(request, "data") else None
        if request_ids:
            transaction = get_gst_transaction_queryset().filter(id__in=request_ids).select_related("workspace", "client").first()
            return (transaction.workspace if transaction else None), (transaction.client if transaction else None)
        return None, None

    def perform_update(self, serializer):
        return update_gst_transaction(serializer=serializer, user=self.request.user)

    @action(detail=False, methods=["post"], url_path="bulk-correct")
    def bulk_correct(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = serializer.validated_data["ids"]
        transactions = list(get_gst_transaction_queryset().filter(id__in=ids))
        if len(transactions) != len(ids):
            raise serializers.ValidationError({"ids": "One or more selected transactions could not be found."})
        workspace_ids = {transaction.workspace_id for transaction in transactions}
        client_ids = {transaction.client_id for transaction in transactions}
        period_ids = {transaction.compliance_period_id for transaction in transactions}
        if len(workspace_ids) > 1 or len(client_ids) > 1 or len(period_ids) > 1:
            raise serializers.ValidationError({"ids": "Bulk correction requires transactions from the same workspace, client, and compliance period."})
        updated_transactions = bulk_update_gst_transactions(
            transactions=transactions,
            payload=serializer.validated_data,
            user=request.user,
        )
        output = GSTTransactionSerializer(updated_transactions, many=True, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message=f"{len(updated_transactions)} GST transactions corrected"))


class TransactionReviewSnapshotViewSet(StandardizedModelViewSet):
    serializer_class = TransactionReviewSnapshotSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Transaction Review Snapshot"
    filterset_fields = ["workspace", "client", "gstin", "compliance_period", "created_by"]
    search_fields = ["name"]
    ordering_fields = ["created_at", "name"]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        queryset = TransactionReviewSnapshot.objects.select_related(
            "workspace",
            "client",
            "gstin",
            "compliance_period",
            "created_by",
        )
        workspace_id = self.request.query_params.get("workspace")
        client_id = self.request.query_params.get("client")
        gstin_id = self.request.query_params.get("gstin")
        period_id = self.request.query_params.get("compliance_period") or self.request.query_params.get("period")
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        return queryset

    def get_permission_code(self, request):
        return "view_client" if request.method in {"GET", "HEAD", "OPTIONS"} else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        client_id = request.data.get("client") or request.query_params.get("client")
        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client
        period_id = request.data.get("compliance_period") or request.query_params.get("compliance_period") or request.query_params.get("period")
        if period_id:
            period = (
                CompliancePeriod.objects.filter(pk=period_id)
                .select_related("gstin", "gstin__client", "gstin__client__workspace")
                .first()
            )
            if period:
                return period.gstin.client.workspace, period.gstin.client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        client = Client.objects.filter(workspace_id=workspace_id).select_related("workspace").first() if workspace_id else None
        return (client.workspace if client else None), client

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        record_audit_log(
            actor=self.request.user,
            action="transaction_review_snapshot.created",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"bucket_codes": list((instance.bucket_counts or {}).keys())},
        )
        return instance

    def perform_destroy(self, instance):
        record_audit_log(
            actor=self.request.user,
            action="transaction_review_snapshot.deleted",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"name": instance.name},
        )
        instance.delete()


class WorkspaceMemberViewSet(StandardizedModelViewSet):
    serializer_class = WorkspaceMemberSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Workspace Member"
    filterset_fields = ["workspace", "role", "user"]
    search_fields = ["user__username", "user__first_name", "user__last_name", "user__email"]
    ordering_fields = ["user__first_name", "user__username", "role", "created_at"]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        queryset = WorkspaceMembership.objects.filter(is_active=True).select_related("workspace", "user").order_by("workspace__name", "user__username")
        workspace_id = self.request.query_params.get("workspace")
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        return queryset

    def get_permission_code(self, request):
        return "view_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, None
        workspace_id = request.query_params.get("workspace")
        if workspace_id:
            membership = WorkspaceMembership.objects.filter(workspace_id=workspace_id).select_related("workspace").first()
            return (membership.workspace if membership else None), None
        return None, None


class TransactionRemediationAssignmentViewSet(StandardizedModelViewSet):
    serializer_class = TransactionRemediationAssignmentSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Transaction Remediation Assignment"
    filterset_fields = ["workspace", "client", "gstin", "compliance_period", "assigned_to", "status", "bucket_code"]
    search_fields = ["title", "notes", "bucket_code"]
    ordering_fields = ["created_at", "updated_at", "title", "status"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = TransactionRemediationAssignment.objects.select_related(
            "workspace",
            "client",
            "gstin",
            "compliance_period",
            "assigned_to",
            "created_by",
            "snapshot",
        )
        workspace_id = self.request.query_params.get("workspace")
        client_id = self.request.query_params.get("client")
        gstin_id = self.request.query_params.get("gstin")
        period_id = self.request.query_params.get("compliance_period") or self.request.query_params.get("period")
        assigned_to = self.request.query_params.get("assigned_to")
        status_value = self.request.query_params.get("status")
        bucket_code = self.request.query_params.get("bucket_code")
        is_escalated = self.request.query_params.get("is_escalated")
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        if assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if bucket_code:
            queryset = queryset.filter(bucket_code=bucket_code)
        if is_escalated == "true":
            queryset = queryset.filter(escalated_at__isnull=False)
        elif is_escalated == "false":
            queryset = queryset.filter(escalated_at__isnull=True)
        return queryset

    def get_permission_code(self, request):
        return "view_client" if request.method in {"GET", "HEAD", "OPTIONS"} else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        client_id = request.data.get("client") or request.query_params.get("client")
        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client
        period_id = request.data.get("compliance_period") or request.query_params.get("compliance_period") or request.query_params.get("period")
        if period_id:
            period = (
                CompliancePeriod.objects.filter(pk=period_id)
                .select_related("gstin", "gstin__client", "gstin__client__workspace")
                .first()
            )
            if period:
                return period.gstin.client.workspace, period.gstin.client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        client = Client.objects.filter(workspace_id=workspace_id).select_related("workspace").first() if workspace_id else None
        return (client.workspace if client else None), client

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        record_audit_log(
            actor=self.request.user,
            action="transaction_remediation_assignment.created",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={
                "bucket_code": instance.bucket_code,
                "assigned_to": instance.assigned_to_id,
                "status": instance.status,
                "transaction_count": len(instance.transaction_ids or []),
            },
        )
        return instance

    def perform_update(self, serializer):
        previous = self.get_object()
        previous_status = previous.status
        previous_assigned_to_id = previous.assigned_to_id
        instance = serializer.save(updated_by=self.request.user)
        record_audit_log(
            actor=self.request.user,
            action="transaction_remediation_assignment.updated",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={
                "from_status": previous_status,
                "to_status": instance.status,
                "from_assigned_to": previous_assigned_to_id,
                "to_assigned_to": instance.assigned_to_id,
            },
        )
        return instance

    def perform_destroy(self, instance):
        record_audit_log(
            actor=self.request.user,
            action="transaction_remediation_assignment.deleted",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"bucket_code": instance.bucket_code, "assigned_to": instance.assigned_to_id},
        )
        instance.delete()

    @action(detail=True, methods=["post"], url_path="escalate")
    def escalate(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = TransactionRemediationEscalationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance.escalated_at = timezone.now()
        instance.escalated_by = request.user
        instance.escalation_notes = serializer.validated_data.get("escalation_notes", "")
        instance.updated_by = request.user
        instance.save(update_fields=["escalated_at", "escalated_by", "escalation_notes", "updated_by", "updated_at"])
        record_audit_log(
            actor=request.user,
            action="transaction_remediation_assignment.escalated",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"assigned_to": instance.assigned_to_id, "notes": instance.escalation_notes},
        )
        output = self.get_serializer(instance)
        return Response(api_response(data=output.data, message="Transaction Remediation Assignment escalated"))

    @action(detail=True, methods=["post"], url_path="clear-escalation")
    def clear_escalation(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.escalated_at = None
        instance.escalated_by = None
        instance.escalation_notes = ""
        instance.updated_by = request.user
        instance.save(update_fields=["escalated_at", "escalated_by", "escalation_notes", "updated_by", "updated_at"])
        record_audit_log(
            actor=request.user,
            action="transaction_remediation_assignment.escalation_cleared",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"assigned_to": instance.assigned_to_id},
        )
        output = self.get_serializer(instance)
        return Response(api_response(data=output.data, message="Transaction Remediation Assignment escalation cleared"))


class TransactionRemediationFollowUpViewSet(StandardizedModelViewSet):
    serializer_class = TransactionRemediationFollowUpSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Transaction Remediation Follow Up"
    filterset_fields = ["workspace", "client", "gstin", "compliance_period", "assignment", "assigned_to", "status", "follow_up_type"]
    search_fields = ["title", "notes", "assignment__title"]
    ordering_fields = ["created_at", "updated_at", "remind_at", "status"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = TransactionRemediationFollowUp.objects.select_related(
            "workspace",
            "client",
            "gstin",
            "compliance_period",
            "assignment",
            "assigned_to",
            "created_by",
            "completed_by",
        )
        workspace_id = self.request.query_params.get("workspace")
        client_id = self.request.query_params.get("client")
        gstin_id = self.request.query_params.get("gstin")
        period_id = self.request.query_params.get("compliance_period") or self.request.query_params.get("period")
        assignment_id = self.request.query_params.get("assignment")
        assigned_to = self.request.query_params.get("assigned_to")
        status_value = self.request.query_params.get("status")
        follow_up_type = self.request.query_params.get("follow_up_type")
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        if assignment_id:
            queryset = queryset.filter(assignment_id=assignment_id)
        if assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if follow_up_type:
            queryset = queryset.filter(follow_up_type=follow_up_type)
        return queryset

    def get_permission_code(self, request):
        return "view_client" if request.method in {"GET", "HEAD", "OPTIONS"} else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        assignment_id = request.data.get("assignment") or request.query_params.get("assignment")
        if assignment_id:
            assignment = TransactionRemediationAssignment.objects.filter(pk=assignment_id).select_related("workspace", "client").first()
            return (assignment.workspace if assignment else None), (assignment.client if assignment else None)
        client_id = request.data.get("client") or request.query_params.get("client")
        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client
        period_id = request.data.get("compliance_period") or request.query_params.get("compliance_period") or request.query_params.get("period")
        if period_id:
            period = (
                CompliancePeriod.objects.filter(pk=period_id)
                .select_related("gstin", "gstin__client", "gstin__client__workspace")
                .first()
            )
            if period:
                return period.gstin.client.workspace, period.gstin.client
        return None, None

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        record_audit_log(
            actor=self.request.user,
            action="transaction_remediation_follow_up.created",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={
                "assignment_id": str(instance.assignment_id),
                "assigned_to": instance.assigned_to_id,
                "follow_up_type": instance.follow_up_type,
                "status": instance.status,
                "remind_at": instance.remind_at.isoformat(),
            },
        )
        return instance

    def perform_update(self, serializer):
        previous = self.get_object()
        instance = serializer.save(updated_by=self.request.user)
        record_audit_log(
            actor=self.request.user,
            action="transaction_remediation_follow_up.updated",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={
                "from_status": previous.status,
                "to_status": instance.status,
                "from_assigned_to": previous.assigned_to_id,
                "to_assigned_to": instance.assigned_to_id,
                "remind_at": instance.remind_at.isoformat(),
            },
        )
        return instance

    def perform_destroy(self, instance):
        record_audit_log(
            actor=self.request.user,
            action="transaction_remediation_follow_up.deleted",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"assignment_id": str(instance.assignment_id), "assigned_to": instance.assigned_to_id},
        )
        instance.delete()

    @action(detail=True, methods=["post"], url_path="mark-completed")
    def mark_completed(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = TransactionRemediationFollowUpStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        notes = serializer.validated_data.get("notes", "")
        if notes:
            instance.notes = notes
        instance.status = TransactionRemediationFollowUp.FollowUpStatus.COMPLETED
        instance.completed_at = timezone.now()
        instance.completed_by = request.user
        instance.updated_by = request.user
        instance.save(update_fields=["notes", "status", "completed_at", "completed_by", "updated_by", "updated_at"])
        record_audit_log(
            actor=request.user,
            action="transaction_remediation_follow_up.completed",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"assignment_id": str(instance.assignment_id)},
        )
        output = self.get_serializer(instance)
        return Response(api_response(data=output.data, message="Transaction Remediation Follow Up completed"))

    @action(detail=True, methods=["post"], url_path="dismiss")
    def dismiss(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = TransactionRemediationFollowUpStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        notes = serializer.validated_data.get("notes", "")
        if notes:
            instance.notes = notes
        instance.status = TransactionRemediationFollowUp.FollowUpStatus.DISMISSED
        instance.updated_by = request.user
        instance.save(update_fields=["notes", "status", "updated_by", "updated_at"])
        record_audit_log(
            actor=request.user,
            action="transaction_remediation_follow_up.dismissed",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"assignment_id": str(instance.assignment_id)},
        )
        output = self.get_serializer(instance)
        return Response(api_response(data=output.data, message="Transaction Remediation Follow Up dismissed"))

    @action(detail=True, methods=["post"], url_path="send-now")
    def send_now(self, request, *args, **kwargs):
        instance = self.get_object()
        follow_up = dispatch_follow_up_reminder(follow_up_id=instance.id, actor_id=request.user.id, automated=False)
        output = self.get_serializer(follow_up)
        return Response(api_response(data=output.data, message="Transaction Remediation Follow Up reminder sent"))


class TransactionRemediationDigestViewSet(StandardizedModelViewSet):
    serializer_class = TransactionRemediationDigestSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Transaction Remediation Digest"
    filterset_fields = ["workspace", "generated_for", "delivery_channel", "status"]
    search_fields = ["title"]
    ordering_fields = ["created_at", "updated_at", "title"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = TransactionRemediationDigest.objects.select_related(
            "workspace",
            "generated_for",
            "generated_by",
            "dispatched_by",
            "acknowledged_by",
        )
        workspace_id = self.request.query_params.get("workspace")
        generated_for = self.request.query_params.get("generated_for")
        status_value = self.request.query_params.get("status")
        delivery_channel = self.request.query_params.get("delivery_channel")
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        if generated_for:
            queryset = queryset.filter(generated_for_id=generated_for)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if delivery_channel:
            queryset = queryset.filter(delivery_channel=delivery_channel)
        return queryset

    def get_permission_code(self, request):
        return "view_client" if request.method in {"GET", "HEAD", "OPTIONS"} else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, None
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        workspace = WorkspaceMembership.objects.filter(workspace_id=workspace_id).select_related("workspace").first() if workspace_id else None
        return (workspace.workspace if workspace else None), None

    def perform_create(self, serializer):
        return create_remediation_digest(serializer=serializer, user=self.request.user)

    @action(detail=True, methods=["post"], url_path="acknowledge")
    def acknowledge(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = TransactionRemediationDigestAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance.status = TransactionRemediationDigest.DigestStatus.ACKNOWLEDGED
        instance.acknowledged_at = timezone.now()
        instance.acknowledged_by = request.user
        instance.updated_by = request.user
        instance.save(update_fields=["status", "acknowledged_at", "acknowledged_by", "updated_by", "updated_at"])
        record_audit_log(
            actor=request.user,
            action="transaction_remediation_digest.acknowledged",
            entity=instance,
            workspace_id=instance.workspace_id,
            metadata={"generated_for": instance.generated_for_id},
        )
        output = self.get_serializer(instance)
        return Response(api_response(data=output.data, message="Transaction Remediation Digest acknowledged"))

    @action(detail=True, methods=["post"], url_path="dispatch")
    def dispatch_digest(self, request, *args, **kwargs):
        instance = self.get_object()
        enqueue_digest_dispatch(digest=instance, actor=request.user)
        instance.refresh_from_db()
        output = self.get_serializer(instance)
        return Response(api_response(data=output.data, message="Transaction Remediation Digest dispatched"))
