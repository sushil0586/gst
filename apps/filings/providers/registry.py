from rest_framework import serializers

from apps.filings.models import ReturnFiling
from apps.integrations.demo_gsp.provider import DemoGSPProvider
from apps.integrations.whitebooks.provider import WhiteBooksProvider


PROVIDER_REGISTRY = {
    ReturnFiling.Provider.WHITEBOOKS: WhiteBooksProvider,
    ReturnFiling.Provider.DEMO_GSP: DemoGSPProvider,
}


def get_filing_provider(provider_code: str):
    provider_class = PROVIDER_REGISTRY.get(provider_code)
    if provider_class is None:
        raise serializers.ValidationError({"provider": "Unsupported filing provider."})
    return provider_class()
