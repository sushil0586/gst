# Launch Readiness Gap Matrix

## Purpose

This document focuses on the visible modules that are currently least aligned with a full launch-ready standard:

- IMS
- Notices
- Settings

The goal is simple:

- identify what is already solid
- identify what is still missing
- convert that into implementation work

## Launch-ready checklist

Each module is scored against these dimensions:

1. Live-backed scope
2. UX completeness
3. Permission and safety model
4. Automated coverage
5. Staging/UAT confidence
6. Support and audit readiness
7. Release wording and product contract

## IMS

### Current strengths

- Dedicated backend app and route surface are being added.
- Dedicated frontend workbench exists at `/ims`.
- Playwright coverage already exists for:
  - read-only invoice/status drill-down
  - permission-restricted save/reset
  - write-enabled save/reset path
  - live IMS smoke route
- The page already handles:
  - workspace/client/GSTIN context
  - provider auth session selection
  - multiple IMS request types
  - explicit loading, empty, and error-style states

### Current gaps

| Dimension | Status | Gap |
| --- | --- | --- |
| Live-backed scope | Partial | New backend/frontend work is still in active development and not yet baseline-stable. |
| UX completeness | Partial | The page is powerful, but still feels like an operator workbench rather than a polished first-class release module. |
| Permission and safety | Partial | Save/reset permission coverage exists, but broader role expectations and operator safety rules need formal signoff. |
| Automated coverage | Good | Good start, but final launch matrix should confirm cross-browser, error-state, and live behavior expectations. |
| Staging/UAT confidence | Partial | Live smoke exists, but IMS still needs explicit launch-level staging signoff. |
| Support and audit readiness | Partial | Needs confirmation of operator evidence, troubleshooting flow, and audit visibility expectations. |
| Release wording | Partial | The current surface needs to read like a supported module, not a specialist troubleshooting console. |

### Implementation needed

1. Stabilize the backend and frontend IMS baseline.
2. Confirm the intended operator personas and permissions.
3. Refine the page contract so the primary flows are obvious and release-oriented.
4. Add explicit support guidance and response interpretation where needed.
5. Run dedicated staging UAT and record signoff.

### Launch decision rule

IMS can be launch-ready only if:

- we finish it as a supported visible module

Otherwise:

- it must not remain visible in the launched product

## Notices

### Current strengths

- Notices is more live-backed than older docs implied.
- The page supports:
  - live notice list query
  - filters by status, owner, and search
  - add/edit modal flow
  - GSTIN-scoped creation
  - owner assignment
  - due date and status updates
- There is Playwright coverage for:
  - create, filter, and update
  - validation behavior
  - role-restricted actions
  - API failure behavior
  - live notice empty-state and modal behavior

### Current gaps

| Dimension | Status | Gap |
| --- | --- | --- |
| Live-backed scope | Good | Core flow is real, but launch contract should be confirmed end to end on staging. |
| UX completeness | Good | The screen is fairly complete, but it needs final review as a launch module rather than a “surprisingly capable pilot page.” |
| Permission and safety | Partial | Current permission model uses GSTIN management capability; this should be confirmed as the correct launch rule. |
| Automated coverage | Good | Strong browser coverage already exists. |
| Staging/UAT confidence | Partial | Needs formal staging signoff for create, assign, update, and filter flows. |
| Support and audit readiness | Partial | Need to confirm notice actions are visible and diagnosable enough for support workflows. |
| Release wording | Partial | Old docs still frame notices as weaker than the current implementation, which creates launch ambiguity. |

### Implementation needed

1. Confirm the correct permission model for notice management.
2. Validate the full notice lifecycle on staging.
3. Confirm audit/support visibility for notice changes.
4. Remove outdated “placeholder” framing from project docs and any UI wording.

### Launch decision rule

Notices is close enough that it should be graduated into launch-ready rather than hidden.

## Settings

### Current strengths

- The focused settings submodules are meaningful:
  - team management
  - workspace management
  - change password
  - user guide
  - readiness checklist
- Team and workspace pages already have strong implementation and browser coverage.

### Current gaps

| Dimension | Status | Gap |
| --- | --- | --- |
| Live-backed scope | Partial | The linked submodules are real, but the landing page itself is mostly a router. |
| UX completeness | Weak | The landing page explicitly calls itself “intentionally lightweight,” which is not acceptable for a full launch-ready standard. |
| Permission and safety | Partial | Needs confirmation that settings entry points match the intended role model. |
| Automated coverage | Partial | Team/workspace have coverage, but the settings landing itself needs to be treated as a real product surface. |
| Staging/UAT confidence | Partial | Needs launch-level staging walkthrough of settings entry, team, workspace, and password flows together. |
| Support and audit readiness | Partial | Needs confirmation of support expectations for admin changes. |
| Release wording | Weak | Current release note copy openly signals incompleteness. |

### Implementation needed

1. Rewrite the settings landing so it feels like a real admin and operations hub.
2. Remove “intentionally lightweight” and similar temporary wording.
3. Decide what settings promise we are actually making at launch.
4. Validate the entire settings experience on staging, not just the linked pages in isolation.

### Launch decision rule

Settings cannot be considered launch-ready until the landing page itself has an intentional release contract.

## Cross-module priorities

Across IMS, Notices, and Settings, the most important remaining work is:

1. Finalize the product contract for each module.
2. Align permissions with intended operational roles.
3. Remove incomplete or pilot-style wording.
4. Run staging signoff on the full visible experience.
5. Confirm support and audit visibility where operators will need it.

## Recommended implementation order

1. Settings
   Reason: it is the clearest visible launch-readiness gap and easiest to define sharply.
2. Notices
   Reason: close to ready, so it can likely graduate quickly.
3. IMS
   Reason: most powerful but also the most in-progress and therefore the highest stabilization effort.

## Done condition

This matrix is resolved when:

- Settings no longer reads as temporary
- Notices has formal staging and support signoff
- IMS is either fully stabilized and supported or removed from the visible launch surface
