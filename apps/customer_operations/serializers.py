from rest_framework import serializers
from django.utils import timezone

from apps.accounts.models import WorkspaceMembership
from apps.clients.models import Client, ClientContact
from apps.compliance_periods.models import CompliancePeriod
from apps.customer_operations.models import OperationalFollowUp
from apps.filings.models import ReturnFiling
from apps.gstins.models import GSTIN
from apps.notices.models import Notice
from apps.returns.models import ReturnPreparation
from apps.workspaces.models import Workspace


class OperationalFollowUpSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    return_type = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()
    contact_mobile = serializers.CharField(source="mobile_number_snapshot", read_only=True)
    contact_email = serializers.EmailField(source="email_snapshot", read_only=True, allow_null=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = OperationalFollowUp
        fields = [
            "id",
            "workspace",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "compliance_period",
            "period_label",
            "return_preparation",
            "return_filing",
            "notice",
            "contact",
            "contact_name",
            "contact_mobile",
            "contact_email",
            "contact_name_snapshot",
            "mobile_number_snapshot",
            "email_snapshot",
            "follow_up_type",
            "reason",
            "pending_with",
            "status",
            "priority",
            "title",
            "notes",
            "next_action",
            "due_at",
            "completed_at",
            "last_contacted_at",
            "assigned_to",
            "assigned_to_name",
            "completed_by",
            "escalated_at",
            "closed_reason",
            "return_type",
            "is_overdue",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "client_name",
            "gstin_value",
            "period_label",
            "contact_name",
            "contact_mobile",
            "contact_email",
            "completed_at",
            "completed_by",
            "escalated_at",
            "return_type",
            "is_overdue",
            "created_at",
            "updated_at",
        ]

    def get_return_type(self, obj):
        if obj.return_preparation_id:
            return obj.return_preparation.return_type
        if obj.return_filing_id:
            return obj.return_filing.return_type
        if obj.compliance_period_id:
            return obj.compliance_period.return_type
        return None

    def get_assigned_to_name(self, obj):
        if obj.assigned_to is None:
            return None
        full_name = obj.assigned_to.get_full_name().strip()
        return full_name or obj.assigned_to.username

    def get_contact_name(self, obj):
        return obj.contact_name_snapshot or (obj.contact.name if obj.contact else None)

    def get_is_overdue(self, obj):
        return obj.status not in {
            OperationalFollowUp.FollowUpStatus.COMPLETED,
            OperationalFollowUp.FollowUpStatus.CANCELLED,
        } and obj.due_at <= timezone.now()

    def validate_assigned_to(self, value):
        if value is None:
            return value
        workspace = self._resolve_workspace()
        if workspace and not WorkspaceMembership.objects.filter(user=value, workspace=workspace, is_active=True).exists():
            raise serializers.ValidationError("Assignee must belong to the selected workspace.")
        return value

    def validate_contact(self, value):
        if value is None:
            return value
        client = self._resolve_client()
        if client and value.client_id != client.id:
            raise serializers.ValidationError("Selected contact must belong to the selected client.")
        return value

    def validate(self, attrs):
        workspace = attrs.get("workspace") or getattr(self.instance, "workspace", None)
        client = attrs.get("client") or getattr(self.instance, "client", None)
        gstin = attrs.get("gstin") or getattr(self.instance, "gstin", None)
        compliance_period = attrs.get("compliance_period") or getattr(self.instance, "compliance_period", None)
        return_preparation = attrs.get("return_preparation") or getattr(self.instance, "return_preparation", None)
        return_filing = attrs.get("return_filing") or getattr(self.instance, "return_filing", None)
        notice = attrs.get("notice") or getattr(self.instance, "notice", None)
        contact = attrs.get("contact") if "contact" in attrs else getattr(self.instance, "contact", None)

        if client is None:
            raise serializers.ValidationError({"client": "Client is required."})
        if workspace is None:
            raise serializers.ValidationError({"workspace": "Workspace is required."})
        if client.workspace_id != workspace.id:
            raise serializers.ValidationError({"client": "Selected client does not belong to the selected workspace."})
        if not any([gstin, compliance_period, return_preparation, return_filing, notice]):
            raise serializers.ValidationError(
                "Operational follow-up must be linked to at least one operational anchor: GSTIN, compliance period, return, filing, or notice."
            )
        if gstin and gstin.client_id != client.id:
            raise serializers.ValidationError({"gstin": "Selected GSTIN does not belong to the selected client."})
        if compliance_period and gstin and compliance_period.gstin_id != gstin.id:
            raise serializers.ValidationError({"compliance_period": "Selected period does not belong to the selected GSTIN."})
        if compliance_period and not gstin:
            gstin = compliance_period.gstin
            if gstin.client_id != client.id:
                raise serializers.ValidationError({"compliance_period": "Selected period does not belong to the selected client."})
            attrs.setdefault("gstin", gstin)
        if return_preparation:
            if compliance_period and return_preparation.compliance_period_id != compliance_period.id:
                raise serializers.ValidationError({"return_preparation": "Selected return does not belong to the selected period."})
            attrs.setdefault("compliance_period", return_preparation.compliance_period)
            attrs.setdefault("gstin", return_preparation.compliance_period.gstin)
            if return_preparation.compliance_period.gstin.client_id != client.id:
                raise serializers.ValidationError({"return_preparation": "Selected return does not belong to the selected client."})
        if return_filing:
            if return_filing.client_id != client.id:
                raise serializers.ValidationError({"return_filing": "Selected filing does not belong to the selected client."})
            attrs.setdefault("gstin", return_filing.gstin)
            attrs.setdefault("compliance_period", return_filing.compliance_period)
        if notice:
            if notice.gstin.client_id != client.id:
                raise serializers.ValidationError({"notice": "Selected notice does not belong to the selected client."})
            attrs.setdefault("gstin", notice.gstin)
        if contact:
            attrs["contact_name_snapshot"] = contact.name
            attrs["mobile_number_snapshot"] = contact.mobile_number or contact.alternate_mobile_number
            attrs["email_snapshot"] = contact.email
        return attrs

    def _resolve_workspace(self):
        workspace_id = self.initial_data.get("workspace") if hasattr(self, "initial_data") else None
        if workspace_id:
            return Workspace.objects.filter(pk=workspace_id).first()
        return getattr(self.instance, "workspace", None)

    def _resolve_client(self):
        client_id = self.initial_data.get("client") if hasattr(self, "initial_data") else None
        if client_id:
            return Client.objects.filter(pk=client_id).first()
        return getattr(self.instance, "client", None)


class OperationalFollowUpStatusSerializer(serializers.Serializer):
    closed_reason = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class ReturnStatusRegisterSerializer(serializers.ModelSerializer):
    workspace = serializers.UUIDField(source="gstin.client.workspace_id", read_only=True)
    workspace_name = serializers.CharField(source="gstin.client.workspace.name", read_only=True)
    client = serializers.UUIDField(source="gstin.client_id", read_only=True)
    client_name = serializers.CharField(source="gstin.client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True)
    preparation_status = serializers.CharField(read_only=True, allow_null=True)
    filing_status = serializers.CharField(read_only=True, allow_null=True)
    arn = serializers.CharField(source="filing_arn", read_only=True, allow_blank=True, allow_null=True)
    filed_at = serializers.DateTimeField(source="filing_filed_at", read_only=True, allow_null=True)
    owner_name = serializers.SerializerMethodField()
    blocker_reason = serializers.SerializerMethodField()
    pending_with = serializers.CharField(read_only=True, allow_blank=True)
    open_follow_up_count = serializers.IntegerField(read_only=True)
    overdue_follow_up_count = serializers.IntegerField(read_only=True)
    latest_follow_up_title = serializers.CharField(read_only=True, allow_blank=True, allow_null=True)
    status_bucket = serializers.CharField(read_only=True)
    preparation_id = serializers.UUIDField(read_only=True, allow_null=True)
    filing_id = serializers.UUIDField(read_only=True, allow_null=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = CompliancePeriod
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "period",
            "return_type",
            "status",
            "due_date",
            "preparation_id",
            "preparation_status",
            "filing_id",
            "filing_status",
            "arn",
            "filed_at",
            "owner_name",
            "blocker_reason",
            "pending_with",
            "open_follow_up_count",
            "overdue_follow_up_count",
            "latest_follow_up_title",
            "status_bucket",
            "is_overdue",
        ]
        read_only_fields = fields

    def get_owner_name(self, obj):
        latest_follow_up = next(iter(self._get_open_followups(obj)), None)
        if latest_follow_up and latest_follow_up.assigned_to:
            full_name = latest_follow_up.assigned_to.get_full_name().strip()
            return full_name or latest_follow_up.assigned_to.username

        latest_filing = self._get_latest_filing(obj)
        if latest_filing:
            for user in [latest_filing.filed_by, latest_filing.approved_by]:
                if user:
                    full_name = user.get_full_name().strip()
                    return full_name or user.username

        latest_preparation = self._get_latest_preparation(obj)
        if latest_preparation:
            for user in [latest_preparation.filed_by, latest_preparation.approved_by, latest_preparation.prepared_by]:
                if user:
                    full_name = user.get_full_name().strip()
                    return full_name or user.username
        return None

    def get_blocker_reason(self, obj):
        latest_preparation = self._get_latest_preparation(obj)
        if latest_preparation and latest_preparation.blocking_reason:
            return latest_preparation.blocking_reason

        latest_filing = self._get_latest_filing(obj)
        if latest_filing:
            error_summary = latest_filing.error_summary if isinstance(latest_filing.error_summary, dict) else {}
            message = str(error_summary.get("message") or error_summary.get("detail") or "").strip()
            if message:
                return message
            if latest_filing.status in {
                ReturnFiling.FilingStatus.FAILED,
                ReturnFiling.FilingStatus.NEEDS_RETRY,
                ReturnFiling.FilingStatus.CANCELLED,
            }:
                return f"Filing status is {latest_filing.status.replace('_', ' ')}."

        latest_follow_up = next(iter(self._get_open_followups(obj)), None)
        if latest_follow_up:
            return latest_follow_up.reason
        return ""

    def _get_latest_preparation(self, obj):
        preparations = obj.return_preparations.all() if hasattr(obj, "return_preparations") else []
        return next(iter(preparations), None)

    def _get_latest_filing(self, obj):
        filings = obj.return_filings.all() if hasattr(obj, "return_filings") else []
        return next(iter(filings), None)

    def _get_open_followups(self, obj):
        follow_ups = obj.operational_follow_ups.all() if hasattr(obj, "operational_follow_ups") else []
        return [item for item in follow_ups if item.compliance_period_id == obj.id]
