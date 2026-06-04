from rest_framework.permissions import IsAuthenticated

from apps.common.viewsets import StandardizedModelViewSet
from apps.organizations.selectors.organizations import get_organization_queryset
from apps.organizations.serializers import OrganizationSerializer
from apps.organizations.services.organizations import (
    create_organization,
    deactivate_organization,
    update_organization,
)


class OrganizationViewSet(StandardizedModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    resource_name = "Organization"
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]

    def get_queryset(self):
        queryset = get_organization_queryset(self.request.user)
        if queryset.exists():
            return queryset
        return get_organization_queryset(None) if self.request.method == "POST" else queryset

    def perform_create(self, serializer):
        return create_organization(serializer=serializer, user=self.request.user)

    def perform_update(self, serializer):
        return update_organization(serializer=serializer, user=self.request.user)

    def perform_destroy(self, instance):
        deactivate_organization(instance=instance, user=self.request.user)
