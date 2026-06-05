from django.db.models import BooleanField, Case, CharField, Count, Exists, OuterRef, Prefetch, Q, Subquery, Value, When
from django.utils import timezone

from apps.compliance_periods.models import CompliancePeriod
from apps.customer_operations.models import OperationalFollowUp
from apps.filings.models import ReturnFiling
from apps.returns.models import ReturnPreparation


def get_return_status_register_queryset():
    today = timezone.localdate()
    closed_follow_up_statuses = [
        OperationalFollowUp.FollowUpStatus.COMPLETED,
        OperationalFollowUp.FollowUpStatus.CANCELLED,
    ]
    open_follow_up_queryset = (
        OperationalFollowUp.objects.filter(is_active=True)
        .exclude(status__in=closed_follow_up_statuses)
        .select_related("assigned_to", "contact")
        .order_by("-due_at", "-created_at")
    )
    return_preparation_queryset = (
        ReturnPreparation.objects.filter(is_active=True)
        .select_related("prepared_by", "approved_by", "filed_by")
        .order_by("-created_at")
    )
    return_filing_queryset = (
        ReturnFiling.objects.filter(is_active=True)
        .select_related("approved_by", "filed_by")
        .order_by("-created_at")
    )

    latest_preparation = return_preparation_queryset.filter(compliance_period_id=OuterRef("pk"))
    latest_filing = return_filing_queryset.filter(compliance_period_id=OuterRef("pk"))
    latest_open_follow_up = open_follow_up_queryset.filter(compliance_period_id=OuterRef("pk"))
    customer_pending_follow_up = latest_open_follow_up.filter(
        pending_with=OperationalFollowUp.PendingWith.CUSTOMER,
    )

    queryset = (
        CompliancePeriod.objects.filter(is_active=True)
        .select_related("gstin", "gstin__client", "gstin__client__workspace")
        .prefetch_related(
            Prefetch("return_preparations", queryset=return_preparation_queryset),
            Prefetch("return_filings", queryset=return_filing_queryset),
            Prefetch("operational_follow_ups", queryset=open_follow_up_queryset),
        )
        .annotate(
            preparation_id=Subquery(latest_preparation.values("id")[:1]),
            preparation_status=Subquery(latest_preparation.values("status")[:1]),
            preparation_blocking_reason=Subquery(latest_preparation.values("blocking_reason")[:1]),
            filing_id=Subquery(latest_filing.values("id")[:1]),
            filing_status=Subquery(latest_filing.values("status")[:1]),
            filing_arn=Subquery(latest_filing.values("arn")[:1]),
            filing_filed_at=Subquery(latest_filing.values("filed_at")[:1]),
            latest_follow_up_title=Subquery(latest_open_follow_up.values("title")[:1]),
            latest_pending_with=Subquery(latest_open_follow_up.values("pending_with")[:1]),
            has_customer_pending=Exists(customer_pending_follow_up),
            open_follow_up_count=Count(
                "operational_follow_ups",
                filter=Q(operational_follow_ups__is_active=True) & ~Q(operational_follow_ups__status__in=closed_follow_up_statuses),
                distinct=True,
            ),
            overdue_follow_up_count=Count(
                "operational_follow_ups",
                filter=Q(operational_follow_ups__is_active=True)
                & ~Q(operational_follow_ups__status__in=closed_follow_up_statuses)
                & Q(operational_follow_ups__due_at__lt=timezone.now()),
                distinct=True,
            ),
        )
        .annotate(
            pending_with=Case(
                When(has_customer_pending=True, then=Value(OperationalFollowUp.PendingWith.CUSTOMER)),
                When(latest_pending_with__isnull=False, then=Subquery(latest_open_follow_up.values("pending_with")[:1])),
                default=Value(""),
                output_field=CharField(),
            ),
            is_filed=Case(
                When(
                    Q(filing_status__in=[ReturnFiling.FilingStatus.FILED, ReturnFiling.FilingStatus.ARN_RECEIVED])
                    | Q(preparation_status=ReturnPreparation.PreparationStatus.FILED),
                    then=Value(True),
                ),
                default=Value(False),
                output_field=BooleanField(),
            ),
            is_blocked=Case(
                When(
                    Q(preparation_status=ReturnPreparation.PreparationStatus.BLOCKED_BY_STALE_RECONCILIATION)
                    | Q(filing_status__in=[ReturnFiling.FilingStatus.FAILED, ReturnFiling.FilingStatus.NEEDS_RETRY, ReturnFiling.FilingStatus.CANCELLED]),
                    then=Value(True),
                ),
                default=Value(False),
                output_field=BooleanField(),
            ),
            is_ready=Case(
                When(
                    Q(preparation_status__in=[ReturnPreparation.PreparationStatus.READY_FOR_REVIEW, ReturnPreparation.PreparationStatus.APPROVED])
                    | Q(
                        filing_status__in=[
                            ReturnFiling.FilingStatus.DRAFT,
                            ReturnFiling.FilingStatus.READY_FOR_REVIEW,
                            ReturnFiling.FilingStatus.APPROVED,
                            ReturnFiling.FilingStatus.QUEUED_FOR_FILING,
                            ReturnFiling.FilingStatus.SUBMITTED,
                        ]
                    ),
                    then=Value(True),
                ),
                default=Value(False),
                output_field=BooleanField(),
            ),
            is_overdue=Case(
                When(due_date__lt=today, then=Value(True)),
                default=Value(False),
                output_field=BooleanField(),
            ),
        )
        .annotate(
            status_bucket=Case(
                When(is_filed=True, then=Value("filed")),
                When(has_customer_pending=True, then=Value("customer_pending")),
                When(is_blocked=True, then=Value("blocked")),
                When(Q(is_overdue=True) & Q(is_filed=False), then=Value("overdue")),
                When(is_ready=True, then=Value("ready")),
                default=Value("in_progress"),
                output_field=CharField(),
            ),
        )
        .order_by("-period", "gstin__gstin", "return_type")
    )
    return queryset
