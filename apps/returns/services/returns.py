from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.audit_logs.services.audit import record_audit_log
from apps.compliance_periods.services.compliance_periods import ensure_period_modifiable
from apps.compliance_periods.models import CompliancePeriod
from apps.gst_transactions.models import GSTTransaction
from apps.reconciliation.models import ReconciliationItem, ReconciliationRun
from apps.returns.models import ReturnPreparation


def _build_period_exception_summary(*, transactions):
    exception_rows = []
    for transaction in transactions:
        metadata = transaction.metadata if isinstance(transaction.metadata, dict) else {}
        period_exception = metadata.get("period_exception")
        if not isinstance(period_exception, dict) or period_exception.get("allowed") is not True:
            continue
        exception_rows.append(
            {
                "transaction_id": str(transaction.id),
                "transaction_type": transaction.transaction_type,
                "document_type": transaction.document_type,
                "document_number": transaction.reference_number,
                "document_date": transaction.transaction_date.isoformat() if transaction.transaction_date else "",
                "reason": str(period_exception.get("reason") or ""),
                "category": str(period_exception.get("category") or "general"),
                "selected_period": str(period_exception.get("selected_period") or ""),
            }
        )
    return {
        "count": len(exception_rows),
        "documents": exception_rows,
    }


def prepare_return(*, workspace_id, client_id, gstin_id, compliance_period_id, return_type, user):
    compliance_period = (
        CompliancePeriod.objects.select_related("gstin", "gstin__client", "gstin__client__workspace")
        .get(pk=compliance_period_id)
    )
    if compliance_period.gstin.client.workspace_id != workspace_id:
        raise serializers.ValidationError({"workspace": "Compliance period does not belong to the selected workspace."})
    if compliance_period.gstin.client_id != client_id:
        raise serializers.ValidationError({"client": "Compliance period does not belong to the selected client."})
    if compliance_period.gstin_id != gstin_id:
        raise serializers.ValidationError({"gstin": "Compliance period does not belong to the selected GSTIN."})
    ensure_period_modifiable(compliance_period, actor=user, attempted_action="return.prepare")

    with transaction.atomic():
        instance, _ = ReturnPreparation.objects.select_for_update().get_or_create(
            compliance_period=compliance_period,
            return_type=return_type,
            defaults={
                "created_by": user,
                "updated_by": user,
                "prepared_by": user,
                "status": ReturnPreparation.PreparationStatus.DRAFT,
            },
        )

        if instance.status == ReturnPreparation.PreparationStatus.FILED:
            raise serializers.ValidationError("Filed returns cannot be prepared again.")

        instance.status = ReturnPreparation.PreparationStatus.VALIDATING
        instance.updated_by = user
        instance.prepared_by = user
        instance.save(update_fields=["status", "updated_by", "prepared_by", "updated_at"])

        try:
            if return_type == ReturnPreparation.ReturnType.GSTR1:
                summary = prepare_gstr1(compliance_period=compliance_period)
            elif return_type == ReturnPreparation.ReturnType.GSTR3B:
                summary = prepare_gstr3b(compliance_period=compliance_period)
            else:
                raise serializers.ValidationError({"return_type": "Unsupported return type."})

            instance.summary_snapshot = summary
            instance.status = ReturnPreparation.PreparationStatus.READY_FOR_REVIEW
            instance.approved_by = None
            instance.filed_by = None
            instance.filed_at = None
            instance.arn = ""
            instance.save(
                update_fields=[
                    "summary_snapshot",
                    "status",
                    "approved_by",
                    "filed_by",
                    "filed_at",
                    "arn",
                    "updated_by",
                    "updated_at",
                ]
            )
            record_audit_log(
                actor=user,
                action="return_preparation.prepared",
                entity=instance,
                workspace_id=workspace_id,
                client_id=client_id,
                metadata={"return_type": return_type, "status": instance.status},
            )
            return instance
        except Exception as exc:
            instance.status = ReturnPreparation.PreparationStatus.FAILED
            instance.summary_snapshot = {"error": str(exc)}
            instance.save(update_fields=["status", "summary_snapshot", "updated_by", "updated_at"])
            record_audit_log(
                actor=user,
                action="return_preparation.failed",
                entity=instance,
                workspace_id=workspace_id,
                client_id=client_id,
                metadata={"return_type": return_type, "error": str(exc)},
            )
            raise


def prepare_gstr1(*, compliance_period):
    transactions = GSTTransaction.objects.filter(
        is_active=True,
        compliance_period=compliance_period,
        transaction_type__in=["sales", "credit_note", "debit_note"],
    )

    b2b = transactions.filter(transaction_type="sales").exclude(counterparty_gstin="")
    b2c = transactions.filter(transaction_type="sales", counterparty_gstin="")
    credit_notes = transactions.filter(transaction_type="credit_note")
    debit_notes = transactions.filter(transaction_type="debit_note")

    total_taxable = _sum_decimal(transactions, "taxable_value")
    total_tax = _sum_decimal(transactions, "tax_amount")

    return {
        "return_type": ReturnPreparation.ReturnType.GSTR1,
        "outward_supplies": {
            "b2b_taxable_value": str(_sum_decimal(b2b, "taxable_value")),
            "b2b_tax_amount": str(_sum_decimal(b2b, "tax_amount")),
            "b2c_taxable_value": str(_sum_decimal(b2c, "taxable_value")),
            "b2c_tax_amount": str(_sum_decimal(b2c, "tax_amount")),
            "credit_note_taxable_value": str(_sum_decimal(credit_notes, "taxable_value")),
            "credit_note_tax_amount": str(_sum_decimal(credit_notes, "tax_amount")),
            "debit_note_taxable_value": str(_sum_decimal(debit_notes, "taxable_value")),
            "debit_note_tax_amount": str(_sum_decimal(debit_notes, "tax_amount")),
            "total_taxable_value": str(total_taxable),
            "total_tax_amount": str(total_tax),
            "document_count": transactions.count(),
        },
        "period_exceptions": _build_period_exception_summary(transactions=transactions),
    }


