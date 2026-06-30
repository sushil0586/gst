# Playwright E2E Base

This folder now has a reusable base for GST monthly workflow tests.

## What is shared

- `fixtures/gst-data.ts`
  - stable session, workspace, client, GSTIN, period, and workflow record builders
- `fixtures/gst-api-mocks.ts`
  - route helpers that mock the frontend's `/api/auth/*` and `/api/backend/*` calls
- `fixtures/test.ts`
  - a custom Playwright `test` that auto-registers authenticated workspace context

## First base scenario

- `gst-monthly-workflow.spec.ts`
  - proves the base by loading `/returns`
  - validates live workspace scope hydration
  - prepares a mocked `GSTR-3B` draft

## How to extend

Use the shared fixture:

```ts
import { expect, test } from "./fixtures/test";

test("your scenario", async ({ page, gstApi }) => {
  await gstApi.mockMonthlyComplianceWorkflow();
  await page.goto("/imports");
});
```

Add new helpers to `gst-api-mocks.ts` when a flow needs richer backend state such as imports, reconciliation exceptions, approvals, or portal filing.
