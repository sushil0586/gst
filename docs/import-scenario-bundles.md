# GST Import Scenario Bundles

Use these bundles to test the import center, template mapping, transaction review, reconciliation, return preparation, and guardrails without assembling files manually.

Location:

- source folders: `docs/sample-files/scenario-bundles/`
- ready zip bundles: `docs/sample-files/zips/`

Recommended usage:

1. Pick one bundle.
2. Read that bundle's `README.md`.
3. Upload the files in the order shown.
4. Validate the expected outcomes in the UI.

## Bundle Index

### `01_happy_path_basic.zip`

Use for:

- first smoke test of sales + purchase + GSTR-2B
- basic return preparation
- basic reconciliation

Includes:

- sales register
- purchase register
- GSTR-2B register
- Excel copy of the sales file

### `02_reconciliation_exceptions.zip`

Use for:

- matched rows
- tax mismatch rows
- missing in books
- missing in portal
- document-number mismatch style scenarios

Includes:

- purchase register with deliberate exception cases
- GSTR-2B register with deliberate exception cases

### `03_import_validation_failures.zip`

Use for:

- invalid GSTIN
- missing dates
- invalid numeric values
- duplicate invoice lines
- conflicting invoice context

Includes:

- three separate bad import files

### `04_template_mapping_custom_headers.zip`

Use for:

- create template flow
- custom header mapping
- save template
- reuse template
- Excel header detection

Includes:

- custom-header sales CSV
- custom-header sales XLSX

### `05_filing_metadata_rich.zip`

Use for:

- HSN
- UQC
- quantity
- service flag
- supply category
- e-commerce GSTIN
- richer GSTR-1 workbook behavior

### `06_multi_line_invoice.zip`

Use for:

- repeated invoice numbers in the same file
- multi-line invoice aggregation
- line-item aware HSN and quantity behavior

### `07_wrong_import_type_guardrails.zip`

Use for:

- filename-based import type protection
- frontend/backend mismatch warning behavior

### `08_credit_debit_notes.zip`

Use for:

- credit note imports
- debit note imports
- note document coverage in exports and return prep

### `09_portal_ready_filing_bundle.zip`

Use for:

- the closest practical filing-grade scenario in the current product
- richer GSTR-1 workbook testing
- return testing with metadata-rich sales, purchases, 2B, and notes

Includes:

- metadata-rich sales register
- metadata-rich purchase register
- GSTR-2B register
- credit note register
- debit note register
- Excel copies of sales and purchase files

### `10_gstr1_extended_sections_uat/`

Use for:

- focused GSTR-1 UAT of the newly implemented sections
- B2CL, advances, exports, amendments, and e-commerce review
- returns, approvals, operations, workbook, and filing-payload consistency checks

Includes:

- extended-section sales register
- amendment sales register
- advance received register
- advance adjusted register
- registered credit note register
- registered amendment credit note register
- registered debit note register

Important note:

- this bundle currently exists as a source folder
- if you want a zip copy, regenerate bundles or package this folder directly for UAT handoff

### `11_gstr3b_itc_reconciliation_uat/`

Use for:

- GSTR-3B UAT after the extended GSTR-1 pack is already loaded
- purchase vs GSTR-2B reconciliation bucket validation
- ITC readiness, pending review, pending 2B, vendor follow-up, and blocked ITC checks

Includes:

- purchase register for GSTR-3B ITC testing
- GSTR-2B register for matching and mismatch testing

Important note:

- this bundle is intended to run on top of the same period already used for `10_gstr1_extended_sections_uat`
- it currently exists as a source folder

### `12_gstr7_tds_uat/`

Use for:

- GSTR-7 MVP UAT
- TDS deducted import
- deductee-wise monthly grouping
- GSTR-7 review page and workbook export checks
- readiness warning visibility for duplicate references and zero-value rows

Includes:

- clean TDS deducted register
- warning-focused TDS deducted register

Important note:

- this bundle is intentionally limited to the current GSTR-7 MVP
- it currently exists as a source folder

## Regenerating Bundles

If you add or change scenario files, rebuild the generated `.xlsx` copies and zip bundles:

```bash
source venv/bin/activate
python tools/build_import_sample_bundles.py
```

## Important Testing Reminder

For all bundles except the explicit guardrail cases:

- choose the correct workspace, client, GSTIN, and compliance period first
- select the correct import type before upload
- use `CSV` for `.csv`
- use `Excel` for `.xlsx`
