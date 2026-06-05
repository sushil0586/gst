# TDS/TCS Development Guardrails

## 1. Purpose

This document defines the engineering guardrails for building the TDS/TCS module without disturbing the existing GST product.

It should be treated as a working rulebook before TDS/TCS development starts.

It exists to prevent:

- accidental regressions in GST
- cross-module coupling
- rushed shared-service extraction
- confusing architecture where new modules directly depend on GST internals

This document should be read with:

- [accerio-compliance-cloud-phased-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/accerio-compliance-cloud-phased-plan.md:1)
- [tds-tcs-module-phased-architecture-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/tds-tcs-module-phased-architecture-plan.md:1)
- [production-roadmap.md](/Users/ansh/Documents/Gst-Compliance/docs/production-roadmap.md:1)

## 2. Core Rule

The main rule is:

`No TDS/TCS feature should require behavioral change in GST business logic.`

That means:

- TDS/TCS should be developed as new domain modules
- GST remains the stable reference implementation
- shared platform improvements are allowed only when they are:
  - intentional
  - isolated
  - backward compatible
  - verified against GST flows

## 3. What Must Stay Isolated

The following GST domain areas must not be repurposed directly for TDS/TCS:

- GST transaction models
- GST import parsers
- GST reconciliation logic
- GST return preparation services
- GST filing services
- GST-specific reports
- GST-specific validation rules
- GST period semantics
- GST provider integration logic

TDS/TCS should not:

- add conditional logic inside GST services like `if module == "tds"`
- reuse GST models for non-GST data
- overload GST APIs with TDS/TCS meanings
- rename GST concepts into pseudo-generic concepts unless we are deliberately extracting a real platform service

## 4. Allowed Reuse

These are the areas we should reuse from the current platform:

### 4.1 Shared platform reuse

- authentication
- JWT/session handling
- organizations
- workspaces
- workspace memberships and roles
- clients
- user/team management
- approvals engine
- audit logs
- notifications
- common API helpers
- pagination
- permissions framework
- shared UI shell and layout

### 4.2 Reuse by pattern, not by direct domain dependency

The following can be reused conceptually, but not by directly binding TDS/TCS to GST code:

- import workflow pattern
- validation and correction workflow pattern
- filing lifecycle pattern
- reports/register pattern
- dashboard widget pattern
- operational follow-up pattern
- notices workflow pattern

That means:

- reuse architecture
- do not reuse GST domain assumptions

## 5. Folder And Module Boundaries

Recommended backend boundaries:

```text
apps/
  tds_tcs/
    models/
    services/
    selectors/
    api/
    validators/
    exports/
    integrations/
    reports/
    tasks/
    tests/
```

or later:

```text
apps/
  tds/
  tcs/
```

Recommended frontend boundaries:

```text
gst-compliance-frontend/src/
  app/(dashboard)/
    tds/
    tcs/
  features/
    tds/
    tcs/
```

Do not place TDS/TCS code inside:

- GST returns pages
- GST reconciliation pages
- GST imports pages
- GST-specific API clients

unless the change is only to add neutral navigation or shared shell integration.

## 6. Shared Service Extraction Rules

Sometimes TDS/TCS will reveal that a service should be generic.

That is allowed only under these rules:

### 6.1 Extract, do not mutate blindly

If a GST-specific service is genuinely reusable:

1. identify the shared concern
2. extract it into a shared module
3. keep the GST public behavior unchanged
4. migrate GST to use the shared service
5. then let TDS/TCS use it

### 6.2 Examples of valid shared extraction

- generic document repository
- generic approval workflow
- generic notification engine
- generic module status cards
- generic import job tracking
- generic operational follow-up engine

### 6.3 Examples of invalid extraction

- forcing GST return models to become universal return models too early
- stuffing TDS quarterly logic into GST compliance period logic
- making WhiteBooks filing code “generic” for unrelated tax modules
- turning GST transaction tables into catch-all tax transaction tables

## 7. Database And Migration Guardrails

### 7.1 No TDS/TCS migration should alter GST semantics

Avoid migrations that:

- change GST column meaning
- weaken GST constraints for non-GST reasons
- rename GST tables into generic names prematurely

### 7.2 New data should live in new tables

Prefer:

- new TDS/TCS models
- new section masters
- new quarter return tables
- new challan tables
- new certificate batches

instead of reusing GST tables.

