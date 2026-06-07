# GSTR-1 QA Detailed Scenarios

## Scope

This detailed script expands only the first high-level case:

- `G1-HL-001 Extended Section Import And Return Preparation`

After this passes, use it as the base for expanding the remaining high-level cases into detailed scripts.

## Related Files

- [gstr1-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr1-qa-high-level-checklist.md:1)
- [10_gstr1_extended_sections_uat/README.md](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/README.md:1)

## UAT Preconditions

- backend and frontend are running
- tester has access to one workspace, one client, one GSTIN, and one open compliance period
- the selected period is modifiable and not locked
- no conflicting old imports exist for the same exact scenario unless the tester is intentionally re-running the pack

## Bundle Used

Use this bundle:

- [sales_gstr1_extended_sections.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/sales_gstr1_extended_sections.csv)
- [sales_gstr1_amendments.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/sales_gstr1_amendments.csv)
- [advance_received_gstr1_extended_sections.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/advance_received_gstr1_extended_sections.csv)
- [advance_adjusted_gstr1_extended_sections.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/advance_adjusted_gstr1_extended_sections.csv)
- [credit_note_gstr1_registered.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/credit_note_gstr1_registered.csv)
- [credit_note_gstr1_amendments_registered.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/credit_note_gstr1_amendments_registered.csv)
- [debit_note_gstr1_registered.csv](/Users/ansh/Documents/Gst-Compliance/docs/sample-files/scenario-bundles/10_gstr1_extended_sections_uat/debit_note_gstr1_registered.csv)

## Detailed Case

## G1-DT-001 Extended Section Import And Return Preparation

### Objective

Prove that the currently implemented GSTR-1 section coverage works end to end in one period for:

- B2B
- B2CL
- B2CS
- exports
- SEZ / deemed-export style rows
- advances
- amendment rows
- e-commerce-linked rows
- registered credit/debit notes

### Upload Order

1. Upload `sales_gstr1_extended_sections.csv` as `Sales`
2. Upload `sales_gstr1_amendments.csv` as `Sales`
3. Upload `advance_received_gstr1_extended_sections.csv` as `Advance received`
4. Upload `advance_adjusted_gstr1_extended_sections.csv` as `Advance adjusted`
5. Upload `credit_note_gstr1_registered.csv` as `Credit note`
6. Upload `credit_note_gstr1_amendments_registered.csv` as `Credit note`
7. Upload `debit_note_gstr1_registered.csv` as `Debit note`
8. Open `/returns`
9. Prepare `GSTR-1`
10. Open the prepared return modal
11. Export the GSTR-1 workbook
12. Open the same return from `/approvals` or `/operations` preview

### Expected Import Outcomes

#### File 1: `sales_gstr1_extended_sections.csv`

Expected:

- batch processes successfully
- `8` valid rows are created
- row coverage includes:
  - `1` B2B
  - `1` B2CL
  - `1` standard B2CS
  - `2` e-commerce-linked B2CS rows
  - `1` export row
  - `1` SEZ row
  - `1` deemed-export row

#### File 2: `sales_gstr1_amendments.csv`

Expected:

- batch processes successfully
- `5` valid rows are created
- row coverage includes:
  - `1` B2BA-style amendment
  - `1` B2CLA-style amendment
  - `1` B2CSA-style amendment
  - `1` EXPA-style amendment
  - `1` e-commerce amendment for table `14A` style review

#### File 3: `advance_received_gstr1_extended_sections.csv`

Expected:

- batch processes successfully
- `1` valid row is created
- the row is normalized as `advance_received`

#### File 4: `advance_adjusted_gstr1_extended_sections.csv`

Expected:

- batch processes successfully
- `1` valid row is created
- the row is normalized as `advance_adjusted`

#### File 5: `credit_note_gstr1_registered.csv`

Expected:

- batch processes successfully
- `1` valid row is created
- the row contributes to registered note coverage

#### File 6: `credit_note_gstr1_amendments_registered.csv`

Expected:

- batch processes successfully
- `1` valid row is created
- original-document fields are preserved
- the row contributes to amendment note coverage

#### File 7: `debit_note_gstr1_registered.csv`

Expected:

- batch processes successfully
- `1` valid row is created
- the row contributes to registered note coverage

### Expected Prepared Return Totals

After preparing `GSTR-1`, the return should show these top-level `outward_supplies` values:

- `b2b_taxable_value` = `100000.00`
- `b2b_tax_amount` = `18000.00`
- `b2c_taxable_value` = `332000.00`
- `b2c_tax_amount` = `59760.00`
- `credit_note_taxable_value` = `1500.00`
- `credit_note_tax_amount` = `270.00`
- `debit_note_taxable_value` = `1500.00`
- `debit_note_tax_amount` = `270.00`
- `advance_received_taxable_value` = `10000.00`
- `advance_received_tax_amount` = `1800.00`
- `advance_adjusted_taxable_value` = `4000.00`
- `advance_adjusted_tax_amount` = `720.00`
- `export_taxable_value` = `52000.00`
- `export_tax_amount` = `9360.00`
- `amendment_taxable_value` = `300500.00`
- `amendment_tax_amount` = `54090.00`
- `ecommerce_taxable_value` = `12000.00`
- `ecommerce_tax_amount` = `2160.00`
- `total_taxable_value` = `801000.00`
- `total_tax_amount` = `144180.00`
- `document_count` = `18`

