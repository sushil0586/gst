from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from rest_framework.viewsets import GenericViewSet
from rest_framework.mixins import ListModelMixin

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.customer_operations.models import OperationalFollowUp
from apps.customer_operations.selectors.follow_ups import get_operational_follow_up_queryset
from apps.customer_operations.selectors.return_status import get_return_status_register_queryset
from apps.customer_operations.serializers import OperationalFollowUpSerializer, OperationalFollowUpStatusSerializer, ReturnStatusRegisterSerializer
from apps.customer_operations.services.follow_ups import (
    complete_operational_follow_up,
    create_operational_follow_up,
    escalate_operational_follow_up,
    log_operational_follow_up_contact,
    update_operational_follow_up,
)
from apps.gstins.models import GSTIN
from apps.workspaces.models import Workspace


class OperationalFollowUpViewSet(StandardizedModelViewSet):
    serializer_class = OperationalFollowUpSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Operational Follow Up"
    filterset_fields = ["status", "pending_with", "priority", "assigned_to", "client", "gstin", "compliance_period"]
    search_fields = ["title", "reason", "notes", "client__legal_name", "gstin__gstin", "contact_name_snapshot"]
    ordering_fields = ["due_at", "created_at", "priority", "status"]

    def get_queryset(self):
        queryset = get_operational_follow_up_queryset()
        params = self.request.query_params
        workspace_id = params.get("workspace")
        client_id = params.get("client")
        gstin_id = params.get("gstin")
        period_id = params.get("compliance_period")
        pending_with = params.get("pending_with")
        assigned_to = params.get("assigned_to")
        priority = params.get("priority")
        return_type = params.get("return_type")
        overdue_only = params.get("overdue_only")

        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        if pending_with:
            queryset = queryset.filter(pending_with=pending_with)
        if assigned_to == "unassigned":
            queryset = queryset.filter(assigned_to__isnull=True)
        elif assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)
        if priority:
            queryset = queryset.filter(priority=priority)
        if return_type:
            queryset = queryset.filter(compliance_period__return_type=return_type)
        if overdue_only == "true":
            queryset = queryset.exclude(
                status__in=[OperationalFollowUp.FollowUpStatus.COMPLETED, OperationalFollowUp.FollowUpStatus.CANCELLED]
            ).filter(due_at__lt=timezone.now())
        return queryset

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        client_id = request.data.get("client") or request.query_params.get("client")
        gstin_id = request.data.get("gstin") or request.query_params.get("gstin")
        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client
        if gstin_id:
            gstin = GSTIN.objects.filter(pk=gstin_id).select_related("client", "client__workspace").first()
            return (gstin.client.workspace if gstin else None), (gstin.client if gstin else None)
        if workspace_id:
            workspace = Workspace.objects.filter(pk=workspace_id).first()
            return workspace, None
        return None, None

    def perform_create(self, serializer):
        return create_operational_follow_up(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_operational_follow_up(serializer=serializer, user=self.request.user)

    @action(detail=True, methods=["post"], url_path="mark-completed")
    def mark_completed(self, request, pk=None):
        instance = self.get_object()
        serializer = OperationalFollowUpStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        follow_up = complete_operational_follow_up(instance=instance, user=request.user, closed_reason=serializer.validated_data.get("closed_reason", ""))
        output = self.get_serializer(follow_up)
        return Response(api_response(data=output.data, message="Operational Follow Up completed"))

    @action(detail=True, methods=["post"], url_path="mark-escalated")
    def mark_escalated(self, request, pk=None):
        instance = self.get_object()
        serializer = OperationalFollowUpStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        follow_up = escalate_operational_follow_up(instance=instance, user=request.user, notes=serializer.validated_data.get("notes", ""))
        output = self.get_serializer(follow_up)
        return Response(api_response(data=output.data, message="Operational Follow Up escalated"))

    @action(detail=True, methods=["post"], url_path="log-contact")
    def log_contact(self, request, pk=None):
        instance = self.get_object()
        serializer = OperationalFollowUpStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        follow_up = log_operational_follow_up_contact(instance=instance, user=request.user, notes=serializer.validated_data.get("notes", ""))
        output = self.get_serializer(follow_up)
        return Response(api_response(data=output.data, message="Operational Follow Up contact logged"))


class ReturnStatusRegisterViewSet(ListModelMixin, GenericViewSet):
    serializer_class = ReturnStatusRegisterSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Return Status Register"
    ordering_fields = ["due_date", "period", "return_type", "status_bucket", "client_name"]

    def get_queryset(self):
        queryset = get_return_status_register_queryset()
        params = self.request.query_params
        workspace_id = params.get("workspace")
        client_id = params.get("client")
        gstin_id = params.get("gstin")
        compliance_period_id = params.get("compliance_period")
        return_type = params.get("return_type")
        pending_with = params.get("pending_with")
        status_bucket = params.get("status_bucket")
        overdue_only = params.get("overdue_only")

        if workspace_id:
            queryset = queryset.filter(gstin__client__workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(gstin__client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if compliance_period_id:
            queryset = queryset.filter(pk=compliance_period_id)
        if return_type:
            queryset = queryset.filter(return_type=return_type)
        if pending_with:
            queryset = queryset.filter(pending_with=pending_with)
        if status_bucket:
            queryset = queryset.filter(status_bucket=status_bucket)
        if overdue_only == "true":
            queryset = queryset.filter(is_overdue=True).exclude(status_bucket="filed")
        return queryset

    def get_permission_code(self, request):
        return "view_client"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            client = obj.gstin.client
            return client.workspace, client
        workspace_id = request.query_params.get("workspace")
        client_id = request.query_params.get("client")
        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client
        if workspace_id:
            workspace = Workspace.objects.filter(pk=workspace_id).first()
            return workspace, None
        return None, None

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)
