# GSTR-9 QA Detailed Scenarios

## Scope

This detailed script expands only the first high-level case:

- `G9-HL-001 Annual Preparation And Readiness Verification`

After this passes, use it as the base for expanding the remaining high-level cases into detailed scripts.

## Related Files

- [gstr9-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-qa-high-level-checklist.md:1)
- [gstr9-gstr9c-status.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9-gstr9c-status.md:1)
- [phase-2-gstr9-gstr9c-gstr2x-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/phase-2-gstr9-gstr9c-gstr2x-plan.md:1)

## UAT Preconditions

- backend and frontend are running
- tester has access to one workspace, one client, one GSTIN, and annual source periods in the same financial year
- monthly `GSTR-1` and `GSTR-3B` returns have already been prepared for the year under review
- the selected annual review period is modifiable and not locked

## Dependency Model

There is no separate raw-file bundle for `GSTR-9` in this first pass.

`GSTR-9` is built from already prepared monthly annual source returns:

- monthly `GSTR-1`
- monthly `GSTR-3B`

So this UAT flow assumes the monthly return foundation is already present.

Best practice for UAT:

- use a year-end / March compliance period for the annual review context
- if a non-year-end period is selected, readiness should warn about that annual anchor choice

## Detailed Case

## G9-DT-001 Annual GSTR-9 Preparation And Readiness

### Objective

Prove that the current `GSTR-9` implementation works end to end for:

- annual aggregation
- annual readiness
- annual review visibility
- annual workbook export
- annual operational/manual filing entry

### Preconditions

- the same workspace/client/GSTIN has monthly prepared `GSTR-1` returns for the financial year
- the same workspace/client/GSTIN has monthly prepared `GSTR-3B` returns for the financial year
- the selected annual review period belongs to that same financial year

### Steps

1. Open `/returns`
2. Select the target workspace, client, GSTIN, and annual review period
3. Observe the `GSTR-9` readiness card
4. Click `Prepare GSTR-9`
5. Open the prepared `GSTR-9` return
6. Open `GSTR-9 Review`
7. Review the annual tabs
8. Export the `GSTR-9` workbook
9. Open the same return from `/approvals` or `/operations`
10. Start the annual filing record

### Expected Readiness Outcomes

Before preparation, the `GSTR-9` readiness card should reflect annual truth:

- it should consider monthly `GSTR-1` and `GSTR-3B` availability
- it should surface missing source months
- it should surface blocked or failed annual source months
- it should warn if the selected period is not year-end

Representative readiness metrics should include:

- `financial_year`
- `gstr1_prepared_month_count`
- `gstr3b_prepared_month_count`
- `missing_source_month_count`
- `blocked_source_month_count`
- `failed_source_month_count`
- `filed_source_month_count`

### Expected Preparation Outcomes

After preparing `GSTR-9`, the prepared return should show:

- `return_type = gstr9`
- `summary_version = gstr9.annual.v1`

The snapshot should include top-level blocks:

- `outward_summary`
- `itc_summary`
- `liability_summary`
- `annual_sections`
- `source_months`
- `warnings_summary`
- `source_trace`

### Expected Annual Review Workspace Outcomes

On `/returns/gstr9-review`, the page should show:

#### Overview

- annual taxable value
- annual tax liability
- claim-ready ITC
- source months available

#### Outward

- annual outward totals from the prepared annual rollup

#### ITC

- annual books ITC
- claim-ready ITC
- annual ITC summary fields present in the snapshot

#### Source Months

- expected months
- available months
- missing months
- blocked months
- failed months
- filed months

#### Exceptions

- annual warnings and blockers
- source dependency signals

### Expected Linked Source Return Behavior

The `Linked source returns` section should:

- list monthly source returns feeding the annual rollup
- include both `GSTR-1` and `GSTR-3B` where present
- show correct period label, return type, and status

### Expected Workbook Outcomes

The exported `GSTR-9` workbook should contain populated sheets for:

- `Summary`
- `Annual Outward`
- `Annual ITC`
- `Source Months`
- `Linked Source Returns`
- `Warnings`
- `Source Exceptions`

The workbook should be logically aligned to the prepared annual snapshot:

- summary values should match the in-app annual review
- source-month counts should match the in-app review

### Expected Returns UI Outcomes

On `/returns`, after opening the prepared `GSTR-9`:

- the return should be clearly treated as an annual return
- annual status should be visible
- annual review entry should open the dedicated `GSTR-9` review page
- annual export should download the `GSTR-9` workbook

### Expected Approvals And Operations Preview Outcomes

After opening the same return from `/approvals` or `/operations`:

- the full review link should route to `GSTR-9` review
- annual wording should be used in the helper text
- preview should not route into `GSTR-1` or `GSTR-3B` review by mistake

### Expected Filing Outcomes

When starting filing for `GSTR-9`:

- no OTP should be required
- a manual annual filing record should open
- the filing flow should instruct the user to complete filing manually and then capture ARN using `Mark filed`

### Pass / Fail Rules

Pass this detailed case only if:

- `GSTR-9` readiness reflects annual dependency truth
- `GSTR-9` prepares successfully
- the review page opens and shows annual sections cleanly
- the workbook downloads and matches the in-app annual snapshot
- approvals and operations route correctly into annual review
- the filing record starts as a manual annual filing flow

Fail this detailed case if:

- readiness does not detect missing annual dependencies
- annual preparation fails unexpectedly
- annual review routing opens the wrong review page
- workbook values materially diverge from the prepared return
- the annual filing path tries to use OTP/provider monthly filing behavior

## Notes For The Next Expansion

After `G9-DT-001` passes:

1. convert workbook verification into its own detailed script
2. convert approvals / operations routing into its own detailed script
3. convert annual manual filing tracking into its own detailed script
4. use the GSTR-9 annual pass as the prerequisite base for fuller `GSTR-9C` UAT