### Expected Prepared Section Summary

The prepared `sections` payload should show at least:

- `b2b.document_count` = `1`
- `b2b.taxable_value` = `100000.00`
- `b2cl.document_count` = `1`
- `b2cl.taxable_value` = `300000.00`
- `b2cs.document_count` = `3`
- `b2cs.taxable_value` = `32000.00`
- `cdnr.document_count` = `3`
- `cdnr.taxable_value` = `3000.00`
- `advances_received.row_count` = `1`
- `advances_received.taxable_value` = `10000.00`
- `advances_adjusted.row_count` = `1`
- `advances_adjusted.taxable_value` = `4000.00`
- `exports.row_count` = `3`
- `exports.taxable_value` = `52000.00`
- `amendments.row_count` = `6`
- `amendments.taxable_value` = `300500.00`
- `ecommerce.row_count` = `2`
- `ecommerce.taxable_value` = `12000.00`

Important interpretation note:

- the `amendments` and `ecommerce` sections are review buckets and can overlap with other reporting views
- SEZ and deemed-export rows are counted in the prepared `exports` section, but in provider payload mapping some of those rows flow through `b2b` with special invoice types

### Expected Returns UI Outcomes

On `/returns`, after opening the prepared return:

- the `Outward supplies` card grid should show the totals listed above
- the `GSTR-1 section review` block should be visible
- the section review cards should show non-zero values for:
  - `B2B`
  - `B2CL`
  - `B2CS`
  - `Exports / SEZ / deemed`
  - `Advances received`
  - `Advances adjusted`
  - `Amendments`
  - `E-commerce`
  - `CDNR`
- the `Amendment review` table should show rows referencing:
  - `G1S-1001`
  - `G1S-1002`
  - `G1S-1003`
  - `G1S-1006`
  - `G1S-1004`
  - `CN-4001`
- the `E-commerce review` table should show:
  - operator GSTIN `29ECOM1234F1Z5`
  - one row for `Table 14`
  - one row for `Table 15`

### Expected Approvals And Operations Preview Outcomes

After opening the same return from `/approvals` or `/operations`:

- top-line taxable value should still show `801000.00`
- top-line tax amount should still show `144180.00`
- the `GSTR-1 section review` block should be visible
- the amendment and e-commerce review tables should match the `/returns` view
- the raw summary snapshot should contain `sections.amendments` and `sections.ecommerce`

### Expected Workbook Outcomes

The exported GSTR-1 workbook should contain non-empty data in at least these sheets:

- `4 4 B2B`
- `5 5 B2CL (Large)`
- `6 6 Exports Deemed Exports SEZ`
- `7 7 B2CS`
- `9 9 Amendments (4 5 6)`
- `11A Advances`
- `11B Advances`
- `14 14 Supplier ECO GSTIN-wise S`
- `14A 14A Amendments to Table 14`
- `15 15 ECO Operator GSTIN-wise B`

Representative sheet checks:

- table `4` should contain `G1S-1001`
- table `5` should contain `G1S-1002`
- table `6` should contain `G1S-1006`, `G1S-1007`, and `G1S-1008`
- table `9` should contain amendment rows for `G1A-2001` through `G1A-2005` plus the amendment note row
- table `11A` should contain `AR-3001`
- table `11B` should contain `AA-3001`
- table `14` should contain GSTIN `29ECOM1234F1Z5`
- table `14A` should contain the amendment linked to `G1S-1004`
- table `15` should contain GSTIN `29ECOM1234F1Z5`

### Expected Filing Payload Outcomes

If payload evidence is captured for this return, it should include these section keys in the save or section-summary view where applicable:

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

Representative payload expectations:

- `b2cl` should contain `G1S-1002`
- `b2ba` should contain `G1A-2001`
- `b2cla` should contain `G1A-2002`
- `b2csa` should contain `G1A-2003` and the e-commerce amendment path
- `at` should contain the advance-received row
- `txpd` should contain the advance-adjusted row
- `exp` should contain the base export row
- `expa` should contain `G1A-2004`
- amendment invoice payloads should carry:
  - `oinum`
  - `oidt`
  - `ofp`
- e-commerce-linked payload rows should carry:
  - `etin`

### Pass / Fail Rules

Pass this detailed case only if:

- all files import successfully
- GSTR-1 prepares successfully
- returns UI totals match the expected totals above
- amendment and e-commerce review blocks are visible
- workbook sheets listed above are populated
- payload evidence, if captured, contains the expected implemented section buckets

Fail this detailed case if:

- any import file is rejected unexpectedly
- prepared totals diverge materially from the expected values above
- amendment rows are missing original-document references
- e-commerce rows are missing operator GSTIN in review or payload evidence
- workbook or payload routing places a section in the wrong bucket

## Notes For The Next Expansion

After `G1-DT-001` passes:

1. convert workbook verification into its own detailed script
2. convert preview-surface verification into its own detailed script
3. convert provider lifecycle verification into its own detailed script
4. add a second detailed pack for provider/UAT edge cases such as resync, delayed filing confirmation, and mismatch handling
