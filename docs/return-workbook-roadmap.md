# Return Workbook Roadmap

This document defines how GSTR-1 and GSTR-3B workbook exports should evolve from "useful draft workbooks" into filing-grade SaaS outputs.

## Engineering Principles

- Keep generic report exports separate from statutory return workbooks.
- Keep GSTR-1 and GSTR-3B builders isolated in one service module.
- Treat sheet names, column order, and mandatory blank columns as a contract.
- Prefer explicit pre-export validation over silent assumptions.
- Export every filing workbook with an auditable source trail.
- Add data-capture requirements at the import layer instead of patching exports repeatedly.

## Current State

- Generic return summary export remains in `apps/common/services/exports.py`.
- Statutory workbook builders live in `apps/common/services/return_workbooks.py`.
- Returns UI selects workbook mode by active return type.

## Phases

### Phase A: Contract Baseline

- Collect real non-empty sample workbooks for GSTR-1 and GSTR-3B.
- Document exact sheet names, column order, blank columns, and formatting rules.
- Build a gap matrix against current workbook outputs.

### Phase B: GSTR-1 Filing Alignment

- Align B2B, B2CL, B2CS, CDNR, CDNUR, HSN, and DOCS to the chosen reference.
- Add pre-export warnings for missing HSN/UQC/quantity/e-commerce/export metadata.
- Normalize place-of-supply and supply-type handling.

### Phase C: GSTR-3B Filing Alignment

- Align outward supply, ITC, exempt, payment, and interest sections to the chosen reference.
- Replace simplified ITC allocation with head-wise production logic.
- Improve interstate classification and exempt/non-GST derivation.

### Phase D: Data Enrichment At Import Time

- Capture HSN, UQC, quantity, export type, e-commerce GSTIN, and supply category during import.
- Validate these fields early so exports become deterministic.

### Phase E: Export Readiness Controls

- Add readiness checks before export:
  - missing data
  - unresolved reconciliation impact
  - inconsistent import mix
  - locked/approved/filed context rules

### Phase F: Pilot UX Hardening

- Separate export actions for GSTR-1 and GSTR-3B.
- Add user-facing explanations for blank sections and validation blockers.
- Add downloadable source/support packs for CA review.
