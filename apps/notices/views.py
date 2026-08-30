from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin, UpdateModelMixin
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.customer_operations.serializers import OperationalFollowUpSerializer
from apps.gstins.models import GSTIN
from apps.notices.models import Notice, NoticeSyncEvent
from apps.notices.selectors.notices import get_notice_queryset
from apps.integrations.whitebooks.exceptions import (
    WhiteBooksAuthenticationError,
    WhiteBooksSubmissionError,
    WhiteBooksTemporaryError,
)
from apps.notices.serializers import (
    NoticeSerializer,
    NoticeSyncEventSerializer,
    WhiteBooksNoticeDetailFetchSerializer,
    WhiteBooksNoticeSyncSerializer,
)
from apps.workspaces.models import Workspace
from apps.notices.services.notices import (
    create_notice,
    ensure_notice_follow_up,
    fetch_whitebooks_notice_detail,
    sync_whitebooks_notices,
    update_notice,
)


class NoticeViewSet(ListModelMixin, RetrieveModelMixin, CreateModelMixin, UpdateModelMixin, GenericViewSet):
    serializer_class = NoticeSerializer
    permission_classes = [WorkspaceRBACPermission]
    queryset = get_notice_queryset()
    filterset_fields = ["status", "is_active", "assigned_to"]
    search_fields = ["reference_number", "title", "description", "gstin__gstin", "gstin__client__legal_name"]
    ordering_fields = ["created_at", "updated_at", "reference_number", "status", "due_date"]
    success_message = "Success"

    def get_serializer_class(self):
        if self.action == "sync_whitebooks":
            return WhiteBooksNoticeSyncSerializer
        if self.action == "fetch_whitebooks_detail":
            return WhiteBooksNoticeDetailFetchSerializer
        return NoticeSerializer

    def get_queryset(self):
        queryset = get_notice_queryset()
        workspace_id = self.request.query_params.get("workspace")
        client_id = self.request.query_params.get("client")
        gstin_id = self.request.query_params.get("gstin")
        assigned_to = self.request.query_params.get("assigned_to")

        if workspace_id:
            queryset = queryset.filter(gstin__client__workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(gstin__client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if assigned_to == "unassigned":
            queryset = queryset.filter(assigned_to__isnull=True)
        elif assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)

        return queryset

    def get_sync_history_queryset(self):
        queryset = NoticeSyncEvent.objects.select_related(
            "gstin",
            "gstin__client",
            "gstin__client__workspace",
            "notice",
            "initiated_by",
        )
        workspace_id = self.request.query_params.get("workspace")
        client_id = self.request.query_params.get("client")
        gstin_id = self.request.query_params.get("gstin")
        notice_id = self.request.query_params.get("notice")
        event_type = self.request.query_params.get("event_type")
        status = self.request.query_params.get("status")

        if workspace_id:
            queryset = queryset.filter(gstin__client__workspace_id=workspace_id)
        if client_id:
            queryset = queryset.filter(gstin__client_id=client_id)
        if gstin_id:
            queryset = queryset.filter(gstin_id=gstin_id)
        if notice_id:
            queryset = queryset.filter(notice_id=notice_id)
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        if status:
            queryset = queryset.filter(status=status)

        return queryset

    def get_permission_code(self, request):
        if self.action == "ensure_follow_up":
            return "manage_client"
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_gstin"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.gstin.client.workspace, obj.gstin.client
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        client_id = request.data.get("client") or request.query_params.get("client")
        gstin_id = request.data.get("gstin") or request.query_params.get("gstin")
        notice_id = request.query_params.get("notice")

        if notice_id:
            notice = Notice.objects.filter(pk=notice_id).select_related("gstin__client__workspace").first()
            return (notice.gstin.client.workspace if notice else None), (notice.gstin.client if notice else None)

        if gstin_id:
            gstin = GSTIN.objects.filter(pk=gstin_id).select_related("client", "client__workspace").first()
            return (gstin.client.workspace if gstin else None), (gstin.client if gstin else None)

        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client

        if workspace_id:
            workspace = Workspace.objects.filter(pk=workspace_id).first()
            return workspace, None

        return None, None

    def list(self, request, *args, **kwargs):
        return StandardizedModelViewSet.list(self, request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        return StandardizedModelViewSet.retrieve(self, request, *args, **kwargs)

    @property
    def basename_title(self):
        return "Notice"

    def create(self, request, *args, **kwargs):
        return StandardizedModelViewSet.create(self, request, *args, **kwargs)

    def perform_create(self, serializer):
        return create_notice(serializer=serializer, user=self.request.user)

    def partial_update(self, request, *args, **kwargs):
        return StandardizedModelViewSet.update(self, request, *args, partial=True, **kwargs)

    def perform_update(self, serializer):
        return update_notice(serializer=serializer, user=self.request.user)

    @action(detail=False, methods=["post"], url_path="sync-whitebooks")
    def sync_whitebooks(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = sync_whitebooks_notices(validated_data=serializer.validated_data, actor=request.user)
        except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            raise ValidationError({"provider": str(exc)}) from exc
        return Response(api_response(data=payload, message="WhiteBooks notices synced"))

    @action(detail=False, methods=["get"], url_path="sync-history")
    def sync_history(self, request, *args, **kwargs):
        queryset = self.get_sync_history_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = NoticeSyncEventSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = NoticeSyncEventSerializer(queryset, many=True)
        return Response(api_response(data=serializer.data, message="Notice sync history"))

    @action(detail=True, methods=["post"], url_path="fetch-whitebooks-detail")
    def fetch_whitebooks_detail(self, request, *args, **kwargs):
        notice = self.get_object()
        serializer = WhiteBooksNoticeDetailFetchSerializer(data=request.data, context={"notice": notice})
        serializer.is_valid(raise_exception=True)
        try:
            updated_notice = fetch_whitebooks_notice_detail(
                notice=notice,
                validated_data=serializer.validated_data,
                actor=request.user,
            )
        except (WhiteBooksAuthenticationError, WhiteBooksSubmissionError, WhiteBooksTemporaryError) as exc:
            raise ValidationError({"provider": str(exc)}) from exc
        return Response(
            api_response(
                data=NoticeSerializer(updated_notice).data,
                message="WhiteBooks notice detail fetched",
            )
        )

    @action(detail=True, methods=["post"], url_path="ensure-follow-up")
    def ensure_follow_up(self, request, *args, **kwargs):
        notice = self.get_object()
        follow_up, created = ensure_notice_follow_up(notice=notice, actor=request.user)
        return Response(
            api_response(
                data={
                    "created": created,
                    "follow_up": OperationalFollowUpSerializer(follow_up).data,
                },
                message="Notice follow-up created" if created else "Notice follow-up reused",
            )
        )
