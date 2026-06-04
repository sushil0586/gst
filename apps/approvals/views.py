from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet

from apps.approvals.selectors.approvals import get_approval_request_queryset
from apps.approvals.serializers import ApprovalActionSerializer, ApprovalRequestSerializer
from apps.approvals.services.approvals import (
    approve_approval_request,
    cancel_approval_request,
    create_approval_request,
    reject_approval_request,
)
from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.compliance_periods.models import CompliancePeriod
from apps.workspaces.models import Workspace


class ApprovalRequestViewSet(ListModelMixin, RetrieveModelMixin, CreateModelMixin, GenericViewSet):
    serializer_class = ApprovalRequestSerializer
    permission_classes = [WorkspaceRBACPermission]
    success_message = "Success"
    filterset_fields = ["status", "entity_type", "workspace", "client", "gstin", "compliance_period", "requested_to"]
    ordering_fields = ["created_at", "resolved_at"]

    def get_queryset(self):
        queryset = get_approval_request_queryset()
        period_id = self.request.query_params.get("period")
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        return queryset

    def get_serializer_class(self):
        if getattr(self, "action", None) in {"approve", "reject", "cancel"}:
            return ApprovalActionSerializer
        return ApprovalRequestSerializer

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "approve_return"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, obj.client
        approval_id = self.kwargs.get("pk")
        if approval_id:
            approval = get_approval_request_queryset().filter(pk=approval_id).first()
            if approval:
                return approval.workspace, approval.client
        client_id = request.data.get("client") or request.query_params.get("client")
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        if client_id:
            client_queryset = Client.objects.filter(pk=client_id).select_related("workspace")
            if workspace_id:
                client_queryset = client_queryset.filter(workspace_id=workspace_id)
            client = client_queryset.first()
            return (client.workspace if client else None), client
        compliance_period_id = request.data.get("compliance_period") or request.query_params.get("compliance_period") or request.query_params.get("period")
        compliance_period = (
            CompliancePeriod.objects.filter(pk=compliance_period_id)
            .select_related("gstin", "gstin__client", "gstin__client__workspace")
            .first()
            if compliance_period_id
            else None
        )
        client = compliance_period.gstin.client if compliance_period else None
        if client:
            return client.workspace, client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        workspace = Workspace.objects.filter(pk=workspace_id).first() if workspace_id else None
        return workspace, None

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)

    @property
    def basename_title(self):
        return "Approval Request"

    def create(self, request, *args, **kwargs):
        return StandardizedModelViewSet.create(self, request, *args, **kwargs)

    def perform_create(self, serializer):
        return create_approval_request(serializer=serializer, user=self.request.user)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = approve_approval_request(instance=self.get_object(), user=request.user, comments=serializer.validated_data.get("comments", ""))
        output = ApprovalRequestSerializer(instance, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Approval request approved"))

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = reject_approval_request(instance=self.get_object(), user=request.user, comments=serializer.validated_data.get("comments", ""))
        output = ApprovalRequestSerializer(instance, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Approval request rejected"))

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = cancel_approval_request(instance=self.get_object(), user=request.user, comments=serializer.validated_data.get("comments", ""))
        output = ApprovalRequestSerializer(instance, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Approval request cancelled"))
