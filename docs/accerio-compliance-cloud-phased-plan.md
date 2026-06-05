# Accerio Compliance Cloud Phased Plan

## 1. Purpose

This is the internal execution plan derived from:

- [Accerio Compliance Cloud.pdf](/Users/ansh/Downloads/Accerio%20Compliance%20Cloud.pdf)
- the current GST Compliance codebase

It converts the product-vision document into a practical phased roadmap for engineering, product, QA, and rollout planning.

This document is intentionally more execution-oriented than the PDF. It answers:

- what the vision means in product terms
- what should be built first
- what should wait
- what platform capabilities must be shared across modules
- how to expand beyond GST without creating a fragmented product

## 2. What The PDF Is Really Saying

The PDF defines Accerio as a single compliance operating system, not just a GST product.

The long-term target is one platform that can support:

- GST compliance
- TDS compliance
- TCS compliance
- Income tax return workflows
- notice management
- compliance calendar
- document management
- client collaboration
- analytics
- AI assistance

The most important architectural rule in the PDF is this:

`Input -> Validation -> Reconciliation -> Review -> Approval -> Filing -> Audit Trail`

That rule should drive every future module. It is the real product backbone.

## 3. Current Reality

Today, the codebase is strongest in GST and already includes major platform building blocks:

- authentication and workspace RBAC
- organizations, workspaces, clients, GSTINs, and periods
- imports and transaction normalization
- reconciliation
- returns preparation
- approvals
- audit logging
- notices
- operational follow-ups
- reports
- filing workflows

This means we should not plan “all modules at once.”

The right strategy is:

1. stabilize GST as the reference module
2. extract reusable platform capabilities from GST
3. build TDS and TCS on that shared platform pattern
4. add ITR, collaboration, analytics, and AI after the core compliance engine is mature

## 4. Product Principles

These principles should stay fixed as the product expands:

### 4.1 One platform, many modules

Users should feel they are operating one compliance workspace, not switching between unrelated mini-products.

### 4.2 Shared operating pattern

Every module should support the same operating stages:

- data intake
- validation
- exception handling
- review
- approval
- filing/submission
- audit trail

### 4.3 Workspace-first operating model

The product should support CA firms, branches, and teams through:

- organization
- multiple workspaces
- clients inside workspaces
- module-specific operations inside the same workspace context

### 4.4 Domain modules, shared platform

Each compliance module should own its own domain logic, but rely on shared platform services for:

- auth
- permissions
- approvals
- notifications
- documents
- audit
- reports
- dashboard widgets

## 5. Recommended Delivery Strategy

The PDF lists phases from GST to AI. Internally, we should use a more practical sequence:

### Phase 0: Stabilize The Base Platform

Goal:
- make the current product production-usable as a GST operations platform

Focus:
- finish GST filing reliability
- clean up operational UX
- complete UAT and release discipline
- harden shared services already in use

Why first:
- GST is the template for every later module
- weak foundations will multiply problems in TDS/TCS/ITR

### Phase 1: Complete GST As The Reference Module

Goal:
- treat GST as the “gold standard” module that future modules copy structurally

Scope:
- imports
- validation and correction
- reconciliation
- return preparation
- approval
- filing
- notice handling
- follow-up workflows
- return status reporting
- filing evidence and exports

Definition of done:
- GST should demonstrate the full platform pattern end to end

### Phase 2: Extract Shared Compliance Platform Services

Goal:
- move shared patterns out of GST-specific assumptions and into platform services

Scope:
- generic approval engine
- generic notice workflow
- generic operational follow-up engine
- shared document repository
- shared reminder/notification framework
- shared dashboard widget contract
- shared module status model

Definition of done:
- TDS/TCS can be built without copying GST-specific workflows directly

### Phase 3: Build TDS Compliance

Goal:
- launch the second serious compliance module after GST

Why TDS next:
- it is marked high priority in the PDF
- structurally it fits the same intake -> review -> filing pattern
- it strengthens CA-firm use cases immediately

Scope:
- deductor master
- deductee master
- challan management
- TDS transaction capture/import
- validation
- quarter-level return preparation
- Form 24Q
- Form 26Q
- Form 27Q
- approvals
- filing readiness
- corrections backlog planning

Do not force into v1 of TDS:
- FVU generation
- justification reports
- advanced defaults analytics

### Phase 4: Build TCS Compliance

Goal:
- add the third tax workflow with maximum reuse from TDS/GST platform patterns

Scope:
- buyer masters
- goods category masters
- collection transactions
- return preparation
- Form 27EQ
- approvals
- audit and reporting

This should be lighter than TDS if Phase 2 is done correctly.

### Phase 5: Compliance Calendar And Reminder Engine

Goal:
- make the product operationally proactive, not only record-based

Scope:
- due-date engine
- dashboard reminders
- workspace reminders
- email notifications
- in-app notifications
- later WhatsApp/SMS hooks

This should use shared reminder rules, not separate reminder systems per module.

### Phase 6: Notice Management As Cross-Tax Workflow

Goal:
- evolve notices from a GST register into a cross-compliance case workflow

Scope:
- GST notices
- income tax notices
- assignment
- response tracking
- due-date reminders
- document attachment
- closure workflow

Note:
- the current notices implementation can become the seed for this phase

### Phase 7: Client Collaboration Portal

Goal:
- open the platform to client-facing participation

Scope:
- document upload
- notice visibility
- return approval
- filed return download
- status visibility

This phase should come only after internal operator flows are stable.

### Phase 8: Income Tax Return Module

