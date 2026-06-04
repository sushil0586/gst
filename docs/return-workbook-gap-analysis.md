# Return Workbook Gap Analysis

Last updated: 2026-05-26

This document records the current contract gap between:

- the product-generated statutory workbook exports
- real sample workbooks found on the local machine

It is the baseline for future filing-grade alignment work.

## Sample Files Reviewed

### Current product export

- `/Users/ansh/Downloads/gstr1-2026-04.xlsx`

### Real GSTR-1 filing-style sample

- `/Users/ansh/Downloads/gstr1_2026-04-01_2027-03-31.xlsx`
- `/Users/ansh/Downloads/gstr1_2026-04-01_2027-03-31 (1).xlsx`

### GSTR-3B status

- No actual GSTR-3B return workbook sample was found yet.
- The available file `/Users/ansh/Downloads/gstr1_vs_gstr3b_2026-04-01_2027-03-31.xlsx` is a reconciliation workbook, not a return workbook contract.

## Contract Tool

Use:

```bash
source venv/bin/activate
python tools/return_workbook_contract.py /path/to/current.xlsx --compare /path/to/sample.xlsx
python tools/return_workbook_contract.py /path/to/current.xlsx --compare /path/to/sample.xlsx --json
```

This inspects:

- sheet names
- first non-empty row
- sample rows
- sheet-level differences

## GSTR-1 Findings

## 1. Current export is operational, not filing-style

Current product workbook uses business-friendly sheet names:

- `Summary`
- `B2B`
- `B2CL`
- `B2CS`
- `CDNR`
- `CDNUR`
- `EXP`
- `AT`
- `TXPD`
- `EXEMP`
- `HSN`
- `DOCS`

The reviewed sample workbook uses filing-style and section-numbered sheets such as:

- `Section Summary`
- `HSN Summary`
- `Document Summary`
- `Nil Exempt`
- `Validations`
- `1_3_1_3 1 2 3 Taxpayer Details`
- `4 4 B2B`
- `5 5 B2CL (Large)`
- `6 6 Exports Deemed Exports SEZ`
- `7 7 B2CS`
- `8 8 Nil Rated Exempt Non-GST`
- `9 9 Amendments (4 5 6)`
- `10 10 CDNUR`
- `11 11 Advances and Adjustments`
- `11A Advances`
- `11B Advances`
- `12 12 HSN Summary`
- `13 13 Documents Issued`
- `14 14 Supplier ECO GSTIN-wise S`
- `14A 14A Amendments to Table 14`
- `15 15 ECO Operator GSTIN-wise B`
- `15A 15A Amendments to Table 15`

Impact:

- our workbook is understandable and usable internally
- it is not yet shaped like the richer filing-style workbook users may expect

## 2. Sheet naming and taxonomy are different

The comparison tool reports no common sheet names between the two workbooks.

This means alignment is not a minor header fix. It requires:

- a target workbook taxonomy decision
- a section mapping layer
- likely a second export mode or a migration of the current workbook contract

## 3. Sample workbook carries richer structural data

The filing-style GSTR-1 sample contains sections we do not currently model/export fully:

- taxpayer details sheet
- validation sheet
- nil/exempt summary sheet
- amendments sheets
- separate advances sheets
- ECO/operator sheets
- richer document and HSN summaries

Impact:

- our current export can support operational review
- it cannot yet claim parity with a full filing-style workbook

## 4. B2B/B2CS row contracts differ materially

Current B2B contract is concise and business-oriented, for example:

- recipient GSTIN
- receiver name
- invoice number/date
- invoice value
- place of supply
- reverse charge
- invoice type
- rate
- taxable value
- cess
- tax amount

The filing-style sample B2B contract includes more detailed and system-oriented fields:

- invoice id
- customer name
- customer GSTIN
- place of supply state code
- taxability
- HSN/SAC
- is service
- separate reported amounts
- reverse charge contract JSON

Current B2CS contract also differs from the sample:

- current export uses `Type`, `Place Of Supply`, `Rate`, `Taxable Value`, `Cess Amount`, `E-Commerce GSTIN`, `Tax Amount`
- sample uses `Place Of Supply State Code`, `Gst Rate`, `Taxability`, `Taxability Label`, tax amounts by head

Impact:

- current export is useful
- exact filing-style compatibility needs richer source capture and section-specific mapping

## 5. HSN and document summaries are simplified today

Current product HSN output:

- `HSN`
- `Description`
- `UQC`
- `Total Quantity`
- `Total Value`
- `Taxable Value`
- tax heads

Sample workbook uses:

- `HSN/SAC`
- `Service`
- `GST Rate`
- `Qty`
- tax heads
- document counts in a separate summary view

Current product document output:

- natural language document type labels
- min/max number
- total/cancelled

Sample workbook uses:

- coded doc type
- doc type label
- doc code
- min/max
- total/cancelled

Impact:

- HSN and DOCS need contract-level redesign for parity

## 6. Many downloaded GSTR-1 files are empty placeholders

Most `gstr1_2026-01-01_2026-01-01*.xlsx` files in Downloads are `0B` empty files.

Implication:

- they should not be used as reference contracts
- the non-empty 2026-04 sample is the useful baseline

## What This Means For Product Direction

The current export design is still valid as:

- an auditable outward supply workbook
- a draft review workbook
- an internal SaaS report

But a true filing-grade export will need:

1. exact target sheet naming
2. exact target column ordering
3. explicit blank-info sheet behavior
4. richer imported metadata
5. validations before export

## Recommended Next Implementation Slice

### Phase B1

Align GSTR-1 to the sample workbook structure without trying to solve every section at once.

Suggested order:

1. Rename/restructure top-level sheets to match target taxonomy
2. Align these sections first:
   - taxpayer details
   - section summary
   - B2B
   - B2CS
   - HSN summary
   - documents issued
3. Add explicit `Info / No rows for selected scope` sheets for unsupported sections instead of generic blank tables
4. Add a `Validations` sheet populated from export-readiness checks

### Phase C remains blocked

GSTR-3B filing-style alignment should wait until a real sample workbook is available.
