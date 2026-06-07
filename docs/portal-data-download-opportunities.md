# Portal Data Download Opportunities

## Purpose

This note summarizes which WhiteBooks portal-read APIs create the most customer value, and which ones should be implemented first.

It is intentionally short and product-focused.

## Why Customers Care

When customers say a competitor offers “full client data download,” they usually mean:

- less manual portal login
- less CSV/JSON upload work
- faster month-close workflow
- better confidence that product data matches GST portal data
- easier audit/support when something is disputed later

So the product value is not just “more APIs.” It is:

- fewer manual steps
- better compliance visibility
- better stickiness

## Highest-Value API Groups

## 1. GSTR-2B Pull

Relevant APIs:

- `PUT /gstr2b/gen2b`
- `GET /gstr2b/get2b`
- `GET /gstr2b/all`

Customer value:

- removes manual GSTR-2B download/upload dependency
- makes reconciliation faster
- improves ITC confidence
- keeps books vs portal comparison more current

Why it matters:

- this is one of the strongest recurring monthly use cases
- directly affects CA workflow and GSTR-3B confidence

Priority:

- `Critical`

## 2. Return Status And Tracking

Relevant APIs:

- `GET /gstr/retstatus`
- `GET /all/newretstatus`
- `GET /gstr/rettrack`
- `GET /public/rettrack`

Customer value:

- users can see real filing progress in product
- fewer “please check portal” support loops
- better clarity on ARN, pending states, and failures

Why it matters:

- status trust is essential once filing goes live
- customers care as much about certainty after filing as before filing

Priority:

- `Critical`

## 3. TDS/TCS Portal Pull

Relevant APIs:

- `GET /gstr7/tds`
- `GET /gstr7/tdschecksum`
- `GET /gstr2a/tds`
- `GET /gstr2x/tdstcs`

Customer value:

- helps customers who deal with GST-TDS and TCS visibility
- reduces manual TDS/TCS tracking outside the product
- supports deductor/deductee validation and follow-up

Why it matters:

- this is directly tied to real market demand you mentioned
- strong differentiator for customers with TDS-heavy workflows

Priority:

- `High`

## 4. Annual GSTR-9 Detail Pull

Relevant APIs:

- `GET /gstr9/getdet`
- `GET /gstr9/getautocal`
- `GET /gstr9/get8adetails`
- `GET /gstr9/getHsndetails`

Customer value:

- gives annual return prep a portal-backed baseline
- improves audit confidence for annual filing
- helps compare product annual aggregates with portal annual details

Why it matters:

- annual returns are less frequent than monthly workflows
- still valuable for trust and annual review quality

Priority:

- `High`

## 5. Document Download

Relevant API:

- `GET /all/docdwld`

Customer value:

- easier evidence retrieval
- better support and audit trail
- useful when users need exact portal documents later

Why it matters:

- not always a day-one workflow
- but very useful for support, audit, and defensibility

Priority:

- `Medium`

## 6. Taxpayer Search / Master Fetch

Relevant API:

- `GET /public/search`

Customer value:

- easier onboarding
- less manual client master entry
- cleaner GSTIN verification

Why it matters:

- useful
- but not as strategically valuable as 2B, filing status, or TDS/TCS

Priority:

- `Medium`

## Recommended Implementation Order

If we want the strongest customer-facing value without overbuilding, implement in this order:

1. `GSTR-2B pull and refresh`
2. `Return status and tracking`
3. `TDS/TCS portal pull`
4. `Annual GSTR-9 detail pull`
5. `Document download`
6. `Taxpayer search polish`

## What Is Most Important To Implement

If we only pick the most important items, they are:

### Must-have

- `GSTR-2B pull`
- `Return status and tracking`

These directly support:

- reconciliation
- GSTR-3B confidence
- live filing trust

### Strong next differentiator

- `TDS/TCS portal pull`

This is especially important because customers are already demanding GST-TDS support.

### Valuable but second wave

- `GSTR-9 annual detail pull`
- `Document download`
- `Taxpayer search improvements`

## Product Positioning Benefit

From a customer point of view, these features shift the app from:

- “upload your files here”

to:

- “this product actually talks to the GST ecosystem and reduces portal/manual work”

That is the real commercial value.
