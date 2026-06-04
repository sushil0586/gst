from datetime import timedelta
import hashlib
import os
from pathlib import Path
import sys

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    USE_SQLITE_FALLBACK=(bool, any("pytest" in arg for arg in sys.argv)),
    CELERY_TASK_ALWAYS_EAGER=(bool, True),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="change-me-in-env-with-32-plus-chars")
DEFAULT_JWT_SIGNING_KEY = hashlib.sha256(SECRET_KEY.encode("utf-8")).hexdigest()
DEBUG = str(os.getenv("DEBUG", "False")).strip().lower() in {"1", "true", "yes", "on"}
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["127.0.0.1", "localhost"])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = env.bool("CORS_ALLOW_CREDENTIALS", default=False)

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "django_filters",
    "drf_spectacular",
]

MEDIA_STORAGE_BACKEND = env("MEDIA_STORAGE_BACKEND", default="filesystem").strip().lower()
if MEDIA_STORAGE_BACKEND == "s3":
    THIRD_PARTY_APPS.append("storages")

LOCAL_APPS = [
    "apps.common",
    "apps.accounts",
    "apps.organizations",
    "apps.workspaces",
    "apps.clients",
    "apps.gstins",
    "apps.compliance_periods",
    "apps.imports",
    "apps.gst_transactions",
    "apps.reconciliation",
    "apps.returns",
    "apps.filings",
    "apps.approvals",
    "apps.notices",
    "apps.audit_logs",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.common.middleware.RequestIDMiddleware",
    "apps.common.middleware.PerformanceHeadersMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=not DEBUG)
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=not DEBUG)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = env("SESSION_COOKIE_SAMESITE", default="Lax")
CSRF_COOKIE_SAMESITE = env("CSRF_COOKIE_SAMESITE", default="Lax")
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000 if not DEBUG else 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=not DEBUG)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = env("SECURE_REFERRER_POLICY", default="strict-origin-when-cross-origin")
X_FRAME_OPTIONS = env("X_FRAME_OPTIONS", default="DENY")

if env.bool("USE_X_FORWARDED_PROTO", default=False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

if env("USE_SQLITE_FALLBACK"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB"),
            "USER": env("POSTGRES_USER"),
            "PASSWORD": env("POSTGRES_PASSWORD"),
            "HOST": env("POSTGRES_HOST", default="127.0.0.1"),
            "PORT": env("POSTGRES_PORT", default="5432"),
        }
    }

DB_CONN_MAX_AGE = env.int("DB_CONN_MAX_AGE", default=0 if DEBUG else 60)
DB_CONN_HEALTH_CHECKS = env.bool("DB_CONN_HEALTH_CHECKS", default=not DEBUG)
DATABASES["default"]["CONN_MAX_AGE"] = DB_CONN_MAX_AGE
DATABASES["default"]["CONN_HEALTH_CHECKS"] = DB_CONN_HEALTH_CHECKS

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = env("TIME_ZONE", default="Asia/Kolkata")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_ROOT = BASE_DIR / "media"
MEDIA_URL = env("MEDIA_URL", default="/media/")

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {
            "location": str(MEDIA_ROOT),
            "base_url": MEDIA_URL,
        },
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

if MEDIA_STORAGE_BACKEND == "s3":
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
    if not AWS_STORAGE_BUCKET_NAME:
        raise ImproperlyConfigured("AWS_STORAGE_BUCKET_NAME must be set when MEDIA_STORAGE_BACKEND=s3.")

    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="")
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default="")
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
    AWS_S3_CUSTOM_DOMAIN = env("AWS_S3_CUSTOM_DOMAIN", default="")
    AWS_DEFAULT_ACL = env("AWS_DEFAULT_ACL", default=None)
    AWS_QUERYSTRING_AUTH = env.bool("AWS_QUERYSTRING_AUTH", default=False)
    AWS_S3_FILE_OVERWRITE = env.bool("AWS_S3_FILE_OVERWRITE", default=False)
    AWS_LOCATION = env("AWS_LOCATION", default="media")

    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": AWS_STORAGE_BUCKET_NAME,
            "region_name": AWS_S3_REGION_NAME or None,
            "endpoint_url": AWS_S3_ENDPOINT_URL or None,
            "access_key": AWS_ACCESS_KEY_ID or None,
            "secret_key": AWS_SECRET_ACCESS_KEY or None,
            "default_acl": AWS_DEFAULT_ACL,
            "querystring_auth": AWS_QUERYSTRING_AUTH,
            "file_overwrite": AWS_S3_FILE_OVERWRITE,
            "location": AWS_LOCATION,
            "custom_domain": AWS_S3_CUSTOM_DOMAIN or None,
        },
    }
    if AWS_S3_CUSTOM_DOMAIN:
        MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN.rstrip('/')}/"
    elif AWS_S3_ENDPOINT_URL:
        MEDIA_URL = f"{AWS_S3_ENDPOINT_URL.rstrip('/')}/{AWS_STORAGE_BUCKET_NAME}/{AWS_LOCATION.rstrip('/')}/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CACHE_BACKEND = env("CACHE_BACKEND", default="locmem").strip().lower()
