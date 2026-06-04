# AWS EC2 Staging Deployment Guide

This guide is for deploying GST Compliance to a single EC2 instance on one staging subdomain.

Recommended example:

- frontend + backend on `gst-stage.yourdomain.com`
- Django served privately on `127.0.0.1:8000`
- Next.js served privately on `127.0.0.1:3000`
- Nginx handles:
  - SSL
  - public traffic
  - reverse proxy

This is the simplest practical staging setup for the current project.

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

- Django: `127.0.0.1:8000`
- Next.js: `127.0.0.1:3000`
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
- `8000`
- `5432`
- `6379`

Those should remain private on the instance.

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
ALLOWED_HOSTS=gst-stage.yourdomain.com
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

WHITEBOOKS_SANDBOX_MODE=True
WHITEBOOKS_SSL_VERIFY=True
```

Important:

- keep `SECURE_SSL_REDIRECT=False` until Nginx + SSL are in place
- once HTTPS is confirmed, switch it to `True`

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

Run migrations:

```bash
cd /srv/gst-compliance
source venv/bin/activate
python manage.py migrate
python manage.py check
```

Optional demo seed for staging:

```bash
python manage.py seed_demo_data
```

## 7. Frontend Setup

```bash
cd /srv/gst-compliance/gst-compliance-frontend
cp .env.example .env.local
nano .env.local
```

Use:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
NEXT_PUBLIC_DEBUG_PERFORMANCE=false
```

Then install and build:

```bash
npm install
npm run build
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
WorkingDirectory=/srv/gst-compliance
Environment="DJANGO_SETTINGS_MODULE=config.settings"
ExecStart=/srv/gst-compliance/venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 120
Restart=always

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
WorkingDirectory=/srv/gst-compliance/gst-compliance-frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always

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
WorkingDirectory=/srv/gst-compliance
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
WorkingDirectory=/srv/gst-compliance
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
WorkingDirectory=/srv/gst-compliance
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
WorkingDirectory=/srv/gst-compliance
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
WorkingDirectory=/srv/gst-compliance
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
        alias /srv/gst-compliance/staticfiles/;
    }

    location /media/ {
        alias /srv/gst-compliance/media/;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
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
cd /srv/gst-compliance
source venv/bin/activate
python manage.py check
python manage.py audit_security_posture
```

Frontend:

```bash
cd /srv/gst-compliance/gst-compliance-frontend
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
cd /srv/gst-compliance
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

## 14. Later Improvements

After staging is stable, the next upgrade path is:

1. move PostgreSQL to RDS
2. move Redis to ElastiCache
3. move media to S3
4. add CloudWatch or centralized log shipping
5. add CI/CD deploy automation

