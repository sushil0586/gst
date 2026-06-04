from decimal import Decimal, InvalidOperation

from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.services.compliance_periods import ensure_period_modifiable

ALLOWED_SUPPLY_CATEGORIES = {"taxable", "nil_rated", "exempt", "non_gst"}
METADATA_SUMMARY_FIELDS = (
    "hsn_code",
    "description",
    "uqc",
    "quantity",
    "is_service",
    "supply_category",
    "ecommerce_gstin",
)
LINE_ITEM_FIELDS = (
    "hsn_code",
    "description",
    "uqc",
    "quantity",
    "is_service",
    "supply_category",
    "ecommerce_gstin",
    "taxable_value",
    "cgst_amount",
    "sgst_amount",
    "igst_amount",
    "cess_amount",
    "total_amount",
)
EDITABLE_TRANSACTION_FIELDS = {"place_of_supply", "reverse_charge", "status"}
EDITABLE_BULK_METADATA_FIELDS = {
    "hsn_code",
    "description",
    "uqc",
    "quantity",
    "is_service",
    "supply_category",
    "ecommerce_gstin",
}


def update_gst_transaction(*, serializer, user):
    instance = serializer.instance
    ensure_period_modifiable(instance.compliance_period, actor=user, attempted_action="gst_transaction.update")

    before_state = _snapshot(instance)
    validated_data = serializer.validated_data.copy()
    metadata_payload = validated_data.pop("metadata", None)
    if metadata_payload is not None:
        validated_data["metadata"] = normalize_transaction_metadata(
            existing_metadata=instance.metadata or {},
            update_payload=metadata_payload,
        )

    updated_instance = serializer.save(updated_by=user, **validated_data)
    record_audit_log(
        actor=user,
        action="gst_transaction.corrected",
        entity=updated_instance,
        workspace_id=updated_instance.workspace_id,
        client_id=updated_instance.client_id,
        gstin_id=updated_instance.gstin_id,
        compliance_period_id=updated_instance.compliance_period_id,
        before_state=before_state,
        after_state=_snapshot(updated_instance),
    )
    return updated_instance


def bulk_update_gst_transactions(*, transactions, payload, user):
    updated_transactions = []
    for instance in transactions:
        ensure_period_modifiable(instance.compliance_period, actor=user, attempted_action="gst_transaction.bulk_update")
        before_state = _snapshot(instance)

        update_fields = {"updated_by": user}
        for field_name in EDITABLE_TRANSACTION_FIELDS:
            if field_name in payload:
                update_fields[field_name] = payload[field_name]

        metadata_updates = payload.get("metadata_updates") or {}
        if metadata_updates:
            update_fields["metadata"] = apply_bulk_metadata_updates(
                existing_metadata=instance.metadata or {},
                metadata_updates=metadata_updates,
            )

        for field_name, value in update_fields.items():
            setattr(instance, field_name, value)
        instance.updated_by = user
        instance.save()
        record_audit_log(
            actor=user,
            action="gst_transaction.bulk_corrected",
            entity=instance,
            workspace_id=instance.workspace_id,
            client_id=instance.client_id,
            gstin_id=instance.gstin_id,
            compliance_period_id=instance.compliance_period_id,
            metadata={"bulk": True},
            before_state=before_state,
            after_state=_snapshot(instance),
        )
        updated_transactions.append(instance)
    return updated_transactions


def normalize_transaction_metadata(*, existing_metadata, update_payload):
    metadata = {
        "raw_columns": existing_metadata.get("raw_columns", {}),
        "source_rows": existing_metadata.get("source_rows", []),
    }
    if existing_metadata.get("quantity_raw"):
        metadata["quantity_raw"] = existing_metadata["quantity_raw"]

    line_items_payload = update_payload.get("line_items")
    if line_items_payload is None:
        line_items_payload = existing_metadata.get("line_items") or []

    line_items = [_normalize_line_item(item) for item in line_items_payload]
    metadata["line_items"] = line_items
    metadata["aggregated_line_count"] = len(line_items)

    mixed_fields = []
    if line_items:
        for field_name in METADATA_SUMMARY_FIELDS:
            values = []
            for item in line_items:
                value = item.get(field_name)
                if value in (None, "", False):
                    continue
                values.append(value)
            unique_values = []
            for value in values:
                if value not in unique_values:
                    unique_values.append(value)
            if len(unique_values) == 1:
                metadata[field_name] = unique_values[0]
            elif len(unique_values) > 1:
                mixed_fields.append(field_name)

    for field_name in METADATA_SUMMARY_FIELDS:
        if field_name in update_payload and field_name not in metadata:
            metadata[field_name] = _normalize_scalar_metadata(field_name, update_payload[field_name])

    if mixed_fields:
        metadata["mixed_fields"] = mixed_fields

    return metadata


