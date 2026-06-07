# GSTR-9 QA High-Level Checklist

## Purpose

Use this checklist to validate the current `GSTR-9` implementation in layers.

This file stays high-level on purpose.

The first case in this checklist is expanded in detail in:

- [gstr9-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-qa-detailed-scenarios.md:1)

## Suggested Run Order

1. `G9-HL-001` Annual preparation and readiness verification
2. `G9-HL-002` GSTR-9 review workspace verification
3. `G9-HL-003` Annual workbook export verification
4. `G9-HL-004` Returns, approvals, and operations annual review routing
5. `G9-HL-005` Manual annual filing tracking verification

## High-Level Cases

## G9-HL-001 Annual Preparation And Readiness Verification

### Goal

Confirm that `GSTR-9` can be prepared from monthly prepared `GSTR-1` and `GSTR-3B` source returns for one financial year.

### Scope

- annual rollup from monthly returns
- source-month coverage
- missing / blocked / failed month signaling
- annual readiness status

### Exit Criteria

- `GSTR-9` prepares successfully
- readiness reflects annual dependency truth
- annual source-month signals are visible and understandable

## G9-HL-002 GSTR-9 Review Workspace Verification

### Goal

Confirm that the dedicated annual review page shows the first in-app annual review surface clearly.

### Scope

- `/returns/gstr9-review`
- overview
- annual outward summary
- annual ITC summary
- source-month coverage
- linked source returns
- annual warnings

### Exit Criteria

- review page opens successfully
- annual values and source-month coverage appear consistently
- warning posture is visible without using raw JSON only

## G9-HL-003 GSTR-9 Workbook Export Verification

### Goal

Confirm that the workbook export reflects the annual snapshot and is suitable for annual review.

### Scope

- summary
- annual outward
- annual ITC
- source months
- linked source returns
- warnings
- source exceptions

### Exit Criteria

- workbook downloads successfully
- expected sheets are populated
- workbook values match the prepared annual return

## G9-HL-004 Returns, Approvals, And Operations Annual Review Routing

### Goal

Confirm that annual review entry points are wired consistently across the product.

### Scope

- `/returns`
- `/approvals`
- `/operations`

### Exit Criteria

- `GSTR-9` routes to the correct annual review page
- labels and helper text use annual review wording

## G9-HL-005 Manual Annual Filing Tracking Verification

### Goal

Confirm that `GSTR-9` participates operationally through the intended manual annual filing flow.

### Scope

- filing record creation
- no OTP dependency
- manual filing guidance
- `Mark filed` flow

### Exit Criteria

- annual filing record opens successfully
- the flow does not attempt the monthly provider OTP lifecycle
- filed status can be tracked manually

## Current Note

At this stage:

- `G9-HL-001` should be executed in detail first
- once that passes in UAT, convert `G9-HL-002` onward into their own detailed scripts
