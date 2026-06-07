# GSTR-1 QA High-Level Checklist

## Purpose

Use this checklist to validate the current GSTR-1 implementation in layers.

This file stays high-level on purpose.

The first case in this checklist is expanded in detail in:

- [gstr1-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr1-qa-detailed-scenarios.md:1)

Use this sample bundle for the detailed run:

- [10_gstr1_extended_sections_uat](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/README.md:1)

## Suggested Run Order

1. `G1-HL-001` Extended section import and return preparation
2. `G1-HL-002` GSTR-1 workbook verification
3. `G1-HL-003` Returns, approvals, and operations preview verification
4. `G1-HL-004` Filing payload and provider save verification
5. `G1-HL-005` Controlled live provider lifecycle verification

## High-Level Cases

## G1-HL-001 Extended Section Import And Return Preparation

### Goal

Confirm that the newly implemented GSTR-1 section inputs can be imported and prepared together in one period.

### Scope

- B2B
- B2CL
- B2CS
- export / SEZ / deemed-export sales
- advance received
- advance adjusted
- amendment sales
- e-commerce-linked sales
- registered notes
- registered note amendments

### Exit Criteria

- all files import successfully
- GSTR-1 prepares successfully
- readiness does not show unexpected blockers for the good bundle

## G1-HL-002 GSTR-1 Workbook Verification

### Goal

Confirm that workbook export reflects the implemented sections and that key sheets are non-empty where expected.

### Scope

- tables 4, 5, 6, 7, 9, 11A, 11B, 14, 15
- amendment and e-commerce coverage
- advances coverage

### Exit Criteria

- workbook downloads successfully
- expected sheets contain rows
- expected key values match the prepared return

## G1-HL-003 Returns, Approvals, And Operations Preview Verification

### Goal

Confirm that the same prepared GSTR-1 truth is visible in:

- `/returns`
- `/approvals`
- `/operations`

### Scope

- top-line totals
- amendment review block
- e-commerce review block
- raw summary snapshot

### Exit Criteria

- all three surfaces show the same return totals
- amendment and e-commerce review blocks are visible and populated

## G1-HL-004 Filing Payload And Provider Save Verification

### Goal

Confirm that the implemented sections are represented in the WhiteBooks payload for save/file operations.

### Scope

- `b2b`
- `b2cl`
- `b2cs`
- `b2ba`
- `b2cla`
- `b2csa`
- `cdnr`
- `cdnra`
- `at`
- `txpd`
- `exp`
- `expa`

### Exit Criteria

- payload evidence can be captured
- expected section names are present
- obvious section misrouting is not observed

## G1-HL-005 Controlled Live Provider Lifecycle Verification

### Goal

Confirm that a prepared and approved return using the extended-section bundle can move through the guarded provider flow.

### Scope

- OTP verification
- draft save
- proceed-to-file where enabled
- file request / resync where enabled

### Exit Criteria

- provider stage changes are visible in the UI
- saved proof is captured
- support / retry / resync actions remain usable if needed

## Current Note

At this stage:

- `G1-HL-001` should be executed in detail first
- once that passes in UAT, convert `G1-HL-002` onward into their own detailed scripts