Goal:
- expand from indirect tax to direct tax return workflows

Recommended internal sequence:

1. ITR-1
2. ITR-4
3. ITR-2
4. ITR-3

Why later:
- ITR has a very different data model and more varied taxpayer profiles
- building it too early can distract the team from stabilizing the platform core

### Phase 9: Analytics And Compliance Score Layer

Goal:
- provide management and partner-level visibility across modules

Scope:
- GST filed/pending
- TDS pending quarters
- TCS pending filings
- open notices
- client responsiveness
- compliance score

This should sit above modules, not inside a single module.

### Phase 10: AI Assistance Layer

Goal:
- add intelligence after the underlying workflows are trustworthy

Scope:
- mismatch explanations
- notice summaries
- risk explanations
- compliance recommendations
- review assistance

Rule:
- AI should assist review and triage, not replace controlled compliance workflows

## 6. Suggested Internal Build Waves

To make the roadmap executable, use these waves instead of trying to plan 10 major phases in parallel.

### Wave 1: Next 30-45 Days

Priority:
- GST hardening
- platform cleanup
- release readiness

Deliver:
- stabilize filing flow
- finalize UAT pack and production runbooks
- improve client/workspace UX
- tighten imports/reconciliation/returns experience
- complete shared document and audit expectations for GST

### Wave 2: Next 45-90 Days

Priority:
- shared platform extraction
- TDS domain design

Deliver:
- generic approval improvements
- shared document repository foundation
- shared notification service
- TDS schemas, masters, and quarter model
- TDS import and validation MVP

### Wave 3: Next 90-150 Days

Priority:
- TDS launch
- TCS design and early build

Deliver:
- 24Q/26Q/27Q workflow MVP
- challan linkage
- TDS reporting and approvals
- TCS masters and collection capture

### Wave 4: Next 150-210 Days

Priority:
- TCS launch
- calendar and notices expansion

Deliver:
- 27EQ workflow MVP
- compliance calendar
- reminders
- cross-tax notices foundation

### Wave 5: Next 210-300 Days

Priority:
- client portal
- analytics
- ITR foundation

Deliver:
- portal auth and client actions
- dashboards across modules
- ITR-1 / ITR-4 design and MVP start

## 7. Recommended Shared Platform Workstreams

These should be treated as reusable product infrastructure, not as GST-only features.

### 7.1 Identity And Access

- login
- JWT/session
- password reset
- MFA later
- organization/workspace model
- branch/workspace management
- role model:
  - super admin
  - workspace admin
  - CA partner
  - CA staff
  - reviewer
  - data entry operator
  - client user

### 7.2 Document Repository

Shared store for:

- returns
- challans
- notices
- working papers
- certificates
- filing evidence

### 7.3 Approval Engine

Needs to stay generic enough for:

- GST return approvals
- TDS/TCS filing approvals
- notice-response approvals
- later ITR review approvals

### 7.4 Audit Engine

Must support:

- create
- update
- delete
- review
- approve
- reject
- file
- status sync
- operator intervention

### 7.5 Notification Engine

Channels:

- in-app
- email
- later SMS
- later WhatsApp

### 7.6 Operations And Follow-up Engine

Already started in this codebase.

Should evolve into a shared engine for:

- pending from customer
- pending from team
- pending from portal/provider
- due-date follow-ups
- notice follow-ups
- branch-level task queues

## 8. What Should Not Be Done Too Early

To keep the roadmap disciplined, avoid these mistakes:

### 8.1 Don’t build every module at once

GST, TDS, TCS, ITR, notices, portal, analytics, and AI should not move in parallel with equal priority.

### 8.2 Don’t build AI before workflow trust exists

If approvals, filing states, and audit trails are weak, AI recommendations will only increase risk.

### 8.3 Don’t let each module invent its own workflow

The architecture rule from the PDF must stay enforced.

### 8.4 Don’t over-design enterprise packaging before core workflows mature

Subscription packaging can come later. Module reliability matters first.

## 9. Internal Prioritization Recommendation

If we convert the PDF into actual product priority, the recommendation is:

1. GST production stabilization
2. shared platform extraction
3. TDS module
4. TCS module
5. compliance calendar
6. cross-tax notices
7. client portal
8. analytics dashboard
9. ITR module
10. AI layer

This is slightly different from the PDF ordering, but more realistic for delivery.

## 10. Immediate Next Planning Items

From this document, the next internal docs we should create are:

1. `tds-module-mvp-plan.md`
2. `shared-platform-extraction-plan.md`
3. `cross-module-document-repository-plan.md`
4. `compliance-calendar-design.md`
5. `client-portal-mvp-plan.md`

## 11. Proposed Ownership Split

### Product / Founders

- confirm commercial priority after GST:
  - TDS first
  - TCS next
  - portal timing
  - ITR timing
- define customer segment focus:
  - CA firms
  - consultants
  - in-house compliance teams

### Engineering

- stabilize GST as the reference implementation
- extract generic platform services
- create TDS/TCS domain model plan

### QA / UAT

- expand scenario bundles beyond GST
- create module-wise UAT packs
- define cross-module regression matrix

## 12. Working Conclusion

The PDF gives a strong product vision:

- one compliance cloud
- many modules
- one shared workflow pattern

The right execution path is not to chase the whole vision immediately.

The right path is:

1. finish GST properly
2. turn GST learnings into platform capabilities
3. build TDS as the second serious module
4. keep all later modules inside the same operating architecture

That will give Accerio a much stronger long-term product than building many thin modules too early.
