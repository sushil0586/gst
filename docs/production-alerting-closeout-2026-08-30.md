# Production Alerting Closeout

Date: 2026-08-30

This closes the remaining public-launch warning from `audit_security_posture --fail-on-warn`.

## Current Blocker

`FILING_ALERT_EMAIL_ENABLED=False`

The code already supports filing operational alert routing and email escalation. The remaining work is production configuration and a delivery smoke test.

## Required Values

Set these in the production backend environment after choosing the mail provider:

```bash
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL="GST Compliance <alerts@your-domain.example>"
EMAIL_HOST=<smtp-host>
EMAIL_PORT=<smtp-port>
EMAIL_HOST_USER=<smtp-username>
EMAIL_HOST_PASSWORD=<smtp-password>
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_TIMEOUT=10
FILING_ALERT_EMAIL_ENABLED=True
FILING_SUPPORT_RECOVERY_ROLES=owner,admin,manager,reviewer,senior_ca
FILING_DEFAULT_ALERT_RECIPIENT_ROLES=reviewer,manager,admin
APP_FRONTEND_URL=https://<production-host>
```

Use either `EMAIL_USE_TLS=True` on port `587`, or `EMAIL_USE_SSL=True` on port `465`, depending on the provider. Do not enable both unless the provider explicitly requires it.

## Recipient Policy

Before enabling alert emails, confirm at least one active user with an email address exists in one of these roles for every launch workspace:

```text
reviewer, manager, admin
```

For stricter routing, create `OperationalAlertRoutingRule` rows for the workspace/provider/return type/alert code scope. If no rule matches, the default recipient roles above are used.

## Smoke Test

After setting the env values and restarting backend/Celery services:

```bash
./venv/bin/python manage.py check
./venv/bin/python manage.py audit_security_posture --fail-on-warn
```

Then trigger one non-production filing alert in a controlled tenant and use the filing alert escalation action. Confirm:

1. An incident note is created.
2. A `filing.alerts_escalated` event is recorded.
3. The expected recipient receives the email.
4. No secrets, tokens, OTPs, or provider payloads are present in the email body.

## Launch Decision

For a 10-customer controlled launch, this can be accepted temporarily if a named operator watches the product, logs, and queues manually.

For public launch, enable this and rerun:

```bash
bash tools/public_launch_readiness_audit.sh
```
