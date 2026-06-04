from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.common.services.dashboard import build_workspace_summary
from apps.compliance_periods.selectors.compliance_periods import get_compliance_period_queryset
from apps.compliance_periods.serializers import CompliancePeriodSerializer
from apps.compliance_periods.services.compliance_periods import (
    create_compliance_period,
    deactivate_compliance_period,
    lock_period,
    unlock_period,
    update_compliance_period,
)
from apps.gstins.models import GSTIN


class CompliancePeriodViewSet(StandardizedModelViewSet):
    serializer_class = CompliancePeriodSerializer
    permission_classes = [WorkspaceRBACPermission]
    resource_name = "Compliance Period"
    filterset_fields = ["gstin", "status", "return_type", "is_active"]
    search_fields = ["period", "return_type"]
    ordering_fields = ["period", "created_at"]

    def get_queryset(self):
        queryset = get_compliance_period_queryset()
        client_id = self.request.query_params.get("client")
        if client_id:
            queryset = queryset.filter(gstin__client_id=client_id)
        return queryset

    def get_permission_code(self, request):
        if getattr(self, "action", None) == "unlock":
            return "manage_settings"
        if getattr(self, "action", None) == "lock":
            return "prepare_return"
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "prepare_return"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.gstin.client.workspace, obj.gstin.client
        period_id = self.kwargs.get("pk")
        if period_id:
            period = get_compliance_period_queryset().filter(pk=period_id).first()
            if period is not None:
                return period.gstin.client.workspace, period.gstin.client
        gstin_id = request.data.get("gstin") or request.query_params.get("gstin")
        gstin = GSTIN.objects.filter(pk=gstin_id).select_related("client", "client__workspace").first() if gstin_id else None
        return (gstin.client.workspace if gstin else None), (gstin.client if gstin else None)

    def perform_create(self, serializer):
        return create_compliance_period(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_compliance_period(serializer=serializer, user=self.request.user)

    def perform_destroy(self, instance):
        deactivate_compliance_period(instance=instance, user=self.request.user)

    @action(detail=True, methods=["post"], url_path="lock")
    def lock(self, request, pk=None):
        instance = lock_period(instance=self.get_object(), user=request.user)
        serializer = self.get_serializer(instance)
        return Response(api_response(data=serializer.data, message="Compliance period locked"))

    @action(detail=True, methods=["post"], url_path="unlock")
    def unlock(self, request, pk=None):
        instance = unlock_period(instance=self.get_object(), user=request.user)
        serializer = self.get_serializer(instance)
        return Response(api_response(data=serializer.data, message="Compliance period unlocked"))

    @action(detail=True, methods=["get"], url_path="workspace-summary")
    def workspace_summary(self, request, pk=None):
        summary = build_workspace_summary(compliance_period=self.get_object())
        return Response(api_response(data=summary))