CACHE_KEY_PREFIX = env("CACHE_KEY_PREFIX", default="gst-compliance")
CACHE_DEFAULT_TIMEOUT = env.int("CACHE_DEFAULT_TIMEOUT", default=60)
CACHE_WORKSPACE_CONTEXT_SECONDS = env.int("CACHE_WORKSPACE_CONTEXT_SECONDS", default=60)
CACHE_DASHBOARD_SUMMARY_SECONDS = env.int("CACHE_DASHBOARD_SUMMARY_SECONDS", default=30)
CACHE_CLOSE_MANAGER_SECONDS = env.int("CACHE_CLOSE_MANAGER_SECONDS", default=30)
CACHE_RETURN_READINESS_SECONDS = env.int("CACHE_RETURN_READINESS_SECONDS", default=30)

if CACHE_BACKEND == "redis":
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": env("CACHE_REDIS_URL", default="redis://127.0.0.1:6379/0"),
            "TIMEOUT": CACHE_DEFAULT_TIMEOUT,
            "KEY_PREFIX": CACHE_KEY_PREFIX,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": env("CACHE_LOCATION", default="gst-compliance"),
            "TIMEOUT": CACHE_DEFAULT_TIMEOUT,
            "KEY_PREFIX": CACHE_KEY_PREFIX,
        }
    }

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": env.int("PAGE_SIZE", default=20),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON_RATE", default="120/hour"),
        "user": env("THROTTLE_USER_RATE", default="1000/hour"),
        "login": env("THROTTLE_LOGIN_RATE", default="10/minute"),
        "registration": env("THROTTLE_REGISTRATION_RATE", default="5/hour"),
        "session": env("THROTTLE_SESSION_RATE", default="120/minute"),
        "provider_otp_request": env("THROTTLE_PROVIDER_OTP_REQUEST_RATE", default="5/10minute"),
        "provider_otp_verify": env("THROTTLE_PROVIDER_OTP_VERIFY_RATE", default="10/10minute"),
        "sensitive_exports": env("THROTTLE_SENSITIVE_EXPORT_RATE", default="20/hour"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=60)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env.int("JWT_REFRESH_DAYS", default=7)),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=DEFAULT_JWT_SIGNING_KEY),
}

ENABLE_API_DOCS = env.bool("ENABLE_API_DOCS", default=DEBUG)
MAX_IMPORT_UPLOAD_BYTES = env.int("MAX_IMPORT_UPLOAD_BYTES", default=10 * 1024 * 1024)
PERFORMANCE_HEADERS_ENABLED = env.bool("PERFORMANCE_HEADERS_ENABLED", default=DEBUG)
PERFORMANCE_SLOW_REQUEST_MS = env.int("PERFORMANCE_SLOW_REQUEST_MS", default=1200)
PERFORMANCE_LOG_LEVEL = env("PERFORMANCE_LOG_LEVEL", default="INFO")
IMPORT_CORRECTION_POLICY = {
    "allow_import_edit_after_reconciliation": env.bool("IMPORT_ALLOW_EDIT_AFTER_RECONCILIATION", default=True),
    "allow_import_discard_after_processing": env.bool("IMPORT_ALLOW_DISCARD_AFTER_PROCESSING", default=True),
    "allow_import_mutation_after_return_approval": env.bool("IMPORT_ALLOW_MUTATION_AFTER_RETURN_APPROVAL", default=False),
    "allow_import_mutation_after_filing": env.bool("IMPORT_ALLOW_MUTATION_AFTER_FILING", default=False),
    "require_reconciliation_rerun_after_source_change": env.bool(
        "IMPORT_REQUIRE_RECONCILIATION_RERUN_AFTER_SOURCE_CHANGE", default=True
    ),
    "block_return_approval_on_stale_reconciliation": env.bool(
        "IMPORT_BLOCK_RETURN_APPROVAL_ON_STALE_RECONCILIATION", default=True
    ),
    "block_return_filing_on_stale_reconciliation": env.bool(
        "IMPORT_BLOCK_RETURN_FILING_ON_STALE_RECONCILIATION", default=True
    ),
    "replacement_upload_creates_new_batch_version": env.bool(
        "IMPORT_REPLACEMENT_UPLOAD_CREATES_NEW_VERSION", default=True
    ),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "GST Compliance SaaS API",
    "DESCRIPTION": "Standalone GST Compliance backend foundation.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

REDIS_URL = env("REDIS_URL", default="redis://127.0.0.1:6379/0")
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=REDIS_URL)
CELERY_TASK_ALWAYS_EAGER = env("CELERY_TASK_ALWAYS_EAGER")
CELERY_TASK_TIME_LIMIT = env.int("CELERY_TASK_TIME_LIMIT", default=300)
CELERY_TASK_SOFT_TIME_LIMIT = env.int("CELERY_TASK_SOFT_TIME_LIMIT", default=240)
CELERY_STRICT_PRODUCTION_ASYNC = env.bool("CELERY_STRICT_PRODUCTION_ASYNC", default=not DEBUG)
CELERY_IMPORTS_QUEUE = env("CELERY_IMPORTS_QUEUE", default="imports")
CELERY_RECONCILIATION_QUEUE = env("CELERY_RECONCILIATION_QUEUE", default="reconciliation")
CELERY_FILINGS_QUEUE = env("CELERY_FILINGS_QUEUE", default="filings")
CELERY_SCHEDULED_QUEUE = env("CELERY_SCHEDULED_QUEUE", default="scheduled")
CELERY_TASK_ACKS_LATE = env.bool("CELERY_TASK_ACKS_LATE", default=True)
CELERY_WORKER_PREFETCH_MULTIPLIER = env.int("CELERY_WORKER_PREFETCH_MULTIPLIER", default=1 if not DEBUG else 4)
CELERY_WORKER_MAX_TASKS_PER_CHILD = env.int("CELERY_WORKER_MAX_TASKS_PER_CHILD", default=200)
CELERY_WORKER_SEND_TASK_EVENTS = env.bool("CELERY_WORKER_SEND_TASK_EVENTS", default=not DEBUG)

EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend",
)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="GST Compliance <no-reply@gstcompliance.local>")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=25)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
EMAIL_USE_SSL = env.bool("EMAIL_USE_SSL", default=False)
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=10)

WHITEBOOKS_SANDBOX_MODE = env.bool("WHITEBOOKS_SANDBOX_MODE", default=True)
WHITEBOOKS_BASE_URL = env("WHITEBOOKS_BASE_URL", default="")
WHITEBOOKS_API_KEY = env("WHITEBOOKS_API_KEY", default="")
WHITEBOOKS_API_SECRET = env("WHITEBOOKS_API_SECRET", default="")
WHITEBOOKS_USERNAME = env("WHITEBOOKS_USERNAME", default="")
WHITEBOOKS_PASSWORD = env("WHITEBOOKS_PASSWORD", default="")
WHITEBOOKS_CONTACT_EMAIL = env("WHITEBOOKS_CONTACT_EMAIL", default="")
WHITEBOOKS_GST_USERNAME = env("WHITEBOOKS_GST_USERNAME", default="")
WHITEBOOKS_STATE_CODE = env("WHITEBOOKS_STATE_CODE", default="")
WHITEBOOKS_IP_ADDRESS = env("WHITEBOOKS_IP_ADDRESS", default="")
WHITEBOOKS_TIMEOUT_SECONDS = env.int("WHITEBOOKS_TIMEOUT_SECONDS", default=30)
WHITEBOOKS_SSL_VERIFY = env.bool("WHITEBOOKS_SSL_VERIFY", default=True)
WHITEBOOKS_CA_BUNDLE = env("WHITEBOOKS_CA_BUNDLE", default="")
WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE = env.bool("WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE", default=False)
WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE = env.bool("WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE", default=False)
WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE = env.bool("WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE", default=False)
WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE = env.bool("WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE", default=False)
WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE = env.bool("WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE", default=False)
WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE = env.bool("WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE", default=False)
FILING_ENFORCE_TENANT_ROLLOUT = env.bool("FILING_ENFORCE_TENANT_ROLLOUT", default=False)
FILING_ENFORCE_MAKER_CHECKER = env.bool("FILING_ENFORCE_MAKER_CHECKER", default=False)
FILING_ALERT_EMAIL_ENABLED = env.bool("FILING_ALERT_EMAIL_ENABLED", default=False)
FILING_SUPPORT_RECOVERY_ROLES = env.list(
    "FILING_SUPPORT_RECOVERY_ROLES",
    default=["owner", "admin", "manager", "reviewer", "senior_ca"],
)
FILING_DEFAULT_ALERT_RECIPIENT_ROLES = env.list(
    "FILING_DEFAULT_ALERT_RECIPIENT_ROLES",
    default=["reviewer", "manager", "admin"],
)

