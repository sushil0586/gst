# AWS EC2 Staging Deployment Guide

This guide is for deploying GST Compliance to a single EC2 instance on one staging subdomain.

Recommended example:

- frontend + backend on `gst-stage.yourdomain.com`
- Django served privately on `127.0.0.1:8001`
- Next.js served privately on `127.0.0.1:3001`
- Nginx handles:
  - SSL
  - public traffic
  - reverse proxy

This is the simplest practical staging setup for the current project.

Throughout this guide, adjust these values if your server already hosts other apps:

- `APP_ROOT=/srv/gst-compliance/gst`
- `VENV_ROOT=/srv/gst-compliance/venv`
- `BACKEND_PORT=8001`
- `FRONTEND_PORT=3001`
- `STAGE_HOST=gst-stage.yourdomain.com`

## 1. Architecture

Single EC2 instance:

- Ubuntu 24.04 LTS
- Nginx
- Python 3.12+
- Node.js 22 LTS
- PostgreSQL
- Redis
- Gunicorn for Django
- `next start` for Next.js
- Celery workers
- Celery beat

Public entry:

- `https://gst-stage.yourdomain.com`

Internal ports:

- Django: `127.0.0.1:8001`
- Next.js: `127.0.0.1:3001`
- PostgreSQL: local service
- Redis: local service

## 2. DNS And EC2

### DNS

Create an `A` record:

- host: `gst-stage`
- value: your EC2 public IP

### Security group

Allow:

- `22` from your office/home IP
- `80` from anywhere
- `443` from anywhere

Do not expose:

- `3000`
- `3001`
- `8001`
- `5432`
- `6379`

Those should remain private on the instance.

## 2.1 Before You Continue

Check whether the instance already hosts other apps.

Useful commands:

```bash
ss -ltnp | grep -E ':(3000|3001|4000|8000|8001|8010)'
df -h
```

If `8000` or `3000` are already in use, pick alternate internal ports before creating services. The examples below use `8001` and `3001` because that is a common safe staging combination on shared EC2 boxes.

Also check disk. If the instance has less than `500 MB` free, clean space or resize EBS before building the frontend.

## 3. Initial Server Setup

SSH into the box:

```bash
ssh ubuntu@YOUR_EC2_PUBLIC_IP
```

Update packages:

```bash
sudo apt update && sudo apt upgrade -y
```

Install base packages:

```bash
sudo apt install -y nginx git python3 python3-venv python3-pip postgresql postgresql-contrib redis-server build-essential curl
```

Install Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Optional checks:

```bash
node -v
npm -v
python3 --version
redis-cli ping
```

Expected Redis output:

```text
PONG
```

## 4. Create App Directory

Recommended location:

```bash
sudo mkdir -p /srv/gst-compliance
sudo chown -R ubuntu:ubuntu /srv/gst-compliance
cd /srv/gst-compliance
```

Clone the repo:

```bash
git clone YOUR_REPO_URL .
```

If the repo ends up under a nested folder such as `/srv/gst-compliance/gst`, keep using that real path consistently in all later service and Nginx examples.

## 5. Backend Setup

Create venv and install dependencies:

```bash
cd /srv/gst-compliance
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Copy env file:

```bash
cp .env.example .env
```

Edit:

```bash
nano .env
```

Minimum staging backend values:

```env
DEBUG=False
ALLOWED_HOSTS=gst-stage.yourdomain.com,127.0.0.1,localhost
CORS_ALLOWED_ORIGINS=https://gst-stage.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://gst-stage.yourdomain.com
CORS_ALLOW_CREDENTIALS=True

SECRET_KEY=put-a-strong-secret-here
JWT_SIGNING_KEY=put-a-strong-jwt-signing-key-here

POSTGRES_DB=gst_compliance
POSTGRES_USER=gst_compliance
POSTGRES_PASSWORD=put-a-strong-db-password-here
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432

REDIS_URL=redis://127.0.0.1:6379/0
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0
CELERY_TASK_ALWAYS_EAGER=False
CELERY_STRICT_PRODUCTION_ASYNC=True
CELERY_WORKER_PREFETCH_MULTIPLIER=1
CELERY_WORKER_SEND_TASK_EVENTS=True

CACHE_BACKEND=redis
CACHE_REDIS_URL=redis://127.0.0.1:6379/0
DB_CONN_MAX_AGE=60
DB_CONN_HEALTH_CHECKS=True

SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
SECURE_SSL_REDIRECT=False
USE_X_FORWARDED_PROTO=True
ENABLE_API_DOCS=False

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL=GST Compliance <no-reply@yourdomain.com>
EMAIL_HOST=smtp.yourprovider.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-smtp-user
EMAIL_HOST_PASSWORD=your-smtp-password
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_TIMEOUT=10
APP_FRONTEND_URL=https://gst-stage.yourdomain.com

