# Engineering Backlog 90 Days

## 1. Purpose

This document converts the production roadmap into an execution-oriented backlog for roughly the next 90 days.

The goal is to make implementation sequencing explicit across:

- backend
- frontend
- integration
- infrastructure
- QA/UAT

## 2. Sprint structure

Recommended planning cadence:

- 2-week sprints
- 6 sprints over 90 days

## Sprint 1: Filing foundation

### Backend

- create `apps/filings`
- add `ReturnFiling` model
- add `ReturnFilingAttempt` model
- add `ReturnFilingEvent` model
- register app and create migrations
- add basic selectors and serializers

### Architecture

- define filing status enums
- define attempt status enums
- define event taxonomy
- document state transition rules

### Frontend

- design filing readiness panel
- design filing status timeline states
- identify existing returns pages to extend

### Documentation

- finalize [filings-schema-plan.md](/Users/ansh/Documents/Gst-Compliance/docs/filings-schema-plan.md:1) in line with implementation
- finalize [filings-api-spec.md](/Users/ansh/Documents/Gst-Compliance/docs/filings-api-spec.md:1)

### Exit criteria

- migrations created
- schema approved
- no unresolved ambiguity in filing states

## Sprint 2: Readiness and return snapshotting

### Backend

- add readiness evaluation service for filing
- add snapshot versioning support to `ReturnPreparation`
- add immutable filing snapshot contract
- expose readiness endpoint

### Frontend

- build readiness UI for GSTR-1 and GSTR-3B
- show blocking issues vs warnings
- show approval prerequisite clearly

### QA

- tests for readiness rules
- tests for period locking interactions

### Exit criteria

- readiness API working
- frontend consumes readiness
- filing is blocked correctly when unsafe

## Sprint 3: WhiteBooks adapter scaffold

### Backend

- create `apps/integrations/whitebooks`
- implement `FilingProvider` interface
- scaffold `WhiteBooksProvider`
- scaffold `WhiteBooksClient`
- add config management for sandbox credentials

### Integration

- document WhiteBooks endpoints and authentication flow
- validate sandbox connectivity

### QA

- unit tests for provider abstractions
- provider config validation tests

### Exit criteria

- sandbox connectivity proven
- provider scaffold merged

## Sprint 4: Filing orchestration

### Backend

- add `POST /filings/start/`
- add async submission job
- add attempt creation and event creation
- add `GET /filings/{id}/`
- add `GET /filings/{id}/events/`
- add `GET /filings/{id}/attempts/`

### Frontend

- add file return action
- add filing progress UI
- add attempt history UI
- add provider error display

### QA

- orchestration tests
- permission tests for file action

### Exit criteria

- local filing lifecycle works end to end using mocked provider responses

## Sprint 5: Status sync and retry flows

### Backend

- add polling task for provider status
- add ARN/status mapping
- add retry endpoint
- add resync endpoint
- add support/admin recovery hooks

### Frontend

- add retry controls where allowed
- add status refresh behavior
- add ARN display

### QA

- failed filing scenarios
- retry scenarios
- delayed ARN scenarios

### Exit criteria

- sandbox status progression works
- retry and resync are safe and visible

## Sprint 6: Hardening and rollout prep

### Security

- redact provider-sensitive logs
- verify maker-checker enforcement
- validate permission boundaries

### Operations

- add monitoring hooks
- add worker health checks
- add failure triage runbook

### Documentation

- release checklist
- UAT script for filing scenarios
- support playbook

### QA/UAT

- sandbox filing UAT
- first release go/no-go review

### Exit criteria

- system is ready for controlled rollout

## 3. Cross-functional backlog

### Product decisions needed early

- exact v1 return types for filing
- WhiteBooks workflow boundaries
- approval policy
- retry policy
- evidence pack contents

### Infrastructure tasks

- staging environment parity
- Redis/Celery production shape
- secret management approach
- monitoring/error reporting stack

### Security tasks

- credential lifecycle design
- audit completeness review
- sensitive response redaction review

## 4. Ticket-style backlog candidates

Recommended first ticket set:

- FIL-001 create `apps/filings` app scaffold
- FIL-002 add `ReturnFiling` model and migration
- FIL-003 add `ReturnFilingAttempt` model and migration
- FIL-004 add `ReturnFilingEvent` model and migration
- FIL-005 define filing state transition service
- FIL-006 add readiness API contract for filing
- FIL-007 scaffold `FilingProvider`
- FIL-008 scaffold `WhiteBooksProvider`
- FIL-009 scaffold `WhiteBooksClient`
- FIL-010 build filing readiness frontend card
- FIL-011 build filing lifecycle detail screen
- FIL-012 add audit events for filing transitions

## 5. Recommended ownership split

Backend:

- filing models
- orchestration services
- provider integration
- async jobs
- audit and permissions

Frontend:

- readiness
- filing action flow
- lifecycle visibility
- error and retry UX

QA/UAT:

- business correctness validation
- provider flow validation
- production-readiness scenario coverage

## 6. Definition of done for the 90-day window

The 90-day backlog is successful if all of the following are true:

- approved prepared returns can be submitted via WhiteBooks sandbox
- filing attempts are tracked with event history
- ARN and status are visible in the UI
- retry and resync are supported
- readiness checks block unsafe filing
- production hardening tasks are complete enough for controlled rollout
