from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts.models import WorkspaceMembership
from apps.accounts.serializers import (
    ChangePasswordSerializer,
    CurrentUserSerializer,
    EmailOrUsernameTokenObtainPairSerializer,
    ForgotPasswordRequestSerializer,
    ResetPasswordConfirmSerializer,
    SelfRegistrationResponseSerializer,
    SelfRegistrationSerializer,
    WorkspaceMemberCreateSerializer,
    WorkspaceMemberDetailSerializer,
    WorkspaceMemberUpdateSerializer,
)
from apps.accounts.services.team import (
    create_or_assign_workspace_member,
    deactivate_workspace_member,
    update_workspace_member,
)
from apps.clients.models import Client
from apps.common.api import api_response
from apps.common.permissions import WorkspaceRBACPermission
from apps.common.security_events import log_security_event
from apps.common.throttling import CurrentUserRateThrottle, LoginRateThrottle, RegistrationRateThrottle
from apps.common.viewsets import StandardizedModelViewSet
from apps.workspaces.models import Workspace

User = get_user_model()


class EmailOrUsernameTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [CurrentUserRateThrottle]

    def get(self, request, *args, **kwargs):
        serializer = CurrentUserSerializer(request.user)
        return Response(api_response(data=serializer.data))


class SelfRegistrationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = SelfRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_security_event(
            event="auth.registration_succeeded",
            severity="info",
            details={"user_id": user.id, "email": user.email, "ip": request.META.get("REMOTE_ADDR", "")},
        )
        payload = SelfRegistrationResponseSerializer.from_user(user)
        return Response(api_response(data=payload, message="Account created"), status=201)


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = ForgotPasswordRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        normalized_email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=normalized_email, is_active=True).first()

        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{settings.APP_FRONTEND_URL.rstrip('/')}/reset-password?uid={uid}&token={token}"
            send_mail(
                subject="Reset your GST Compliance password",
                message=(
                    "We received a request to reset your GST Compliance password.\n\n"
                    f"Reset your password: {reset_url}\n\n"
                    "If you did not request this, you can ignore this email."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
            log_security_event(
                event="auth.password_reset_requested",
                severity="info",
                details={"user_id": user.id, "email": user.email, "ip": request.META.get("REMOTE_ADDR", "")},
            )

        return Response(api_response(data=None, message="If an account exists for this email, a reset link has been sent."))


class ResetPasswordConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = ResetPasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])
        log_security_event(
            event="auth.password_reset_completed",
            severity="info",
            details={"user_id": user.id, "email": user.email, "ip": request.META.get("REMOTE_ADDR", "")},
        )
        return Response(api_response(data=None, message="Password reset successful."))


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        log_security_event(
            event="auth.password_changed",
            severity="info",
            details={"user_id": user.id, "email": user.email, "ip": request.META.get("REMOTE_ADDR", "")},
        )
        return Response(api_response(data=None, message="Password changed successfully."))


class WorkspaceMemberViewSet(StandardizedModelViewSet):
    permission_classes = [IsAuthenticated, WorkspaceRBACPermission]
    resource_name = "Workspace Member"
    filterset_fields = ["workspace", "role", "user", "is_active"]
    search_fields = ["user__username", "user__first_name", "user__last_name", "user__email"]
    ordering_fields = ["user__first_name", "user__username", "role", "created_at", "updated_at"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return WorkspaceMemberCreateSerializer
        if self.action in {"update", "partial_update"}:
            return WorkspaceMemberUpdateSerializer
        return WorkspaceMemberDetailSerializer

    def get_queryset(self):
        queryset = WorkspaceMembership.objects.select_related("workspace", "workspace__organization", "user").order_by("workspace__name", "user__username")
        workspace_id = self.request.query_params.get("workspace")
        if not getattr(self.request.user, "is_superuser", False):
            memberships = WorkspaceMembership.objects.filter(user=self.request.user, is_active=True).values_list("workspace_id", flat=True)
            queryset = queryset.filter(workspace_id__in=memberships)
        if workspace_id:
            queryset = queryset.filter(workspace_id=workspace_id)
        return queryset

    def get_permission_code(self, request):
        return "view_client" if request.method in {"GET", "HEAD", "OPTIONS"} else "manage_users"

    def get_workspace_and_client(self, request, obj=None):
        if obj is not None:
            return obj.workspace, None
        workspace_id = request.data.get("workspace") or request.query_params.get("workspace")
        if workspace_id:
            workspace = Workspace.objects.filter(pk=workspace_id).select_related("organization").first()
            return workspace, None
        client_id = request.data.get("client") or request.query_params.get("client")
        if client_id:
            client = Client.objects.filter(pk=client_id).select_related("workspace").first()
            return (client.workspace if client else None), client
        return None, None

    def perform_create(self, serializer):
        return create_or_assign_workspace_member(
            actor=self.request.user,
            workspace=serializer.validated_data["workspace"],
            email=serializer.validated_data["email"],
            first_name=serializer.validated_data["first_name"],
            last_name=serializer.validated_data.get("last_name", ""),
            role=serializer.validated_data["role"],
            password=serializer.validated_data.get("password"),
        )

    def perform_update(self, serializer):
        membership = self.get_object()
        role = serializer.validated_data.get("role", membership.role)
        return update_workspace_member(
            actor=self.request.user,
            membership=membership,
            role=role,
            first_name=serializer.validated_data.get("first_name"),
            last_name=serializer.validated_data.get("last_name"),
            password=serializer.validated_data.get("password"),
        )

    def perform_destroy(self, instance):
        deactivate_workspace_member(actor=self.request.user, membership=instance)

    def create(self, request, *args, **kwargs):
        input_serializer = WorkspaceMemberCreateSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        instance = self.perform_create(input_serializer)
        output = WorkspaceMemberDetailSerializer(instance, context=self.get_serializer_context())
        return Response(
            api_response(data=output.data, message=f"{self.basename_title} created"),
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        input_serializer = WorkspaceMemberUpdateSerializer(instance, data=request.data, partial=partial)
        input_serializer.is_valid(raise_exception=True)
        updated_instance = self.perform_update(input_serializer)
        output = WorkspaceMemberDetailSerializer(updated_instance, context=self.get_serializer_context())
        return Response(api_response(data=output.data, message=f"{self.basename_title} updated"))
