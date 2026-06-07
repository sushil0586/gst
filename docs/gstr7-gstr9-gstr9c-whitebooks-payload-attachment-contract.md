# GSTR-7, GSTR-9, And GSTR-9C WhiteBooks Payload Attachment Contract

## Purpose

This document defines the exact payload attachment contract used by the current product for guarded WhiteBooks live flows for:

- `GSTR-7`
- `GSTR-9`
- `GSTR-9C`

This is intentionally strict:

- no inferred annual/TDS payload generation
- no hidden provider mapping
- no silent fallback from native snapshots into final filing payloads

If these explicit payloads are not attached, the system will remain in manual or save-only behavior depending on return type and flags.

## Current Design Principle

The current product supports two layers:

1. Native product preparation
   - our own `summary_snapshot`
   - our own review pages
   - our own workbook exports

2. WhiteBooks provider transport
   - only when provider-ready WhiteBooks payloads are attached explicitly

This means:

- the app does **not** auto-derive final WhiteBooks annual or TDS payloads from native summary data
- WhiteBooks live submission is enabled only when explicit payloads are present and the corresponding feature flags are enabled

## Feature Flags

The following settings control live behavior:

### GSTR-7

- `WHITEBOOKS_ENABLE_GSTR7_SAVE_LIVE`
- `WHITEBOOKS_ENABLE_GSTR7_FILE_LIVE`

### GSTR-9

- `WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE`
- `WHITEBOOKS_ENABLE_GSTR9_FILE_LIVE`

### GSTR-9C

- `WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE`
- `WHITEBOOKS_ENABLE_GSTR9C_FILE_LIVE`

## Runtime Rules

### GSTR-7

- if no explicit file payload is attached:
  - product review/export can work
  - live file cannot proceed
- if `WHITEBOOKS_ENABLE_GSTR7_SAVE_LIVE=True`:
  - WhiteBooks live save is available
- if `WHITEBOOKS_ENABLE_GSTR7_FILE_LIVE=True` and explicit file payload exists:
  - WhiteBooks final file request is available

### GSTR-9

- if no explicit save payload is attached:
  - the return stays on manual annual filing flow
- if explicit save payload exists and `WHITEBOOKS_ENABLE_GSTR9_SAVE_LIVE=True`:
  - WhiteBooks live draft save is available
- if explicit file payload also exists and `WHITEBOOKS_ENABLE_GSTR9_FILE_LIVE=True`:
  - WhiteBooks final file request is available

### GSTR-9C

- if no explicit save payload is attached:
  - the return stays on manual annual filing flow
- if explicit save payload exists and `WHITEBOOKS_ENABLE_GSTR9C_SAVE_LIVE=True`:
  - WhiteBooks live draft save is available
- if explicit file payload also exists and `WHITEBOOKS_ENABLE_GSTR9C_FILE_LIVE=True`:
  - WhiteBooks final file request is available

Important:

- `GSTR-9C genhash`
- `GSTR-9C gencert`

are **not** automated in the current product.

## Accepted Payload Keys

The runtime currently checks multiple key locations to support explicit payload attachment.

## GSTR-7

### Final file payload

Accepted keys:

- top-level:
  - `whitebooks_gstr7_file_payload`
  - `gstr7_file_payload`
- nested under `summary_snapshot["whitebooks"]`:
  - `gstr7_file_payload`
  - `file_payload`

Expected use:

- provider-ready request body for WhiteBooks `GSTR-7 retfile`

## GSTR-9

### Save payload

Accepted keys:

- top-level:
  - `whitebooks_gstr9_save_payload`
  - `gstr9_save_payload`
- nested under `summary_snapshot["whitebooks"]`:
  - `gstr9_save_payload`
  - `save_payload`

### File payload

Accepted keys:

- top-level:
  - `whitebooks_gstr9_file_payload`
  - `gstr9_file_payload`
- nested under `summary_snapshot["whitebooks"]`:
  - `gstr9_file_payload`
  - `file_payload`

Expected use:

- provider-ready request body for WhiteBooks `GSTR-9 retsave`
- provider-ready request body for WhiteBooks `GSTR-9 retfile`

## GSTR-9C

### Save payload

Accepted keys:

- top-level:
  - `whitebooks_gstr9c_save_payload`
  - `gstr9c_save_payload`
- nested under `summary_snapshot["whitebooks"]`:
  - `gstr9c_save_payload`
  - `save_payload`

### File payload

Accepted keys:

- top-level:
  - `whitebooks_gstr9c_file_payload`
  - `gstr9c_file_payload`
- nested under `summary_snapshot["whitebooks"]`:
  - `gstr9c_file_payload`
  - `file_payload`

Expected use:

- provider-ready request body for WhiteBooks `GSTR-9C retsave`
- provider-ready request body for WhiteBooks `GSTR-9C retfile`

## Stage Behavior

### Save-only case

If save is supported and the save payload exists, but file payload is missing or file flag is off:

- the filing can move to `draft_saved`
- the system will not falsely imply final filing

### Save + file case

If both save and file payloads exist and the file flag is enabled:

- the filing can move through:
  - `draft_saved`
  - `file_requested`

At that point the system still depends on:

- provider response evidence
- status sync
- ARN confirmation, where applicable

## What The Product Does Not Do Yet

The current runtime does **not**:

- auto-generate GSTR-7 final liability fields from native summaries
- auto-generate GSTR-9 annual WhiteBooks save/file payloads from native annual summaries
- auto-generate GSTR-9C certification payloads from native comparison summaries
- auto-run `GSTR-9C genhash`
- auto-run `GSTR-9C gencert`

## Operational Guidance

Use this contract when validating WhiteBooks-backed annual/TDS flows:

1. Prepare the return normally in the product.
2. Attach the explicit provider-ready payloads into `summary_snapshot`.
3. Enable only the required feature flags.
4. Start filing and confirm the expected staged behavior:
   - manual
   - draft save only
   - draft save + final file request

If a return does not move live as expected, check in this order:

1. correct return type
2. correct feature flag
3. correct payload key name
4. payload attached at the expected `summary_snapshot` location
5. provider auth/session readiness

## Related Documents

- [gstr7-gstr9-gstr9c-whitebooks-integration-readiness.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr7-gstr9-gstr9c-whitebooks-integration-readiness.md:1)
- [gstr9-gstr9c-status.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-gstr9c-status.md:1)
- [current-execution-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/current-execution-backlog.md:1)