WHITEBOOKS_SANDBOX_MODE=True
WHITEBOOKS_BASE_URL=https://apisandbox.whitebooks.in
WHITEBOOKS_API_KEY=
WHITEBOOKS_API_SECRET=
WHITEBOOKS_USERNAME=
WHITEBOOKS_PASSWORD=
WHITEBOOKS_CONTACT_EMAIL=
WHITEBOOKS_GST_USERNAME=
WHITEBOOKS_STATE_CODE=
WHITEBOOKS_IP_ADDRESS=YOUR_EC2_PUBLIC_IP
WHITEBOOKS_TIMEOUT_SECONDS=30
WHITEBOOKS_SSL_VERIFY=True
WHITEBOOKS_CA_BUNDLE=

WHITEBOOKS_ENABLE_GSTR1_SAVE_LIVE=False
WHITEBOOKS_ENABLE_GSTR1_PROCEED_LIVE=False
WHITEBOOKS_ENABLE_GSTR1_FILE_LIVE=False
WHITEBOOKS_ENABLE_GSTR3B_SAVE_LIVE=False
WHITEBOOKS_ENABLE_GSTR3B_OFFSET_LIVE=False
WHITEBOOKS_ENABLE_GSTR3B_FILE_LIVE=False

FILING_ENFORCE_TENANT_ROLLOUT=True
FILING_ENFORCE_MAKER_CHECKER=True
FILING_ALERT_EMAIL_ENABLED=True
WHITEBOOKS_AUTH_SESSION_MAX_AGE_MINUTES=360
```

Important:

- keep `SECURE_SSL_REDIRECT=False` until Nginx + SSL are in place
- once HTTPS is confirmed, switch it to `True`
- for staging/sandbox, keep `WHITEBOOKS_SANDBOX_MODE=True`
- keep `WHITEBOOKS_SSL_VERIFY=True`
- use the EC2 public IP for `WHITEBOOKS_IP_ADDRESS` if the provider expects the source IP
- set `APP_FRONTEND_URL` to the exact browser URL users will open, because password-reset emails use it to build the reset link
- use a real SMTP-backed `EMAIL_BACKEND` outside local development if forgot-password should work in staging or production
- set `DEFAULT_FROM_EMAIL` to a sender address your mail provider allows
- for production-like filing control, enable `FILING_ENFORCE_TENANT_ROLLOUT=True`
- for production-like filing control, enable `FILING_ENFORCE_MAKER_CHECKER=True`
- keep `FILING_ALERT_EMAIL_ENABLED=True` once alert routing is configured
- keep `WHITEBOOKS_AUTH_SESSION_MAX_AGE_MINUTES` intentionally set to a positive value

### Password Reset Email Check

Before sharing staging with users, verify password-reset delivery end to end:

1. Open `/forgot-password` in the browser.
2. Request a reset link for a real workspace user.
3. Confirm the email is delivered from `DEFAULT_FROM_EMAIL`.
4. Open the received link and confirm it lands on `/reset-password`.
5. Set a new password and sign in with it.

If the email is not delivered:

- recheck `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, and `EMAIL_HOST_PASSWORD`
- confirm your SMTP provider allows the chosen sender
- confirm `APP_FRONTEND_URL` matches the public staging URL exactly

### Staging UAT Pass

Before declaring the EC2 staging stack release-ready, run this browser and API pass:

1. Apply migrations:
   ```bash
   cd /srv/gst-compliance/gst
   source venv/bin/activate
   python manage.py migrate
   ```
2. Run Django checks:
   ```bash
   python manage.py check
   python manage.py check --deploy
   ```
3. Verify these flows in the browser:
   - login and logout
   - change password
   - forgot-password and reset-password from received email
   - add workspace user and assign role
   - create client, GSTIN, and compliance period
   - create and update a notice
   - prepare and approve a return
4. Verify live-control gates:
   - provider auth session can request OTP
   - provider auth session can verify OTP
   - stale auth session warning appears when expected
   - filing cannot proceed outside rollout policy
   - maker-checker is enforced where intended
5. Capture release evidence:
   - screenshots for auth reset flow
   - screenshot for role assignment
   - screenshot for notice lifecycle
   - screenshot for filing status / evidence

If `check --deploy` reports only schema-generation warnings from `drf_spectacular`, treat those as documentation follow-up items rather than staging blockers. Do not ignore security-setting failures or provider SSL verification failures.

### WhiteBooks Credentials

Update the provider credentials directly in the backend `.env` on the server:

```bash
nano /srv/gst-compliance/gst/.env
```

After changing WhiteBooks values, restart:

```bash
sudo systemctl restart gst-backend
sudo systemctl restart gst-celery-filings
sudo systemctl restart gst-celery-scheduled
```