CLOSE_MANAGER_DIGEST_ENABLED = env.bool("CLOSE_MANAGER_DIGEST_ENABLED", default=False)
CLOSE_MANAGER_DIGEST_DELIVERY_CHANNEL = env(
    "CLOSE_MANAGER_DIGEST_DELIVERY_CHANNEL",
    default="in_app" if DEBUG else "email_preview",
)
CLOSE_MANAGER_DIGEST_RECIPIENT_ROLES = env.list(
    "CLOSE_MANAGER_DIGEST_RECIPIENT_ROLES",
    default=["owner", "admin", "manager"],
)
CLOSE_MANAGER_DIGEST_SCHEDULE_HOUR = env.int("CLOSE_MANAGER_DIGEST_SCHEDULE_HOUR", default=9)
CLOSE_MANAGER_DIGEST_SCHEDULE_MINUTE = env.int("CLOSE_MANAGER_DIGEST_SCHEDULE_MINUTE", default=0)

REMEDIATION_FOLLOW_UP_AUTOMATION_ENABLED = env.bool("REMEDIATION_FOLLOW_UP_AUTOMATION_ENABLED", default=False)
REMEDIATION_FOLLOW_UP_DELIVERY_CHANNEL = env(
    "REMEDIATION_FOLLOW_UP_DELIVERY_CHANNEL",
    default="in_app" if DEBUG else "email_preview",
)
REMEDIATION_FOLLOW_UP_SCHEDULE_MINUTE = env.int("REMEDIATION_FOLLOW_UP_SCHEDULE_MINUTE", default=15)
REMEDIATION_AUTO_ESCALATION_ENABLED = env.bool("REMEDIATION_AUTO_ESCALATION_ENABLED", default=True)
REMEDIATION_AUTO_ESCALATION_DELAY_HOURS = env.int("REMEDIATION_AUTO_ESCALATION_DELAY_HOURS", default=24)

SECURITY_RETENTION_ENABLED = env.bool("SECURITY_RETENTION_ENABLED", default=False)
SECURITY_RETENTION_AUDIT_DAYS = env.int("SECURITY_RETENTION_AUDIT_DAYS", default=180)
SECURITY_RETENTION_FILING_DAYS = env.int("SECURITY_RETENTION_FILING_DAYS", default=90)
SECURITY_RETENTION_PROVIDER_AUTH_DAYS = env.int("SECURITY_RETENTION_PROVIDER_AUTH_DAYS", default=30)
SECURITY_RETENTION_IMPORT_DAYS = env.int("SECURITY_RETENTION_IMPORT_DAYS", default=30)
SECURITY_RETENTION_SCHEDULE_HOUR = env.int("SECURITY_RETENTION_SCHEDULE_HOUR", default=2)
SECURITY_RETENTION_SCHEDULE_MINUTE = env.int("SECURITY_RETENTION_SCHEDULE_MINUTE", default=0)
SECURITY_LOG_LEVEL = env("SECURITY_LOG_LEVEL", default="INFO")
SECURITY_LOG_FILE = env("SECURITY_LOG_FILE", default="")

if not DEBUG:
    if SECRET_KEY.startswith("change-me"):
        raise ImproperlyConfigured("SECRET_KEY must be set to a strong production value.")
    if env("JWT_SIGNING_KEY", default=DEFAULT_JWT_SIGNING_KEY).startswith("change-me"):
        raise ImproperlyConfigured("JWT_SIGNING_KEY must be set to a strong production value.")
    if WHITEBOOKS_BASE_URL and not WHITEBOOKS_SSL_VERIFY:
        raise ImproperlyConfigured("WHITEBOOKS_SSL_VERIFY must remain enabled outside local debugging.")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
        "security": {
            "format": "%(asctime)s %(levelname)s security request_id=%(request_id)s event=%(event)s severity=%(severity)s details=%(details)s",
        },
        "performance": {
            "format": "%(asctime)s %(levelname)s performance request_id=%(request_id)s path=%(path)s method=%(method)s duration_ms=%(duration_ms)s query_count=%(query_count)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
        "security_console": {
            "class": "logging.StreamHandler",
            "formatter": "security",
        },
        "performance_console": {
            "class": "logging.StreamHandler",
            "formatter": "performance",
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": True,
        },
        "gst_compliance.security": {
            "handlers": ["security_console"],
            "level": SECURITY_LOG_LEVEL,
            "propagate": False,
        },
        "gst_compliance.performance": {
            "handlers": ["performance_console"],
            "level": PERFORMANCE_LOG_LEVEL,
            "propagate": False,
        },
    },
}

if SECURITY_LOG_FILE:
    LOGGING["handlers"]["security_file"] = {
        "class": "logging.FileHandler",
        "filename": SECURITY_LOG_FILE,
        "formatter": "security",
    }
    LOGGING["loggers"]["gst_compliance.security"]["handlers"].append("security_file")
