# 10 GSTR-1 Extended Sections UAT Bundle

Purpose:

- validate the newly implemented GSTR-1 sections beyond the basic happy path
- exercise B2CL, advances, exports, amendments, and e-commerce-linked rows
- give QA and UAT one practical dataset for return preparation, review UI, workbook export, and filing payload checks

Files:

- `sales_gstr1_extended_sections.csv`
- `sales_gstr1_amendments.csv`
- `advance_received_gstr1_extended_sections.csv`
- `advance_adjusted_gstr1_extended_sections.csv`
- `credit_note_gstr1_registered.csv`
- `credit_note_gstr1_amendments_registered.csv`
- `debit_note_gstr1_registered.csv`

Recommended upload order:

1. Upload `sales_gstr1_extended_sections.csv` as `Sales`
2. Upload `sales_gstr1_amendments.csv` as `Sales`
3. Upload `advance_received_gstr1_extended_sections.csv` as `Advance received`
4. Upload `advance_adjusted_gstr1_extended_sections.csv` as `Advance adjusted`
5. Upload `credit_note_gstr1_registered.csv` as `Credit note`
6. Upload `credit_note_gstr1_amendments_registered.csv` as `Credit note`
7. Upload `debit_note_gstr1_registered.csv` as `Debit note`
8. Prepare `GSTR-1`
9. Review the return in `Returns`, `Approvals`, and `Operations`
10. Export the `GSTR-1` workbook

What this bundle is good for:

- B2B, B2CL, and B2CS section coverage
- export / SEZ / deemed-export coverage
- advance receipt and adjustment coverage
- amendment coverage for B2B, B2CL, B2CS, export, and note paths
- e-commerce section coverage for table 14, table 15, and table 14A style review

Expected high-level outcomes:

- all imports should process successfully
- GSTR-1 should prepare successfully
- the return review UI should show non-empty `Amendments` and `E-commerce` section review blocks
- the workbook should contain non-empty rows in tables `5`, `6`, `9`, `11A`, `11B`, `14`, and `15`
- the filing payload should contain the implemented section buckets for this dataset

Important note:

- this bundle is intentionally GSTR-1 focused and does not include purchase or GSTR-2B data
- unregistered note amendment coverage such as `CDNURA` is not included here because the current note import parser requires recipient GSTIN
- use the matching QA docs for exact expected totals and section-by-section assertions
