# S3 Media Storage Setup

Date: August 25, 2026

## Purpose

This guide explains how to move uploaded import files from local disk storage to S3 or S3-compatible object storage.

The codebase already supports this mode through `MEDIA_STORAGE_BACKEND=s3`.

## Current implementation status

Already present in code:

- `config/settings.py` supports `MEDIA_STORAGE_BACKEND=s3`
- `django-storages` is already included in `requirements.txt`
- import uploads are stored through Django storage on the `ImportBatch.file` field

Relevant references:

- [config/settings.py](/Users/ansh/Documents/Gst-Compliance/config/settings.py:45)
- [apps/imports/models.py](/Users/ansh/Documents/Gst-Compliance/apps/imports/models.py:90)
- [requirements.txt](/Users/ansh/Documents/Gst-Compliance/requirements.txt:14)

## Recommended production direction

Use:

- one bucket for GST media uploads
- one logical prefix such as `media/`
- private objects by default
- application-controlled access for downloads

Recommended bucket pattern:

- bucket: `gst-compliance-uploads`
- prefix: `media/import_batches/...`

## Required environment variables

Set these in the target environment:

```bash
MEDIA_STORAGE_BACKEND=s3
AWS_STORAGE_BUCKET_NAME=<bucket-name>
AWS_S3_REGION_NAME=<aws-region>
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
AWS_LOCATION=media
AWS_QUERYSTRING_AUTH=False
AWS_S3_FILE_OVERWRITE=False
```

Optional settings:

```bash
AWS_S3_ENDPOINT_URL=
AWS_S3_CUSTOM_DOMAIN=
AWS_DEFAULT_ACL=
MEDIA_URL=
```

Notes:

- use `AWS_S3_ENDPOINT_URL` for S3-compatible providers such as Cloudflare R2, MinIO, or DigitalOcean Spaces
- use `AWS_S3_CUSTOM_DOMAIN` only if you want a custom media domain/CDN
- keep `AWS_S3_FILE_OVERWRITE=False`

## Example AWS S3 configuration

```bash
MEDIA_STORAGE_BACKEND=s3
AWS_STORAGE_BUCKET_NAME=gst-compliance-uploads
AWS_S3_REGION_NAME=ap-south-1
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_LOCATION=media
AWS_QUERYSTRING_AUTH=False
AWS_S3_FILE_OVERWRITE=False
```

Staging-ready template:

```bash
MEDIA_STORAGE_BACKEND=s3
MEDIA_URL=/media/
AWS_STORAGE_BUCKET_NAME=<your-staging-bucket>
AWS_S3_REGION_NAME=<your-region>
AWS_S3_ENDPOINT_URL=
AWS_ACCESS_KEY_ID=<your-access-key>
AWS_SECRET_ACCESS_KEY=<your-secret-key>
AWS_S3_CUSTOM_DOMAIN=
AWS_DEFAULT_ACL=
AWS_QUERYSTRING_AUTH=False
AWS_S3_FILE_OVERWRITE=False
AWS_LOCATION=media
```

## Example Cloudflare R2 style configuration

```bash
MEDIA_STORAGE_BACKEND=s3
AWS_STORAGE_BUCKET_NAME=gst-compliance-uploads
AWS_S3_REGION_NAME=auto
AWS_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_LOCATION=media
AWS_QUERYSTRING_AUTH=False
AWS_S3_FILE_OVERWRITE=False
```

Staging-ready template:

```bash
MEDIA_STORAGE_BACKEND=s3
MEDIA_URL=/media/
AWS_STORAGE_BUCKET_NAME=<your-r2-bucket>
AWS_S3_REGION_NAME=auto
AWS_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=<your-r2-access-key>
AWS_SECRET_ACCESS_KEY=<your-r2-secret-key>
AWS_S3_CUSTOM_DOMAIN=
AWS_DEFAULT_ACL=
AWS_QUERYSTRING_AUTH=False
AWS_S3_FILE_OVERWRITE=False
AWS_LOCATION=media
```

## Recommended default choice

For this project, the cleanest choices are:

1. AWS S3 if the rest of your infrastructure is already AWS-first
2. Cloudflare R2 if you want S3-compatible storage with simpler public delivery economics

Recommended practical choice for Tuesday, August 25, 2026:

- if your staging and production are already AWS EC2 based and you want the least surprise, use **AWS S3**
- if you already use Cloudflare heavily and want S3-compatible storage with a simple endpoint model, use **R2**

## Exact staging switch checklist

1. Create the bucket.
2. Create access credentials with read/write access only to that bucket.
3. Put the selected env block into the staging backend environment.
4. Restart the backend service.
5. Upload one fresh Excel import.
6. Confirm the new object appears under:
   - `media/import_batches/YYYY/MM/DD/...`
7. Confirm the import still processes successfully.
8. Leave old local files in place for now.

## Exact post-change validation

After enabling S3 media storage on staging, run:

```bash
cd /Users/ansh/Documents/Gst-Compliance
bash tools/staging_recovery_validation.sh
```

Then verify one fresh upload manually in the UI and confirm:

- the `ImportBatch` record is created
- the uploaded file key exists in object storage
- no new upload is written only to `/srv/gst-compliance/media/import_batches/...`
- import processing still completes normally

## Rollout steps

### 1. Provision storage

- create the bucket
- block public writes
- prefer private bucket access
- grant only the minimum read/write permissions needed

### 2. Configure the environment

- add the S3 env vars to staging or production secrets
- restart the backend service after the env update

### 3. Validate new uploads

Upload a new Excel file and confirm:

- a new `ImportBatch` is created
- the file key is written under the expected prefix
- the file no longer lands only on local disk
- import processing still completes normally

### 4. Decide what to do with old files

Pick one of these paths:

1. Leave existing local files where they are and use S3 only for new uploads.
2. Backfill old `media/import_batches/...` files into S3 and keep paths aligned.

For launch safety, option 1 is usually the lowest-risk first move.

## Recommended first rollout

Recommended order:

1. enable S3 media storage in staging
2. upload and process a fresh Excel import
3. verify app behavior and file persistence
4. then enable the same config in production

## Launch guidance

For a controlled launch:

- local disk storage is acceptable only as a temporary compromise
- S3/object storage is the better medium-term production posture

For broader rollout:

- move uploads off the EC2 root volume
- do not rely on a single host filesystem as the long-term source of truth for import files
