from django.conf import settings
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.cache_utils import get_cached_or_build, scoped_cache_key
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.compliance_periods.models import CompliancePeriod
from apps.returns.selectors.returns import get_return_preparation_queryset
from apps.returns.serializers import (
    ReturnApprovalSerializer,
    ReturnReadinessRequestSerializer,
    ReturnMarkFiledSerializer,
    ReturnPreparationRequestSerializer,
    ReturnPreparationSerializer,
)
from apps.returns.services.readiness import get_return_readiness
from apps.returns.services.returns import approve_return, mark_filed, prepare_return


class ReturnPreparationViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    serializer_class = ReturnPreparationSerializer
    permission_classes = [WorkspaceRBACPermission]
    success_message = "Success"
    filterset_fields = ["compliance_period", "return_type", "status"]
    ordering_fields = ["created_at", "updated_at", "filed_at"]

    def get_queryset(self):
        queryset = get_return_preparation_queryset()
        workspace_id = self.request.query_params.get("workspace")
        if workspace_id:
            queryset = queryset.filter(compliance_period__gstin__client__workspace_id=workspace_id)
        client_id = self.request.query_params.get("client")
        if client_id:
            queryset = queryset.filter(compliance_period__gstin__client_id=client_id)
        gstin_id = self.request.query_params.get("gstin")
        if gstin_id:
            queryset = queryset.filter(compliance_period__gstin_id=gstin_id)
        period_id = self.request.query_params.get("period")
        if period_id:
            queryset = queryset.filter(compliance_period_id=period_id)
        return queryset

    def get_serializer_class(self):
        if self.action == "prepare":
            return ReturnPreparationRequestSerializer
        if self.action == "mark_filed":
            return ReturnMarkFiledSerializer
        if self.action == "approve":
            return ReturnApprovalSerializer
        if self.action == "readiness":
            return ReturnReadinessRequestSerializer
        return ReturnPreparationSerializer

    def get_permission_code(self, request):
        if self.action == "approve":
            return "approve_return"
        if self.action == "mark_filed":
            return "file_return"
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "prepare_return"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            client = obj.compliance_period.gstin.client
            return client.workspace, client
        object_id = self.kwargs.get("pk")
        if object_id:
            instance = get_return_preparation_queryset().filter(pk=object_id).first()
            if instance:
                client = instance.compliance_period.gstin.client
                return client.workspace, client
        client_id = request.data.get("client") or request.query_params.get("client")
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        if client_id:
            client_queryset = Client.objects.filter(pk=client_id).select_related("workspace")
            if workspace_id:
                client_queryset = client_queryset.filter(workspace_id=workspace_id)
            client = client_queryset.first()
            return (client.workspace if client else None), client
        compliance_period_id = request.data.get("compliance_period") or request.query_params.get("period")
        compliance_period = (
            CompliancePeriod.objects.filter(pk=compliance_period_id)
            .select_related("gstin", "gstin__client", "gstin__client__workspace")
            .first()
            if compliance_period_id
            else None
        )
        client = compliance_period.gstin.client if compliance_period else None
        return (client.workspace if client else None), client

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)

    @property
    def basename_title(self):
        return "Return Preparation"

    @action(detail=False, methods=["post"], url_path="prepare")
    def prepare(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = prepare_return(
            workspace_id=serializer.validated_data["workspace"],
            client_id=serializer.validated_data["client"],
            gstin_id=serializer.validated_data["gstin"],
            compliance_period_id=serializer.validated_data["compliance_period"],
            return_type=serializer.validated_data["return_type"],
            user=request.user,
        )
        output = ReturnPreparationSerializer(instance, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Return prepared"))

    @action(detail=False, methods=["get"], url_path="readiness")
    def readiness(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        cache_key = scoped_cache_key(
            "return-readiness",
            user_id=request.user.id,
            workspace_id=serializer.validated_data["workspace"],
            client_id=serializer.validated_data["client"],
            gstin_id=serializer.validated_data["gstin"],
            compliance_period_id=serializer.validated_data["compliance_period"],
        )

        def build_payload():
            try:
                readiness = get_return_readiness(
                    workspace_id=serializer.validated_data["workspace"],
                    client_id=serializer.validated_data["client"],
                    gstin_id=serializer.validated_data["gstin"],
                    compliance_period_id=serializer.validated_data["compliance_period"],
                )
            except ValueError as exc:
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"compliance_period": str(exc)}) from exc
            return api_response(data=readiness, message="Return readiness evaluated")

        payload = get_cached_or_build(
            cache_key,
            settings.CACHE_RETURN_READINESS_SECONDS,
            build_payload,
        )
        return Response(payload)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = approve_return(instance=self.get_object(), user=request.user)
        output = ReturnPreparationSerializer(instance, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Return approved"))

    @action(detail=True, methods=["post"], url_path="mark-filed")
    def mark_filed(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = mark_filed(instance=self.get_object(), user=request.user, arn=serializer.validated_data.get("arn", ""))
        output = ReturnPreparationSerializer(instance, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message="Return marked filed"))
