from django.conf import settings
from rest_framework import serializers

from apps.common.security import sanitize_json
from apps.clients.models import Client
from apps.compliance_periods.models import CompliancePeriod
from apps.gstins.models import GSTIN
from apps.imports.models import ImportBatch, ImportRowError, ImportTemplate
from apps.imports.services.correction_policy import evaluate_import_correction_policy
from apps.workspaces.models import Workspace


def infer_import_type_from_filename(file_name):
    normalized = (file_name or "").lower()
    if "gstr" in normalized and "2b" in normalized:
        return ImportBatch.ImportType.GSTR_2B
    if "credit" in normalized and "note" in normalized:
        return ImportBatch.ImportType.CREDIT_NOTE
    if "debit" in normalized and "note" in normalized:
        return ImportBatch.ImportType.DEBIT_NOTE
    if "sales" in normalized:
        return ImportBatch.ImportType.SALES
    if "purchase" in normalized:
        return ImportBatch.ImportType.PURCHASE
    return None


class ImportTemplateSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = ImportTemplate
        fields = [
            "id",
            "name",
            "workspace",
            "workspace_name",
            "import_type",
            "source_type",
            "column_mapping",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace_name", "created_at", "updated_at"]

    def validate_column_mapping(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Column mapping must be a JSON object.")
        for canonical_field, source_column in value.items():
            if not isinstance(canonical_field, str) or not isinstance(source_column, str):
                raise serializers.ValidationError("Column mapping keys and values must be strings.")
        return value


class ImportRowErrorSerializer(serializers.ModelSerializer):
    raw_row = serializers.SerializerMethodField()

    class Meta:
        model = ImportRowError
        fields = ["id", "row_number", "field_name", "severity", "error_code", "error_message", "raw_row"]
        read_only_fields = ["id"]

    def get_raw_row(self, obj):
        return sanitize_json(obj.raw_row or {}, max_items=8)


class ImportBatchSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    client_name = serializers.CharField(source="client.legal_name", read_only=True)
    gstin_value = serializers.CharField(source="gstin.gstin", read_only=True, allow_null=True)
    import_template_name = serializers.CharField(source="import_template.name", read_only=True, allow_null=True)
    compliance_period_label = serializers.CharField(source="compliance_period.period", read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()
    transaction_count = serializers.SerializerMethodField()
    correction_summary = serializers.SerializerMethodField()
    superseded_by = serializers.UUIDField(source="superseded_by_id", read_only=True, allow_null=True)
    supersedes_batch = serializers.UUIDField(source="supersedes_batch_id", read_only=True, allow_null=True)

    class Meta:
        model = ImportBatch
        fields = [
            "id",
            "workspace",
            "workspace_name",
            "client",
            "client_name",
            "gstin",
            "gstin_value",
            "import_template",
            "import_template_name",
            "compliance_period",
            "compliance_period_label",
            "import_type",
            "source_type",
            "file",
            "file_name",
            "status",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "processed_rows",
            "error_summary",
            "processed_at",
            "uploaded_by_name",
            "transaction_count",
            "correction_summary",
            "superseded_by",
            "supersedes_batch",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_name",
            "client_name",
            "gstin_value",
            "import_template_name",
            "compliance_period_label",
            "file_name",
            "status",
            "total_rows",
            "valid_rows",
            "invalid_rows",
            "processed_rows",
            "error_summary",
            "processed_at",
            "uploaded_by_name",
            "transaction_count",
            "correction_summary",
            "superseded_by",
            "supersedes_batch",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        workspace = attrs["workspace"]
        client = attrs["client"]
        gstin = attrs.get("gstin")
        import_template = attrs.get("import_template")
        compliance_period = attrs["compliance_period"]
        upload = attrs["file"]
        source_type = attrs["source_type"]
        import_type = attrs["import_type"]

        if client.workspace_id != workspace.id:
            raise serializers.ValidationError({"client": "Client does not belong to the selected workspace."})
        if gstin and gstin.client_id != client.id:
            raise serializers.ValidationError({"gstin": "GSTIN does not belong to the selected client."})
        if compliance_period.gstin.client_id != client.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected client."})
        if gstin and compliance_period.gstin_id != gstin.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected GSTIN."})
        if import_template:
            if import_template.workspace_id != workspace.id:
                raise serializers.ValidationError({"import_template": "Template does not belong to the selected workspace."})
            if import_template.import_type != import_type or import_template.source_type != source_type:
                raise serializers.ValidationError({"import_template": "Template type and source must match the upload."})

        file_name = upload.name.lower()
        upload_size = getattr(upload, "size", 0) or 0
        upload_content_type = str(getattr(upload, "content_type", "") or "").lower()
        max_upload_bytes = getattr(settings, "MAX_IMPORT_UPLOAD_BYTES", 10 * 1024 * 1024)

        if upload_size <= 0:
            raise serializers.ValidationError({"file": "Uploaded file is empty."})
        if upload_size > max_upload_bytes:
            raise serializers.ValidationError(
                {"file": f"Upload exceeds the {max_upload_bytes // (1024 * 1024)} MB security limit."}
            )
        if source_type == ImportBatch.SourceType.CSV and not file_name.endswith(".csv"):
            raise serializers.ValidationError({"file": "CSV imports require a .csv file."})
        if source_type == ImportBatch.SourceType.EXCEL and not file_name.endswith(".xlsx"):
            raise serializers.ValidationError({"file": "Excel imports require a .xlsx file."})
        if source_type == ImportBatch.SourceType.CSV and upload_content_type not in {
            "",
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
            "text/plain",
        }:
            raise serializers.ValidationError({"file": "CSV upload content type is not allowed."})
        if source_type == ImportBatch.SourceType.EXCEL and upload_content_type not in {
            "",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream",
            "application/zip",
        }:
            raise serializers.ValidationError({"file": "Excel upload content type is not allowed."})
        if source_type == ImportBatch.SourceType.PROVIDER:
            raise serializers.ValidationError({"source_type": "Provider imports must be created through the provider fetch workflow."})
        inferred_import_type = infer_import_type_from_filename(file_name)
        if inferred_import_type and inferred_import_type != import_type:
            readable_import_type = inferred_import_type.replace("_", " ")
            selected_import_type = import_type.replace("_", " ")
            raise serializers.ValidationError(
                {
                    "import_type": (
                        f"This file name looks like {readable_import_type} data, "
                        f"but the selected import type is {selected_import_type}."
                    )
                }
            )
        return attrs

    def create(self, validated_data):
        upload = validated_data["file"]
        validated_data["file_name"] = upload.name
        return super().create(validated_data)

    def get_uploaded_by_name(self, obj):
        if obj.created_by is None:
            return None
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.username

    def get_transaction_count(self, obj):
        return getattr(obj, "transaction_count", None) or obj.transactions.count()

    def get_correction_summary(self, obj):
        view = self.context.get("view")
        if view is not None and getattr(view, "action", None) == "list":
            return None
        policy = evaluate_import_correction_policy(batch=obj, user=self.context.get("request").user if self.context.get("request") else None)
        return {
            "lifecycle_state": policy.lifecycle_state,
            "has_downstream_dependencies": policy.has_downstream_dependencies,
            "requires_reconciliation_rerun": policy.requires_reconciliation_rerun,
            "requires_return_refresh": policy.requires_return_refresh,
            "is_locked_by_filing": policy.is_locked_by_filing,
            "warning_message": policy.warning_message,
            "next_required_action": policy.next_required_action,
        }


class ImportCorrectionPolicySerializer(serializers.Serializer):
    lifecycle_state = serializers.CharField()
    can_edit_rows = serializers.BooleanField()
    can_discard_rows = serializers.BooleanField()
    can_discard_batch = serializers.BooleanField()
    can_replace_file = serializers.BooleanField()
    can_reprocess = serializers.BooleanField()
    has_downstream_dependencies = serializers.BooleanField()
    requires_reconciliation_rerun = serializers.BooleanField()
    requires_return_refresh = serializers.BooleanField()
    is_locked_by_filing = serializers.BooleanField()
    requires_elevated_role = serializers.BooleanField()
    warning_message = serializers.CharField(allow_blank=True)
    next_required_action = serializers.CharField(allow_blank=True)
    affected_reconciliation_runs = serializers.IntegerField()
    affected_return_preparations = serializers.IntegerField()
    affected_filings = serializers.IntegerField()
    invalidation_reason = serializers.CharField(allow_blank=True)


class ImportImpactActionSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    allowed = serializers.BooleanField()
    reason = serializers.CharField()


class ImportImpactSummarySerializer(serializers.Serializer):
    summary_title = serializers.CharField()
    summary_message = serializers.CharField()
    severity = serializers.CharField()
    next_required_action = serializers.CharField(allow_blank=True)
    invalidation_reason = serializers.CharField(allow_blank=True)
    lifecycle_state = serializers.CharField()
    actions = ImportImpactActionSerializer(many=True)
    affected_reconciliation_runs = serializers.IntegerField()
    affected_return_preparations = serializers.IntegerField()
    affected_filings = serializers.IntegerField()


class ImportRowCorrectionSerializer(serializers.Serializer):
    row_number = serializers.IntegerField(min_value=2)
    raw_row = serializers.DictField(child=serializers.CharField(allow_blank=True), allow_empty=False)

    def validate_raw_row(self, value):
        if not isinstance(value, dict) or not value:
            raise serializers.ValidationError("Provide the corrected raw row values.")
        return {str(key): "" if row_value is None else str(row_value) for key, row_value in value.items()}


class ImportRowDiscardSerializer(serializers.Serializer):
    row_number = serializers.IntegerField(min_value=2)


class ImportBatchDiscardSerializer(serializers.Serializer):
    confirm = serializers.BooleanField(default=True)

    def validate_confirm(self, value):
        if value is not True:
            raise serializers.ValidationError("Batch discard must be explicitly confirmed.")
        return value


class ImportBatchReprocessSerializer(serializers.Serializer):
    confirm = serializers.BooleanField(default=True)

    def validate_confirm(self, value):
        if value is not True:
            raise serializers.ValidationError("Batch reprocess must be explicitly confirmed.")
        return value


class ImportBatchReplacementSerializer(serializers.Serializer):
    file = serializers.FileField()
    import_template = serializers.PrimaryKeyRelatedField(
        queryset=ImportTemplate.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        batch = self.context["batch"]
        file = attrs["file"]
        import_template = attrs.get("import_template") or batch.import_template
        file_name = file.name.lower()
        upload_size = getattr(file, "size", 0) or 0
        upload_content_type = str(getattr(file, "content_type", "") or "").lower()
        max_upload_bytes = getattr(settings, "MAX_IMPORT_UPLOAD_BYTES", 10 * 1024 * 1024)

        if upload_size <= 0:
            raise serializers.ValidationError({"file": "Uploaded file is empty."})
        if upload_size > max_upload_bytes:
            raise serializers.ValidationError(
                {"file": f"Upload exceeds the {max_upload_bytes // (1024 * 1024)} MB security limit."}
            )

        source_type = batch.source_type
        if source_type == ImportBatch.SourceType.PROVIDER:
            raise serializers.ValidationError(
                {"file": "Provider-fetched batches cannot be replaced directly. Upload a new file as a fresh import instead."}
            )
        if source_type == ImportBatch.SourceType.CSV and not file_name.endswith(".csv"):
            raise serializers.ValidationError({"file": "CSV replacements require a .csv file."})
        if source_type == ImportBatch.SourceType.EXCEL and not file_name.endswith(".xlsx"):
            raise serializers.ValidationError({"file": "Excel replacements require a .xlsx file."})
        if source_type == ImportBatch.SourceType.CSV and upload_content_type not in {
            "",
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
            "text/plain",
        }:
            raise serializers.ValidationError({"file": "CSV upload content type is not allowed."})
        if source_type == ImportBatch.SourceType.EXCEL and upload_content_type not in {
            "",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/octet-stream",
            "application/zip",
        }:
            raise serializers.ValidationError({"file": "Excel upload content type is not allowed."})
        inferred_import_type = infer_import_type_from_filename(file_name)
        if inferred_import_type and inferred_import_type != batch.import_type:
            readable_import_type = inferred_import_type.replace("_", " ")
            selected_import_type = batch.import_type.replace("_", " ")
            raise serializers.ValidationError(
                {
                    "file": (
                        f"This file name looks like {readable_import_type} data, "
                        f"but the batch being replaced is {selected_import_type}."
                    )
                }
            )
        if import_template:
            if import_template.workspace_id != batch.workspace_id:
                raise serializers.ValidationError({"import_template": "Template does not belong to the selected workspace."})
            if import_template.import_type != batch.import_type or import_template.source_type != batch.source_type:
                raise serializers.ValidationError({"import_template": "Template type and source must match the batch being replaced."})

        attrs["workspace"] = batch.workspace
        attrs["client"] = batch.client
        attrs["gstin"] = batch.gstin
        attrs["compliance_period"] = batch.compliance_period
        attrs["import_type"] = batch.import_type
        attrs["source_type"] = batch.source_type
        attrs["file_name"] = file.name
        attrs["resolved_import_template"] = import_template
        return attrs


class FetchGSTR2BImportSerializer(serializers.Serializer):
    workspace = serializers.UUIDField()
    client = serializers.UUIDField()
    gstin = serializers.UUIDField()
    compliance_period = serializers.UUIDField()
    provider = serializers.ChoiceField(choices=["whitebooks"], default="whitebooks", required=False)

    def validate(self, attrs):
        workspace = Workspace.objects.filter(pk=attrs["workspace"]).first()
        client = Client.objects.filter(pk=attrs["client"]).select_related("workspace").first()
        gstin = GSTIN.objects.filter(pk=attrs["gstin"]).select_related("client", "client__workspace").first()
        compliance_period = (
            CompliancePeriod.objects.filter(pk=attrs["compliance_period"])
            .select_related("gstin", "gstin__client", "gstin__client__workspace")
            .first()
        )
        if workspace is None:
            raise serializers.ValidationError({"workspace": "Workspace not found."})
        if client is None:
            raise serializers.ValidationError({"client": "Client not found."})
        if gstin is None:
            raise serializers.ValidationError({"gstin": "GSTIN not found."})
        if compliance_period is None:
            raise serializers.ValidationError({"compliance_period": "Compliance period not found."})
        if client.workspace_id != workspace.id:
            raise serializers.ValidationError({"client": "Client does not belong to the selected workspace."})
        if gstin.client_id != client.id:
            raise serializers.ValidationError({"gstin": "GSTIN does not belong to the selected client."})
        if compliance_period.gstin_id != gstin.id:
            raise serializers.ValidationError({"compliance_period": "Compliance period does not belong to the selected GSTIN."})
        attrs["workspace_instance"] = workspace
        attrs["client_instance"] = client
        attrs["gstin_instance"] = gstin
        attrs["compliance_period_instance"] = compliance_period
        return attrs
