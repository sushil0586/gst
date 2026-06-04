from django.contrib.auth import authenticate, get_user_model
from rest_framework import exceptions, serializers
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.accounts.selectors.access import get_user_memberships
from apps.accounts.constants import ROLE_PERMISSION_MAP
from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.accounts.services.team import register_new_workspace_owner
from apps.common.security_events import log_security_event
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


class OrganizationAccessSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "code"]


class WorkspaceAccessSerializer(serializers.ModelSerializer):
    organization_id = serializers.UUIDField(source="organization.id", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Workspace
        fields = ["id", "name", "code", "timezone", "organization_id", "organization_name"]


class WorkspaceMembershipSerializer(serializers.ModelSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    organization_id = serializers.UUIDField(source="workspace.organization.id", read_only=True)
    organization_name = serializers.CharField(source="workspace.organization.name", read_only=True)
    permissions = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = WorkspaceMembership
        fields = [
            "workspace_id",
            "workspace_name",
            "organization_id",
            "organization_name",
            "role",
            "permissions",
            "is_active",
        ]

    def get_permissions(self, obj):
        return sorted(ROLE_PERMISSION_MAP.get(obj.role, set()))


class CurrentUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    user = serializers.SerializerMethodField()
    organizations = serializers.SerializerMethodField()
    workspaces = serializers.SerializerMethodField()
    default_workspace = serializers.SerializerMethodField()
    permissions_summary = serializers.SerializerMethodField()
    is_platform_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "full_name",
            "user",
            "organizations",
            "workspaces",
            "default_workspace",
            "permissions_summary",
            "is_platform_admin",
        ]

    def get_full_name(self, obj):
        full_name = obj.get_full_name().strip()
        return full_name or obj.username

    def get_user(self, obj):
        return {
            "id": obj.id,
            "username": obj.username,
            "email": obj.email,
            "first_name": obj.first_name,
            "last_name": obj.last_name,
            "full_name": self.get_full_name(obj),
        }

    def get_permissions(self, obj):
        if getattr(obj, "is_superuser", False):
            permissions = set()
            for values in ROLE_PERMISSION_MAP.values():
                permissions.update(values)
            return sorted(permissions)
        memberships = get_user_memberships(obj)
        permissions = set()
        for membership in memberships:
            permissions.update(ROLE_PERMISSION_MAP.get(membership.role, set()))
        return sorted(permissions)

    def get_organizations(self, obj):
        if getattr(obj, "is_superuser", False):
            return OrganizationAccessSerializer(
                Organization.objects.filter(is_active=True).order_by("name"),
                many=True,
            ).data
        organization_map = {}
        for membership in get_user_memberships(obj):
            organization = membership.workspace.organization
            organization_map[str(organization.id)] = organization
        return OrganizationAccessSerializer(organization_map.values(), many=True).data

    def get_workspaces(self, obj):
        if getattr(obj, "is_superuser", False):
            serialized_workspaces = WorkspaceAccessSerializer(
                Workspace.objects.filter(is_active=True).select_related("organization").order_by("organization__name", "name"),
                many=True,
            ).data
            permissions = self.get_permissions(obj)
            for workspace_payload in serialized_workspaces:
                workspace_payload["role"] = "platform_admin"
                workspace_payload["permissions"] = permissions
            return serialized_workspaces
        memberships = get_user_memberships(obj)
        workspaces = [membership.workspace for membership in memberships]
        serialized_workspaces = WorkspaceAccessSerializer(workspaces, many=True).data
        memberships_by_workspace_id = {str(membership.workspace_id): membership for membership in memberships}
        for workspace_payload in serialized_workspaces:
            membership = memberships_by_workspace_id.get(str(workspace_payload["id"]))
            workspace_payload["role"] = membership.role if membership else ("platform_admin" if getattr(obj, "is_superuser", False) else None)
            workspace_payload["permissions"] = sorted(ROLE_PERMISSION_MAP.get(membership.role, set())) if membership else self.get_permissions(obj)
        return serialized_workspaces

    def get_default_workspace(self, obj):
        if getattr(obj, "is_superuser", False):
            first_workspace = Workspace.objects.filter(is_active=True).select_related("organization").order_by("name").first()
            if first_workspace is None:
                return None
            payload = WorkspaceAccessSerializer(first_workspace).data
            payload["role"] = "platform_admin"
            payload["permissions"] = self.get_permissions(obj)
            return payload
        membership = get_user_memberships(obj).first()
        if membership is None:
            return None
        payload = WorkspaceAccessSerializer(membership.workspace).data
        payload["role"] = membership.role
        payload["permissions"] = sorted(ROLE_PERMISSION_MAP.get(membership.role, set()))
        return payload

    def get_permissions_summary(self, obj):
        permissions = self.get_permissions(obj)
        memberships = WorkspaceMembershipSerializer(get_user_memberships(obj), many=True).data
        return {
            "codes": permissions,
            "total": len(permissions),
            "memberships": memberships,
        }

    def get_is_platform_admin(self, obj):
        return bool(getattr(obj, "is_superuser", False))


class SelfRegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, allow_blank=True)
    organization_name = serializers.CharField(max_length=255)
    workspace_name = serializers.CharField(max_length=255)
    timezone = serializers.CharField(max_length=64, required=False, default="Asia/Kolkata")

    def create(self, validated_data):
        return register_new_workspace_owner(**validated_data)


class SelfRegistrationResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = serializers.DictField()

    @classmethod
    def from_user(cls, user):
        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": CurrentUserSerializer(user).data,
        }


class WorkspaceMemberDetailSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    full_name = serializers.SerializerMethodField()
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceMembership
        fields = [
            "id",
            "workspace_id",
            "workspace_name",
            "user_id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "permissions",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_full_name(self, obj):
        full_name = obj.user.get_full_name().strip()
        return full_name or obj.user.username

    def get_permissions(self, obj):
        return sorted(ROLE_PERMISSION_MAP.get(obj.role, set()))


class WorkspaceMemberCreateSerializer(serializers.Serializer):
    workspace = serializers.PrimaryKeyRelatedField(queryset=Workspace.objects.filter(is_active=True))
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, allow_blank=True)
    role = serializers.ChoiceField(choices=WorkspaceRole.choices)
    password = serializers.CharField(min_length=8, write_only=True)


class WorkspaceMemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=WorkspaceRole.choices, required=False)


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = User.USERNAME_FIELD
    username = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    identifier = serializers.CharField(required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.username_field in self.fields:
            self.fields[self.username_field].required = False

    def validate(self, attrs):
        identifier = attrs.get("identifier") or attrs.get("email") or attrs.get("username")
        password = attrs.get("password")
        request = self.context.get("request")
        client_ip = request.META.get("REMOTE_ADDR") if request else ""

        if not identifier or not password:
            log_security_event(
                event="auth.login_failed",
                details={"reason": "missing_credentials", "identifier": str(identifier or ""), "ip": client_ip},
            )
            raise exceptions.AuthenticationFailed("Identifier and password are required.")

        user = (
            User.objects.filter(email__iexact=identifier).first()
            or User.objects.filter(username__iexact=identifier).first()
        )
        if user is None:
            log_security_event(
                event="auth.login_failed",
                details={"reason": "unknown_account", "identifier": str(identifier), "ip": client_ip},
            )
            raise exceptions.AuthenticationFailed("No active account found with the given credentials.")

        self.user = authenticate(
            request=request,
            username=getattr(user, User.USERNAME_FIELD),
            password=password,
        )
        if self.user is None:
            log_security_event(
                event="auth.login_failed",
                details={"reason": "invalid_password", "identifier": str(identifier), "ip": client_ip},
            )
            raise exceptions.AuthenticationFailed("No active account found with the given credentials.")

        log_security_event(
            event="auth.login_succeeded",
            severity="info",
            details={"user_id": self.user.id, "identifier": str(identifier), "ip": client_ip},
        )

        refresh = self.get_token(self.user)
        data = {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": CurrentUserSerializer(self.user).data,
        }
        return data
