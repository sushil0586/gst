import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.crypto import get_random_string
from rest_framework import serializers

from apps.accounts.models import WorkspaceMembership, WorkspaceRole
from apps.audit_logs.services.audit import record_audit_log
from apps.organizations.models import Organization
from apps.workspaces.models import Workspace

User = get_user_model()


def _slugify_code(value: str, *, fallback_prefix: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9]+", "-", value.upper()).strip("-")
    if not cleaned:
        cleaned = fallback_prefix
    return cleaned[:40]


def _unique_username_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0].strip().lower()
    base = re.sub(r"[^a-z0-9._-]+", "", local_part) or "user"
    candidate = base[:150]
    counter = 1
    while User.objects.filter(username__iexact=candidate).exists():
        suffix = f"{counter}"
        candidate = f"{base[: max(1, 150 - len(suffix) - 1)]}_{suffix}"
        counter += 1
    return candidate


def _unique_organization_code(name: str) -> str:
    base = _slugify_code(name, fallback_prefix="ORG")
    candidate = base
    counter = 1
    while Organization.objects.filter(code__iexact=candidate).exists():
        suffix = f"-{counter}"
        candidate = f"{base[: max(1, 50 - len(suffix))]}{suffix}"
        counter += 1
    return candidate


def _unique_workspace_code(organization: Organization, name: str) -> str:
    base = _slugify_code(name, fallback_prefix="WS")
    candidate = base
    counter = 1
    while Workspace.objects.filter(organization=organization, code__iexact=candidate).exists():
        suffix = f"-{counter}"
        candidate = f"{base[: max(1, 50 - len(suffix))]}{suffix}"
        counter += 1
    return candidate


@transaction.atomic
def register_new_workspace_owner(*, email: str, password: str, first_name: str, last_name: str, organization_name: str, workspace_name: str, timezone: str = "Asia/Kolkata"):
    if User.objects.filter(email__iexact=email).exists():
        raise serializers.ValidationError({"email": "An account with this email already exists."})

    user = User.objects.create_user(
        username=_unique_username_from_email(email),
        email=email.lower(),
        password=password,
        first_name=first_name.strip(),
        last_name=last_name.strip(),
    )
    organization = Organization.objects.create(
        name=organization_name.strip(),
        code=_unique_organization_code(organization_name),
        created_by=user,
        updated_by=user,
    )
    workspace = Workspace.objects.create(
        organization=organization,
        name=workspace_name.strip(),
        code=_unique_workspace_code(organization, workspace_name),
        timezone=timezone,
        created_by=user,
        updated_by=user,
    )
    membership = WorkspaceMembership.objects.create(
        user=user,
        workspace=workspace,
        role=WorkspaceRole.OWNER,
        created_by=user,
        updated_by=user,
    )
    record_audit_log(
        actor=user,
        action="auth.self_registered",
        entity=workspace,
        workspace_id=workspace.id,
        metadata={
            "organization_name": organization.name,
            "workspace_name": workspace.name,
            "membership_role": membership.role,
        },
    )
    return user


@transaction.atomic
def create_or_assign_workspace_member(*, actor, workspace: Workspace, email: str, first_name: str, last_name: str, role: str, password: str | None = None):
    normalized_email = email.strip().lower()
    user = User.objects.filter(email__iexact=normalized_email).first()
    created_user = False

    if user is None:
        user = User.objects.create_user(
            username=_unique_username_from_email(normalized_email),
            email=normalized_email,
            password=password or get_random_string(14),
            first_name=first_name.strip(),
            last_name=last_name.strip(),
        )
        created_user = True
    else:
        update_fields = []
        if first_name.strip():
            user.first_name = first_name.strip()
            update_fields.append("first_name")
        if last_name.strip():
            user.last_name = last_name.strip()
            update_fields.append("last_name")
        if password:
            user.set_password(password)
            update_fields.append("password")
        if update_fields:
            user.save(update_fields=update_fields)

    membership = WorkspaceMembership.objects.filter(user=user, workspace=workspace).first()
    if membership and membership.is_active:
        raise serializers.ValidationError({"email": "This user already has active access to the selected workspace."})

    if membership is None:
        membership = WorkspaceMembership.objects.create(
            user=user,
            workspace=workspace,
            role=role,
            created_by=actor,
            updated_by=actor,
        )
    else:
        membership.role = role
        membership.is_active = True
        membership.updated_by = actor
        membership.save(update_fields=["role", "is_active", "updated_by", "updated_at"])

    record_audit_log(
        actor=actor,
        action="workspace_member.created",
        entity=membership,
        workspace_id=workspace.id,
        metadata={
            "user_email": user.email,
            "role": membership.role,
            "created_user": created_user,
        },
    )
    return membership


@transaction.atomic
def update_workspace_member(*, actor, membership: WorkspaceMembership, role: str):
    membership.role = role
    membership.updated_by = actor
    membership.save(update_fields=["role", "updated_by", "updated_at"])
    record_audit_log(
        actor=actor,
        action="workspace_member.updated",
        entity=membership,
        workspace_id=membership.workspace_id,
        metadata={"user_email": membership.user.email, "role": membership.role},
    )
    return membership


@transaction.atomic
def deactivate_workspace_member(*, actor, membership: WorkspaceMembership):
    membership.is_active = False
    membership.updated_by = actor
    membership.save(update_fields=["is_active", "updated_by", "updated_at"])
    record_audit_log(
        actor=actor,
        action="workspace_member.deactivated",
        entity=membership,
        workspace_id=membership.workspace_id,
        metadata={"user_email": membership.user.email, "role": membership.role},
    )
    return membership
