# GSTR-9C QA High-Level Checklist

Use this after the annual monthly-return foundation is already in place for the same:

- workspace
- client
- GSTIN
- financial year context

This first checklist is intentionally aligned to the current MVP slice of `GSTR-9C`:

- annual comparison preparation
- annual readiness
- in-app review workspace
- manual annual filing tracking

## Scope

- dependency on prepared `GSTR-9`
- books vs `GSTR-9` annual comparison
- annual readiness behavior
- returns UI review
- approvals / operations review routing
- manual annual filing record behavior

## Related Files

- [phase-2-gstr9-gstr9c-gstr2x-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/phase-2-gstr9-gstr9c-gstr2x-plan.md:1)
- [gstr9-implementation-backlog.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-implementation-backlog.md:1)
- [gstr9c-qa-detailed-scenarios.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9c-qa-detailed-scenarios.md:1)
- [gstr9-review/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/gstr9-review/page.tsx:1)
- [gstr9c-review/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/gstr9c-review/page.tsx:1)

## High-Level Cases

### `G9C-HL-001 Dependency Gate`

Validate that `GSTR-9C` cannot be prepared cleanly unless a `GSTR-9` annual return already exists for the selected context.

### `G9C-HL-002 Annual Comparison Preparation`

Validate that `Prepare GSTR-9C` succeeds once `GSTR-9` exists and produces a comparison snapshot between:

- annual books totals
- annual `GSTR-9` totals

### `G9C-HL-003 Review Workspace`

Validate that `/returns/gstr9c-review` opens and shows:

- `Overview`
- `Books`
- `GSTR-9 Base`
- `Comparison`
- `Exceptions`

### `G9C-HL-004 Manual Filing Tracking`

Validate that starting a filing for `GSTR-9C`:

- does not require OTP
- opens a manual annual filing record
- supports later `Mark filed` usage like the current `GSTR-9` flow

### `G9C-HL-005 Cross-Workflow Review Routing`

Validate that approvals and operations routes open the full `GSTR-9C` review workspace instead of treating the return as `GSTR-1` or `GSTR-3B`.
