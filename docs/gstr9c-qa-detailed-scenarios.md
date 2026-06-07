# GSTR-9C QA Detailed Scenarios

## Scope

This detailed script expands the first `GSTR-9C` high-level case pack:

- `G9C-HL-001`
- `G9C-HL-002`
- `G9C-HL-003`
- `G9C-HL-004`
- `G9C-HL-005`

It is designed for the current MVP slice of `GSTR-9C`, which is:

- annual comparison only
- based on already prepared annual `GSTR-9`
- books vs `GSTR-9` comparison review
- manual operational filing record

It is not yet the final auditor-style `GSTR-9C` workflow.

## Related Files

- [gstr9c-qa-high-level-checklist.md](/Users/ansh/Documents/Gst-Compliance/docs/gstr9c-qa-high-level-checklist.md:1)
- [phase-2-gstr9-gstr9c-gstr2x-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/phase-2-gstr9-gstr9c-gstr2x-plan.md:1)
- [gstr9-review/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/gstr9-review/page.tsx:1)
- [gstr9c-review/page.tsx](/Users/ansh/Documents/Gst-Compliance/gst-compliance-frontend/src/app/(dashboard)/returns/gstr9c-review/page.tsx:1)

## Data Prerequisite

There is no dedicated standalone `GSTR-9C` import bundle yet.

The current `GSTR-9C` MVP depends on already prepared annual return data. So before running this script, make sure the selected workspace/client/GSTIN context already has:

- monthly `GSTR-1` prepared returns for the financial year you want to review
- monthly `GSTR-3B` prepared returns for the same financial year
- one prepared `GSTR-9` annual return for the selected context

Best practice for UAT:

- use a March / year-end compliance period for the annual review context
- if you use a non-March period, the system may still work, but should warn that the anchor period is not year-end

## Detailed Cases

## G9C-DT-001 Readiness Blocks Without GSTR-9 Anchor

### Objective

Prove that `GSTR-9C` readiness is dependency-aware and does not silently prepare when the annual `GSTR-9` anchor is missing.

### Preconditions

- the selected financial-year context has annual books transactions available
- no `GSTR-9` prepared return exists yet for that selected context

### Steps

1. Open `/returns`
2. Select the target workspace, client, GSTIN, and annual review period
3. Find the `GSTR-9C` readiness card

### Expected Outcome

- the `GSTR-9C` readiness card should be `blocked`
- the primary issue code should include `missing_gstr9_anchor_return`
- `Prepare GSTR-9C` should not be considered cleanly ready

### Pass Criteria

- the user is clearly told that `GSTR-9` must exist first
- the app does not imply `GSTR-9C` can be meaningfully prepared without that dependency

## G9C-DT-002 Prepare GSTR-9C After GSTR-9 Exists

### Objective

Prove that the first `GSTR-9C` snapshot prepares successfully once the annual `GSTR-9` dependency is present.

### Preconditions

- the selected context already has a prepared `GSTR-9`
- annual books transactions exist for the same financial year

### Steps

1. Open `/returns`
2. Confirm `GSTR-9` already exists in the selected context
3. Click `Prepare GSTR-9C`
4. Wait for the success message

### Expected Outcome

A new prepared return should be created with:

- `return_type = gstr9c`
- `summary_version = gstr9c.compare.v1`

The snapshot should include top-level blocks:

- `books_summary`
- `gstr9_summary`
- `comparison_summary`
- `annual_sections`
- `warnings_summary`
- `source_trace`

### Expected Comparison Meaning

The current MVP comparison is:

- books outward taxable vs `GSTR-9` annual taxable
- books outward tax vs `GSTR-9` annual liability
- books ITC vs `GSTR-9` books ITC
- books ITC vs `GSTR-9` claim-ready ITC

### Pass Criteria

- preparation succeeds
- the prepared return appears in `/returns`
- the return is treated as a distinct annual type, not collapsed into `GSTR-9`

## G9C-DT-003 Review Workspace Coverage

### Objective

Prove that the dedicated in-app review page makes the first annual comparison understandable without reading raw JSON only.

### Preconditions

- `GSTR-9C` is already prepared

### Steps

1. From `/returns`, click `Open GSTR-9C Review`
2. Review each tab:
   - `Overview`
   - `Books`
   - `GSTR-9 Base`
   - `Comparison`
   - `Exceptions`

### Expected UI Outcomes

#### Overview

Should show top annual comparison cards such as:

- books outward taxable
- `GSTR-9` outward taxable
- books ITC
- warning count

#### Books

Should show annual books-side totals, including:

- outward taxable value
- outward tax amount
- books ITC
- source month count

#### GSTR-9 Base

Should show the linked annual `GSTR-9` values and anchor reference:

- anchor return id
- annual taxable value
- annual tax liability
- claim-ready ITC

#### Comparison

Should show direct metric-by-metric variance rows.

#### Exceptions

Should show:

- readiness warnings
- anchor dependency posture
- source dependency counts

### Pass Criteria

- all tabs open
- values are present and logically consistent
- the page clearly feels like a dedicated annual comparison workspace, not a fallback monthly screen

## G9C-DT-004 Approvals And Operations Routing

### Objective

Prove that operational review surfaces route `GSTR-9C` into the correct annual comparison workspace.

### Preconditions

- a `GSTR-9C` prepared return exists
- it is visible from approvals or operations context

### Steps

1. Open `/approvals`
2. Open the relevant return preview
3. Use the full review link
4. Repeat the same flow from `/operations`

### Expected Outcome

- the full review link should open `/returns/gstr9c-review`
- the button label should say `Open GSTR-9C review`
- the description should use annual-review wording, not `GSTR-1` or `GSTR-3B` wording

### Pass Criteria

- no misrouting to `gstr9-review`
- no wrong review labels

## G9C-DT-005 Manual Filing Record Behavior

### Objective

Prove that the first `GSTR-9C` operational filing behavior matches the intended annual manual flow.

### Preconditions

- the `GSTR-9C` return is prepared and approved

### Steps

1. Open the prepared `GSTR-9C` from `/returns`
2. Go to the filing controls
3. Start filing

### Expected Outcome

- the app should not require OTP verification for `GSTR-9C`
- the filing record should open as a manual annual filing record
- the user guidance should say this is a manual annual flow
- the user should later be able to capture ARN by using `Mark filed`

### Pass Criteria

- the system treats `GSTR-9C` like the current annual manual lane
- it does not try to force the WhiteBooks monthly live OTP flow

## Practical Reviewer Notes

For this first `GSTR-9C` MVP, reviewers should interpret the output like this:

- this is an annual comparison desk
- it is not yet the final certification workbook
- it is meant to answer:
  - do books and the current annual `GSTR-9` broadly align?
  - are there material outward or ITC variances?
  - are the annual dependencies complete enough to move into a deeper 9C phase?

## Pass Criteria For The Overall MVP Slice

The current `GSTR-9C` MVP passes if:

- readiness blocks when the `GSTR-9` anchor is missing
- preparation succeeds once `GSTR-9` exists
- the dedicated review page opens and shows comparison sections
- approvals and operations deep-link into the correct review page
- annual filing starts as a manual operational record without OTP