def apply_bulk_metadata_updates(*, existing_metadata, metadata_updates):
    line_items = existing_metadata.get("line_items") or []
    if not line_items:
        line_items = [
            {
                field_name: existing_metadata.get(field_name)
                for field_name in LINE_ITEM_FIELDS
            }
        ]
    updated_line_items = []
    for line_item in line_items:
        updated_line_item = dict(line_item)
        for field_name, value in metadata_updates.items():
            if field_name in EDITABLE_BULK_METADATA_FIELDS and value is not None:
                updated_line_item[field_name] = value
        updated_line_items.append(updated_line_item)
    return normalize_transaction_metadata(
        existing_metadata=existing_metadata,
        update_payload={"line_items": updated_line_items},
    )


def _normalize_line_item(item):
    normalized = {}
    raw_item = item or {}
    for field_name in LINE_ITEM_FIELDS:
        value = raw_item.get(field_name)
        if field_name in {"quantity", "taxable_value", "cgst_amount", "sgst_amount", "igst_amount", "cess_amount", "total_amount"}:
            normalized[field_name] = _normalize_decimal_string(value)
        elif field_name == "is_service":
            normalized[field_name] = bool(value)
        elif field_name == "supply_category":
            normalized[field_name] = _normalize_supply_category(value)
        elif field_name == "uqc":
            normalized[field_name] = _normalize_string(value).upper()
        elif field_name == "ecommerce_gstin":
            normalized[field_name] = _normalize_string(value).upper()
        else:
            normalized[field_name] = _normalize_string(value)
    return normalized


def _normalize_scalar_metadata(field_name, value):
    if field_name == "quantity":
        return _normalize_decimal_string(value)
    if field_name == "is_service":
        return bool(value)
    if field_name == "supply_category":
        return _normalize_supply_category(value)
    if field_name == "uqc":
        return _normalize_string(value).upper()
    if field_name == "ecommerce_gstin":
        return _normalize_string(value).upper()
    return _normalize_string(value)


def validate_metadata_payload(metadata):
    for item in metadata.get("line_items", []):
        quantity = item.get("quantity")
        if quantity not in (None, ""):
            _require_decimal(quantity, "quantity")
        for amount_field in ("taxable_value", "cgst_amount", "sgst_amount", "igst_amount", "cess_amount", "total_amount"):
            amount_value = item.get(amount_field)
            if amount_value not in (None, ""):
                _require_decimal(amount_value, amount_field)
        supply_category = item.get("supply_category")
        if supply_category and supply_category not in ALLOWED_SUPPLY_CATEGORIES:
            raise serializers.ValidationError(
                {"metadata": { "line_items": f"Supply category must be one of {', '.join(sorted(ALLOWED_SUPPLY_CATEGORIES))}."}}
            )
    return metadata


def validate_bulk_update_payload(payload):
    metadata_updates = payload.get("metadata_updates") or {}
    invalid_metadata_fields = set(metadata_updates.keys()) - EDITABLE_BULK_METADATA_FIELDS
    if invalid_metadata_fields:
        raise serializers.ValidationError(
            {"metadata_updates": f"Unsupported metadata fields: {', '.join(sorted(invalid_metadata_fields))}."}
        )
    for field_name, value in metadata_updates.items():
        if field_name in {"quantity"} and value not in (None, ""):
            _require_decimal(value, field_name)
        if field_name == "supply_category" and value not in (None, ""):
            normalized = _normalize_supply_category(value)
            if normalized not in ALLOWED_SUPPLY_CATEGORIES:
                raise serializers.ValidationError(
                    {"metadata_updates": f"Supply category must be one of {', '.join(sorted(ALLOWED_SUPPLY_CATEGORIES))}."}
                )
            metadata_updates[field_name] = normalized
        elif field_name == "uqc":
            metadata_updates[field_name] = _normalize_string(value).upper()
        elif field_name == "ecommerce_gstin":
            metadata_updates[field_name] = _normalize_string(value).upper()
        elif field_name == "is_service":
            metadata_updates[field_name] = bool(value)
        else:
            metadata_updates[field_name] = _normalize_string(value)

    if "status" in payload and payload["status"] not in {"imported", "review", "locked"}:
        raise serializers.ValidationError({"status": "Unsupported transaction status."})
    return payload


def _require_decimal(value, field_name):
    try:
        Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise serializers.ValidationError({"metadata": {field_name: f"{field_name.replace('_', ' ').title()} must be numeric."}}) from exc


def _normalize_decimal_string(value):
    if value in (None, ""):
        return None
    decimal_value = Decimal(str(value).replace(",", "").strip())
    normalized = decimal_value.quantize(Decimal("0.01"))
    return format(normalized, "f")


def _normalize_string(value):
    if value is None:
        return ""
    return str(value).strip()


def _normalize_supply_category(value):
    normalized = _normalize_string(value).lower().replace(" ", "_")
    aliases = {
        "nil": "nil_rated",
        "nil_rated_supply": "nil_rated",
        "nongst": "non_gst",
        "non_gst_supply": "non_gst",
        "exempted": "exempt",
    }
    return aliases.get(normalized, normalized)


def _snapshot(instance):
    return {
        "counterparty_name": instance.counterparty_name,
        "counterparty_gstin": instance.counterparty_gstin,
        "place_of_supply": instance.place_of_supply,
        "document_type": instance.document_type,
        "reverse_charge": instance.reverse_charge,
        "status": instance.status,
        "metadata": instance.metadata,
    }