Or restart all GST workers if you prefer a clean reload:

```bash
sudo systemctl restart gst-celery-imports gst-celery-reconciliation gst-celery-filings gst-celery-scheduled gst-celery-beat
```

## 6. PostgreSQL Setup

Open PostgreSQL shell:

```bash
sudo -u postgres psql
```

Create DB and user:

```sql
CREATE DATABASE gst_compliance;
CREATE USER gst_compliance WITH PASSWORD 'put-a-strong-db-password-here';
ALTER ROLE gst_compliance SET client_encoding TO 'utf8';
ALTER ROLE gst_compliance SET default_transaction_isolation TO 'read committed';
ALTER ROLE gst_compliance SET timezone TO 'Asia/Kolkata';
GRANT ALL PRIVILEGES ON DATABASE gst_compliance TO gst_compliance;
\q
```

If you are reusing an existing PostgreSQL user such as `postgres`, you only need:

```sql
CREATE DATABASE gst_compliance;
GRANT ALL PRIVILEGES ON DATABASE gst_compliance TO postgres;
```

If migrations fail with `permission denied for schema public`, connect to the DB and run the grants one line at a time:

```sql
\c gst_compliance
GRANT ALL ON SCHEMA public TO YOUR_DB_USER;
GRANT ALL ON ALL TABLES IN SCHEMA public TO YOUR_DB_USER;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO YOUR_DB_USER;
ALTER SCHEMA public OWNER TO YOUR_DB_USER;
```

Run migrations:

```bash
cd /srv/gst-compliance
source venv/bin/activate
python manage.py migrate
python manage.py check
```

Optional demo seed for non-production staging only:

```bash
python manage.py seed_demo_data
```

Do not seed demo data in any production environment.

## 7. Frontend Setup

```bash
cd /srv/gst-compliance/gst-compliance-frontend
```

If `.env.example` exists:

```bash
cp .env.example .env.local
```

If it does not exist on the server, create the file manually:

```bash
nano .env.local
```

Use:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001/api/v1
NEXT_PUBLIC_DEBUG_PERFORMANCE=false
```

Then install and build:

```bash
npm install
npm run build
```

If the build stalls on a low-memory EC2 box, use:

```bash
NODE_OPTIONS="--max-old-space-size=1024" npm run build
```

If the instance has no swap, add it before building:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 8. Systemd Services

Create a backend service:

```bash
sudo nano /etc/systemd/system/gst-backend.service
```

Use:

```ini
[Unit]
Description=GST Compliance Django Backend
After=network.target postgresql.service redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/srv/gst-compliance/gst
Environment="DJANGO_SETTINGS_MODULE=config.settings"
ExecStart=/srv/gst-compliance/venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8001 --workers 1 --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create a frontend service:

```bash
sudo nano /etc/systemd/system/gst-frontend.service
```

Use:

```ini
[Unit]
Description=GST Compliance Next Frontend
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/srv/gst-compliance/gst/gst-compliance-frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3001
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Create Celery worker services.

Imports worker:

```bash
sudo nano /etc/systemd/system/gst-celery-imports.service
```

```ini
[Unit]
Description=GST Compliance Celery Imports Worker
After=network.target redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/srv/gst-compliance/gst
ExecStart=/srv/gst-compliance/venv/bin/celery -A config worker -l info -Q imports --concurrency=4 --hostname=imports@%%h
Restart=always

[Install]
WantedBy=multi-user.target
```

Reconciliation worker:

```ini
[Unit]
Description=GST Compliance Celery Reconciliation Worker
After=network.target redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/srv/gst-compliance/gst
ExecStart=/srv/gst-compliance/venv/bin/celery -A config worker -l info -Q reconciliation --concurrency=4 --hostname=reconciliation@%%h
Restart=always

[Install]
WantedBy=multi-user.target
```

Filings worker:

```ini
[Unit]
Description=GST Compliance Celery Filings Worker
After=network.target redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/srv/gst-compliance/gst
ExecStart=/srv/gst-compliance/venv/bin/celery -A config worker -l info -Q filings --concurrency=2 --hostname=filings@%%h
Restart=always

[Install]
WantedBy=multi-user.target
```

Scheduled worker:

```ini
[Unit]
Description=GST Compliance Celery Scheduled Worker
After=network.target redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/srv/gst-compliance/gst
ExecStart=/srv/gst-compliance/venv/bin/celery -A config worker -l info -Q scheduled --concurrency=1 --hostname=scheduled@%%h
Restart=always

[Install]
WantedBy=multi-user.target
```

Beat service:

```bash
sudo nano /etc/systemd/system/gst-celery-beat.service
```

```ini
[Unit]
Description=GST Compliance Celery Beat
After=network.target redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/srv/gst-compliance/gst
ExecStart=/srv/gst-compliance/venv/bin/celery -A config beat -l info
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable everything:

```bash
sudo systemctl daemon-reload
sudo systemctl enable gst-backend gst-frontend gst-celery-imports gst-celery-reconciliation gst-celery-filings gst-celery-scheduled gst-celery-beat
sudo systemctl start gst-backend gst-frontend gst-celery-imports gst-celery-reconciliation gst-celery-filings gst-celery-scheduled gst-celery-beat
```

Check:

```bash
sudo systemctl status gst-backend
sudo systemctl status gst-frontend
sudo systemctl status gst-celery-imports
```

## 9. Nginx Config

Create site:

```bash
sudo nano /etc/nginx/sites-available/gst-stage
```

Use:

```nginx
server {
    listen 80;
    server_name gst-stage.yourdomain.com;

    client_max_body_size 25M;

    location /static/ {
        alias /srv/gst-compliance/gst/staticfiles/;
    }

    location /media/ {
        alias /srv/gst-compliance/gst/media/;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/gst-stage /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 10. SSL With Let’s Encrypt

Install certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Issue certificate:

```bash
sudo certbot --nginx -d gst-stage.yourdomain.com
```

Example real host:

```bash
sudo certbot --nginx -d gst-stage.accerio.in
```

After SSL works, update backend `.env`:

```env
SECURE_SSL_REDIRECT=True
```

Then restart backend:

```bash
sudo systemctl restart gst-backend
```

## 11. Post-Deploy Smoke Checks

Backend:

```bash
cd /srv/gst-compliance/gst
source venv/bin/activate
python manage.py check
python manage.py audit_security_posture
```

Frontend:

```bash
cd /srv/gst-compliance/gst/gst-compliance-frontend
npm run build
```

Browser checks:

1. open `https://gst-stage.yourdomain.com`
2. log in
3. load dashboard
4. open imports
5. upload a sample file
6. run reconciliation
7. prepare a return
8. confirm audit trail updates

Service log checks:

```bash
journalctl -u gst-backend -f
journalctl -u gst-frontend -f
journalctl -u gst-celery-imports -f
journalctl -u gst-celery-reconciliation -f
journalctl -u gst-celery-filings -f
```

## 12. Update Workflow

For a new deploy:

```bash
cd /srv/gst-compliance/gst
git pull
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
cd gst-compliance-frontend
npm install
npm run build
sudo systemctl restart gst-backend gst-frontend gst-celery-imports gst-celery-reconciliation gst-celery-filings gst-celery-scheduled gst-celery-beat
```

## 13. Recommended Stage Notes

For your current staging setup, this is the simplest safe path:

- keep PostgreSQL and Redis on the same EC2 first
- keep media on local disk if this is single-instance staging
- move media to S3 when you want multi-instance or closer-to-production rehearsal
- keep `WHITEBOOKS_SANDBOX_MODE=True`
- keep live filing rollout flags disabled
- keep `WHITEBOOKS_AUTH_SESSION_MAX_AGE_MINUTES` at the default unless you have a tested operational reason to change it
- if the EC2 root volume is only `8 GB`, expect disk pressure during `npm install` and `next build`
- for multi-app staging servers, prefer:
  - backend workers: `1`
  - frontend port: `3001`
  - backend port: `8001`

## 15. Common Deployment Pitfalls

### Frontend service starts but immediately exits

If `gst-frontend` logs say:

```text
Could not find a production build in the '.next' directory
```

then `npm run build` did not complete successfully. Stop the frontend service, remove `.next`, rebuild, then start the service again:

```bash
sudo systemctl stop gst-frontend
cd /srv/gst-compliance/gst/gst-compliance-frontend
rm -rf .next
NODE_OPTIONS="--max-old-space-size=1024" npm run build
sudo systemctl start gst-frontend
```

### Curl to backend returns Django 400

If this happens on local server checks:

```text
Bad Request (400)
```

add these to `ALLOWED_HOSTS`:

```env
ALLOWED_HOSTS=gst-stage.yourdomain.com,127.0.0.1,localhost
```

### Node is missing on the server

Install Node 22 with NodeSource, not plain `apt install npm`:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### Disk is full during build or config save

Quick cleanup:

```bash
rm -rf /home/ubuntu/.npm
sudo apt clean
sudo rm -rf /var/lib/apt/lists/*
rm -rf /srv/gst-compliance/gst/gst-compliance-frontend/.next
```

## 14. Later Improvements

After staging is stable, the next upgrade path is:

1. move PostgreSQL to RDS
2. move Redis to ElastiCache
3. move media to S3
4. add CloudWatch or centralized log shipping
5. add CI/CD deploy automation
