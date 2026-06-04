from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin
from rest_framework.viewsets import GenericViewSet

from apps.common.permissions import WorkspaceRBACPermission
from apps.common.viewsets import StandardizedModelViewSet
from apps.gstins.models import GSTIN
from apps.notices.selectors.notices import get_notice_queryset
from apps.notices.serializers import NoticeSerializer
from apps.notices.services.notices import create_notice


class NoticeViewSet(ListModelMixin, RetrieveModelMixin, CreateModelMixin, GenericViewSet):
    serializer_class = NoticeSerializer
    permission_classes = [WorkspaceRBACPermission]
    queryset = get_notice_queryset()
    success_message = "Success"

    def get_permission_code(self, request):
        return "view_client" if request.method in ("GET", "HEAD", "OPTIONS") else "manage_gstin"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.gstin.client.workspace, obj.gstin.client
        gstin_id = request.data.get("gstin") or request.query_params.get("gstin")
        gstin = GSTIN.objects.filter(pk=gstin_id).select_related("client", "client__workspace").first() if gstin_id else None
        return (gstin.client.workspace if gstin else None), (gstin.client if gstin else None)

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
