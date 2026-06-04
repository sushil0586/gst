# Production Security Checklist

Use this checklist before exposing the GST Compliance stack to real users or real GST data.

## Secrets

- Replace `SECRET_KEY` with a strong random value.
- Replace `JWT_SIGNING_KEY` with a strong random value.
- Rotate any provider credentials currently stored in local `.env` files if they were ever shared.
- Store production secrets in a secure secret manager or deployment platform secret store, not in the repository.

## Transport

- Set `DEBUG=False`.
- Set `SECURE_SSL_REDIRECT=True`.
- Set `SESSION_COOKIE_SECURE=True`.
- Set `CSRF_COOKIE_SECURE=True`.
- Set `SECURE_HSTS_SECONDS` to a positive value, typically `31536000`.
- Keep `WHITEBOOKS_SSL_VERIFY=True`.
- If TLS terminates at a reverse proxy, set `USE_X_FORWARDED_PROTO=True`.

## Surface Area

- Set `ENABLE_API_DOCS=False` in production unless documentation exposure is explicitly required.
- Review `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` carefully.
- Keep only the minimum origins needed for your deployed frontend.

## Abuse Protection

- Review throttles in `.env`:
  - `THROTTLE_LOGIN_RATE`
  - `THROTTLE_REGISTRATION_RATE`
  - `THROTTLE_PROVIDER_OTP_REQUEST_RATE`
  - `THROTTLE_PROVIDER_OTP_VERIFY_RATE`
  - `THROTTLE_SENSITIVE_EXPORT_RATE`
- Tune them to your expected user volume before go-live.

## Retention

- Set `SECURITY_RETENTION_ENABLED=True`.
- Review and tune:
  - `SECURITY_RETENTION_AUDIT_DAYS`
  - `SECURITY_RETENTION_FILING_DAYS`
  - `SECURITY_RETENTION_PROVIDER_AUTH_DAYS`
  - `SECURITY_RETENTION_IMPORT_DAYS`
- Ensure Celery Beat is running so scheduled retention actually executes.

## Security Logging

- Set `SECURITY_LOG_LEVEL=INFO` or stricter.
- Set `SECURITY_LOG_FILE` to a monitored writable path if file-based capture is needed.
- Forward the `gst_compliance.security` logger to your centralized log stack if available.
- Alert on repeated `auth.login_failed`, `provider_auth.failed`, and `request.rejected` events.

## Verification Commands

Run these before release:

```bash
./venv/bin/python manage.py check
./venv/bin/python manage.py audit_security_posture
./venv/bin/python manage.py enforce_security_retention --audit-days 1 --filing-days 1 --provider-auth-days 1 --import-days 1
cd gst-compliance-frontend && npm run lint && npm run build
```