def prepare_gstr3b(*, compliance_period):
    outward_transactions = GSTTransaction.objects.filter(
        is_active=True,
        compliance_period=compliance_period,
        transaction_type__in=["sales", "debit_note", "credit_note"],
    )
    latest_run = (
        ReconciliationRun.objects.filter(
            is_active=True,
            compliance_period=compliance_period,
            run_type=ReconciliationRun.RunType.GSTR_2B_PURCHASE,
            status=ReconciliationRun.RunStatus.COMPLETED,
        )
        .order_by("-processed_at", "-created_at")
        .first()
    )

    items = latest_run.items.all() if latest_run else ReconciliationItem.objects.none()
    eligible_itc = Decimal("0.00")
    itc_at_risk = Decimal("0.00")
    deferred_blocked_itc = Decimal("0.00")
    unresolved_mismatch_count = 0

    for item in items:
        portal_tax = item.portal_transaction.tax_amount if item.portal_transaction else Decimal("0.00")
        if item.match_status == ReconciliationItem.MatchStatus.MATCHED or item.action_status == ReconciliationItem.ActionStatus.RESOLVED:
            eligible_itc += portal_tax
            continue
        if item.action_status in {
            ReconciliationItem.ActionStatus.DEFERRED,
            ReconciliationItem.ActionStatus.IGNORED,
        }:
            deferred_blocked_itc += portal_tax
            continue
        if item.match_status != ReconciliationItem.MatchStatus.MATCHED:
            unresolved_mismatch_count += 1
            itc_at_risk += portal_tax

    outward_taxable_value = _sum_decimal(outward_transactions, "taxable_value")
    outward_tax_liability = _sum_decimal(outward_transactions, "tax_amount")
    net_tax_payable = outward_tax_liability - eligible_itc
    if net_tax_payable < Decimal("0.00"):
        net_tax_payable = Decimal("0.00")

    return {
        "return_type": ReturnPreparation.ReturnType.GSTR3B,
        "outward_supplies": {
            "outward_taxable_value": str(outward_taxable_value),
            "outward_tax_liability": str(outward_tax_liability),
        },
        "itc_summary": {
            "eligible_itc": str(eligible_itc),
            "itc_at_risk": str(itc_at_risk),
            "deferred_blocked_itc": str(deferred_blocked_itc),
            "net_tax_payable": str(net_tax_payable),
            "unresolved_mismatch_count": unresolved_mismatch_count,
        },
        "reconciliation": {
            "latest_run_id": str(latest_run.id) if latest_run else None,
            "matched_count": latest_run.matched_count if latest_run else 0,
            "partial_match_count": latest_run.partial_match_count if latest_run else 0,
            "missing_in_books_count": latest_run.missing_in_books_count if latest_run else 0,
            "missing_in_portal_count": latest_run.missing_in_portal_count if latest_run else 0,
            "duplicate_count": latest_run.duplicate_count if latest_run else 0,
        },
        "period_exceptions": _build_period_exception_summary(
            transactions=GSTTransaction.objects.filter(
                is_active=True,
                compliance_period=compliance_period,
                transaction_type__in=["sales", "debit_note", "credit_note", "purchase", "gstr_2b"],
            )
        ),
    }


def approve_return(*, instance, user):
    if instance.status != ReturnPreparation.PreparationStatus.READY_FOR_REVIEW:
        raise serializers.ValidationError("Only returns ready for review can be approved.")
    if settings.FILING_ENFORCE_MAKER_CHECKER and instance.prepared_by_id and instance.prepared_by_id == user.id:
        raise serializers.ValidationError(
            "Maker-checker policy blocks the same user from preparing and approving this return."
        )
    instance.status = ReturnPreparation.PreparationStatus.APPROVED
    instance.approved_by = user
    instance.updated_by = user
    instance.save(update_fields=["status", "approved_by", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="return_preparation.approved",
        entity=instance,
        workspace_id=instance.compliance_period.gstin.client.workspace_id,
        client_id=instance.compliance_period.gstin.client_id,
        metadata={"return_type": instance.return_type},
    )
    return instance


def mark_filed(*, instance, user, arn=""):
    if instance.status != ReturnPreparation.PreparationStatus.APPROVED:
        raise serializers.ValidationError("Only approved returns can be marked filed.")
    instance.status = ReturnPreparation.PreparationStatus.FILED
    instance.filed_by = user
    instance.filed_at = timezone.now()
    instance.arn = arn or instance.arn
    instance.updated_by = user
    instance.save(update_fields=["status", "filed_by", "filed_at", "arn", "updated_by", "updated_at"])
    record_audit_log(
        actor=user,
        action="return_preparation.filed",
        entity=instance,
        workspace_id=instance.compliance_period.gstin.client.workspace_id,
        client_id=instance.compliance_period.gstin.client_id,
        metadata={"return_type": instance.return_type, "arn": instance.arn},
    )
    return instance


def _sum_decimal(queryset, field_name):
    total = Decimal("0.00")
    for value in queryset.values_list(field_name, flat=True):
        total += value or Decimal("0.00")
    return total
