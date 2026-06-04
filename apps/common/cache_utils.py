import hashlib
import json

from django.conf import settings
from django.core.cache import cache


def scoped_cache_key(namespace, *, user_id=None, **params):
    normalized = {key: "" if value is None else str(value) for key, value in sorted(params.items())}
    digest = hashlib.sha256(
        json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:20]
    user_component = f":u{user_id}" if user_id is not None else ""
    return f"{settings.CACHE_KEY_PREFIX}:{namespace}{user_component}:{digest}"


def get_cached_or_build(cache_key, timeout, builder):
    if timeout <= 0:
        return builder()

    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    value = builder()
    cache.set(cache_key, value, timeout=timeout)
    return value
