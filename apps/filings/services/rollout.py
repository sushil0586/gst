from django.conf import settings
from django.db.models import Case, IntegerField, Q, Value, When
from django.utils import timezone

from apps.filings.models import ProviderRolloutPolicy


def resolve_provider_rollout_policy(*, filing):
    if filing is None:
        return None

    now = timezone.now()
    queryset = (
        ProviderRolloutPolicy.objects.filter(
            is_active=True,
            workspace=filing.workspace,
            provider=filing.provider,
        )
        .filter(Q(client__isnull=True) | Q(client=filing.client))
        .filter(Q(gstin__isnull=True) | Q(gstin=filing.gstin))
        .filter(Q(return_type="") | Q(return_type=filing.return_type))
        .filter(Q(effective_from__isnull=True) | Q(effective_from__lte=now))
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=now))
        .annotate(
            specificity=(
                Case(When(client__isnull=False, then=Value(1)), default=Value(0), output_field=IntegerField())
                + Case(When(gstin__isnull=False, then=Value(1)), default=Value(0), output_field=IntegerField())
                + Case(When(condition=~Q(return_type=""), then=Value(1)), default=Value(0), output_field=IntegerField())
            )
        )
        .order_by("-specificity", "-created_at")
    )
    return queryset.first()


def rollout_policy_allows_live_submission(*, filing):
    if not settings.FILING_ENFORCE_TENANT_ROLLOUT:
        return True, ""

    policy = resolve_provider_rollout_policy(filing=filing)
    if policy is None:
        return False, "No active tenant rollout policy allows live filing for this provider context."
    if not policy.enable_live_submission:
        return False, "Tenant rollout policy blocks live filing submission for this provider context."
    return True, ""


def rollout_policy_allows_live_status_sync(*, filing):
    if not settings.FILING_ENFORCE_TENANT_ROLLOUT:
        return True, ""

    policy = resolve_provider_rollout_policy(filing=filing)
    if policy is None:
        return False, "No active tenant rollout policy allows provider status sync for this provider context."
    if not policy.enable_live_status_sync:
        return False, "Tenant rollout policy blocks provider status sync for this provider context."
    return True, ""