### 7.3 Shared master changes must be minimal and justified

Only shared master tables like `clients`, `workspaces`, `users`, or generic approvals should be extended if:

- the new fields are truly cross-module
- the change benefits GST and future modules as well
- the migration is low risk

## 8. API Guardrails

### 8.1 New module, new endpoints

TDS/TCS should have its own API namespaces and serializers.

Examples:

- `/api/v1/tds/deductors/`
- `/api/v1/tds/deductees/`
- `/api/v1/tds/challans/`
- `/api/v1/tds/transactions/`
- `/api/v1/tds/returns/`
- `/api/v1/tcs/transactions/`
- `/api/v1/tcs/returns/`

### 8.2 Do not overload GST endpoints

Avoid patterns like:

- adding TDS meanings to `/returns/`
- mixing TDS/TCS into GST import endpoints
- putting tax-type switches into GST serializers

If a truly generic endpoint is needed, create it intentionally as generic.

## 9. Frontend Guardrails

### 9.1 Separate module journeys

TDS/TCS should have their own pages and task flows:

- TDS masters
- TDS challans
- TDS transactions
- TDS quarterly returns
- TCS transactions
- TCS returns

### 9.2 Shared shell, separate content

Allowed shared UI:

- layout
- sidebar
- topbar
- filters framework
- table primitives
- dialogs
- toasts
- empty/error/loading states

Not allowed:

- forcing TDS/TCS into GST screens by hidden conditionals

### 9.3 Language clarity

Do not use GST words in TDS/TCS screens where they do not fit:

- no GSTIN assumptions in TDS/TCS workflows
- no compliance period month assumptions where quarter is required
- no GSTR wording in TDS/TCS actions

## 10. Testing Rules

### 10.1 GST regression safety

Every shared-platform extraction must be validated against:

- existing GST backend tests
- existing frontend build/tests
- Playwright smoke coverage where relevant

### 10.2 TDS/TCS tests must be isolated

New tests should mainly live in:

- `apps/tds_tcs/tests/`
- TDS/TCS frontend feature tests

They should not rely on GST domain fixtures unless the test is specifically about shared platform behavior.

### 10.3 Minimum release checks for each TDS/TCS slice

For every meaningful slice:

- backend unit tests
- focused API tests
- frontend build
- any relevant UI tests
- GST regression check if shared services were touched

## 11. Product And Delivery Guardrails

### 11.1 Finish one slice at a time

Do not start all of this in parallel:

- TDS transactions
- TDS filing
- TCS returns
- certificates
- corrections

Preferred sequence:

1. masters
2. challans
3. TDS transactions
4. TDS quarterly returns
5. TDS approvals
6. TDS filing architecture
7. TCS MVP
8. certificates
9. corrections

### 11.2 Do not overbuild phase one

Phase one should not try to include:

- every provider integration
- every correction return scenario
- every certificate workflow
- analytics and AI

### 11.3 Keep GST release velocity intact

If TDS/TCS work starts blocking GST stabilization, release, or production support:

- reduce TDS/TCS scope
- pause shared extraction
- restore focus to GST stability

## 12. Code Review Checklist

Before merging any TDS/TCS work, reviewers should check:

1. Does this change modify GST business behavior?
2. Is any GST-specific file being changed unnecessarily?
3. Is this truly a shared-platform extraction or just convenience reuse?
4. Are new APIs and models isolated to TDS/TCS?
5. Are test updates sufficient for both new code and GST regression risk?
6. Does frontend wording stay module-correct?
7. Does this make the architecture cleaner, not more entangled?

If the answer to `1` or `2` is yes, pause and review more carefully.

## 13. Recommended Working Rule For The Team

Use this as the simple team mantra:

`Build TDS/TCS beside GST, not inside GST. Extract shared services only when the boundary is clear.`

## 14. Immediate Next Docs

After this guardrails document, the best follow-up planning docs are:

1. `tds-module-schema-plan.md`
2. `tds-import-and-validation-plan.md`
3. `shared-platform-extraction-plan.md`

## 15. Working Conclusion

We can start TDS/TCS development safely without disturbing GST, but only if we stay disciplined.

The rule is not “never touch shared code.”

The rule is:

- keep GST domain logic stable
- isolate new TDS/TCS domain work
- extract generic services carefully
- verify regressions every time shared code changes

That is the safest way to expand Accerio from a GST-first product into a real multi-compliance platform.
