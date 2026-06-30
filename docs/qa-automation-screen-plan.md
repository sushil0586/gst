# QA Automation Screen Plan

## Purpose

This document defines the end-user QA automation plan for the GST Compliance application before broad Playwright implementation begins.

It is intentionally written from a customer and operator point of view:

- what a real user sees
- what a real user tries to do
- where the product can fail, confuse, or block progress

The plan is also the baseline for:

- Playwright smoke coverage
- critical business-flow coverage
- negative and validation coverage
- responsive and UX review coverage
- bug reporting and QA findings documentation

## Testing Principles

- Test code and application code must remain independent.
- Do not modify application code while writing tests.
- If a test fails because of application behavior, log it as a bug or observation.
- Suggest fixes separately only after the bug is identified.
- Prefer user-facing selectors and flows over implementation-level assertions.
- Keep tests independent, repeatable, and order-agnostic.
- Validate not only business logic, but also usability, clarity, and reliability.

## Coverage Layers

### 1. Smoke Coverage

Fast confidence checks for:

- app load
- login
- dashboard access
- primary navigation
- context selectors
- imports
- reconciliation
- returns
- approvals

### 2. Critical Workflow Coverage

Key operator journey:

1. Sign in
2. Select workspace context
3. Upload source data
4. Run reconciliation
5. Prepare return
6. Review approval/filing readiness

### 3. Validation Coverage

Field-level and action-level guardrails:

- required fields
- invalid formats
- locked period restrictions
- missing context restrictions
- unauthorized or restricted actions

### 4. UI/UX Coverage

End-user quality checks:

- layout consistency
- discoverability of actions
- clarity of labels and instructions
- mobile usability
- helpful loading, empty, success, and error states

### 5. Regression Coverage

Stable user journeys across screens after future changes:

- auth
- team management
- imports
- reconciliation
- returns
- navigation and persistence

## Screen-by-Screen Test Plan

## Auth

### Login

#### Core coverage

- Page loads with expected fields and actions.
- User can sign in with valid credentials.
- Successful login redirects to dashboard.
- Already-authenticated user is redirected away from login.

#### Negative coverage

- Invalid email format shows validation.
- Short password shows validation.
- Incorrect credentials show clear error feedback.
- Session/API failure shows non-confusing error handling.

#### UX coverage

- Labels are clear and conventional.
- Sign-in button loading state is visible.
- Secondary actions for register and forgot-password are easy to discover.
- Refresh/back behavior does not create confusion.

### Register

#### Core coverage

- User can create a workspace with valid inputs.
- Successful registration redirects to dashboard.

#### Negative coverage

- Required fields validate correctly.
- Invalid email is blocked.
- Short password is blocked.
- Duplicate email/server-side validation is surfaced clearly.

#### UX coverage

- Form sections are understandable.
- Organization/workspace fields are not confusing.
- Success path clearly communicates next step.

### Forgot Password

#### Core coverage

- Valid email submits successfully.
- Success message is shown.

#### Negative coverage

- Invalid email is blocked.
- Empty email is blocked.
- Backend failure is shown clearly.

#### UX coverage

- Confirmation messaging should not leak account existence.
- Back-to-login path is obvious.

### Reset Password

#### Core coverage

- Valid reset link allows password reset.
- Successful reset redirects to login.

#### Negative coverage

- Missing `uid` or `token` shows a clear error.
- Mismatched passwords are blocked.
- Weak passwords are blocked.
- Invalid or expired token shows meaningful feedback.

#### UX coverage

- Password labels are clear.
- Recovery path back to sign-in is obvious.

## Dashboard

### Core coverage

- Dashboard loads after login.
- Key cards and quick actions render.
- Topbar context selectors are visible and usable.
- Quick action links navigate correctly.

### State coverage

- Loading state displays properly.
- Empty context state is understandable.
- API failure state is handled gracefully.
- Refresh preserves or restores meaningful context.

### UX coverage

- Summary cards are readable and consistent.
- Action priority is clear.
- Dashboard feels informative rather than overwhelming.

### Responsive coverage

- Desktop layout is stable.
- Mobile layout does not clip cards or controls.
- Navigation remains usable on smaller screens.

## Clients

### Core coverage

- Client register loads.
- Search works.
- Client detail opens.
- Create and edit client flows work.

### Negative coverage

- Missing required fields are blocked.
- Invalid formats are blocked.
- Duplicate or conflicting records surface clear feedback.

### State coverage

- Empty state is helpful.
- No-search-result state is helpful.
- Error state is visible when load fails.

### UX coverage

- Add/edit actions are easy to find.
- Client metadata is easy to scan.

## GSTINs

### Core coverage

- GSTIN register loads in the selected context.
- User can create and edit a GSTIN.

### Negative coverage

- Invalid GSTIN format is blocked.
- Missing required context is handled.
- Invalid state/registration inputs are blocked.

### UX coverage

- Registration type and state code are understandable.
- Context relationship between client and GSTIN is obvious.

## Compliance Periods

### Core coverage

- Compliance period list loads.
- User can create and edit a period.
- Lock/open state is visible.

### Negative coverage

- Missing required fields are blocked.
- Duplicate or invalid period combinations are blocked.
- Locked-period restrictions are enforced downstream.

### UX coverage

- Lock status is visible before the user attempts restricted actions.
- Return type and due date are easy to understand.

## Import Center

### Core coverage

- Page loads with upload workflow visible.
- Context gating works before upload.
- User can choose import type and source format.
- User can choose a file and upload it.
- Latest batch appears after successful upload.

### Negative coverage

- Upload blocked when required context is missing.
- Upload blocked when no file is selected.
- Wrong file format is rejected.
- Server-side upload validation errors are shown clearly.

### Batch operations coverage

- Open batch details.
- Review row errors.
- Review impact summary.
- Reprocess batch if available.
- Replace file if available.
- Discard row or batch if available.

### Table/filter/search coverage

- Batch list renders correctly.
- Batch statuses are visible.
- Filters/search work when available.
- Empty state is meaningful.

### UX coverage

- Upload instructions are understandable.
- Template/mapping flow is understandable.
- Error messages help the user recover.

## 2B Reconciliation

### Core coverage

- Page loads and shows current context.
- User can run reconciliation when data is ready.
- Run history loads.
- Issues table loads for the selected run.

### Negative coverage

- Missing purchase or GSTR-2B data blocks the flow clearly.
- Locked period blocks actions clearly.
- Stale run state is surfaced clearly.
- API failure states are handled.

### Actions coverage

- Filters work.
- Search works.
- Issue modal opens.
- Item review/action updates work.
- Export action works if enabled.

### State coverage

- Empty run history state.
- Empty issues state.
- No-filter-match state.

### UX coverage

- Issue bucket labels make sense to operators.
- Recommended next-step messaging is helpful.
- Modal actions are understandable and not overwhelming.

## Returns

### Core coverage

- Returns workspace loads.
- Return readiness summary is shown.
- User can prepare GSTR-1 and GSTR-3B where allowed.
- Return history updates after preparation.

### Negative coverage

- Missing context blocks preparation.
- Blocked readiness prevents preparation.
- Locked period prevents preparation.
- Stale reconciliation warnings block or warn clearly.

### Action coverage

- Export actions where enabled.
- Approval request actions where enabled.
- Filing-gated actions where enabled.
- Portal readiness/challan panels render safely.

### UX coverage

- Readiness/blocker messaging is understandable.
- Primary actions are clearly prioritized.
- Success feedback is specific and helpful.

## Return Review Screens

### GSTR-1 Review

- Page loads with valid prepared return context.
- Tabs/sections render correctly.
- Source rows and warnings are visible.
- Back-to-returns navigation works.

### GSTR-3B Review

- Overview renders correctly.
- ITC and reconciliation sections render correctly.
- Warnings/blockers are visible.

### GSTR-7 Review

- Smoke coverage for page load, empty/error states, and section rendering.

### GSTR-9 Review

- Smoke coverage for page load, empty/error states, and section rendering.

### GSTR-9C Review

- Smoke coverage for page load, empty/error states, and section rendering.

### UX coverage

- Tab labels are understandable.
- Financial summaries are readable.
- User can navigate back without confusion.

## Approvals

### Core coverage

- Approval queue loads in the selected context.
- Return preview opens where available.
- Approve/reject/request changes actions work where allowed.

### Negative coverage

- No workspace selected state is helpful.
- Empty queue state is helpful.
- API failure is surfaced clearly.

### Filter coverage

- Workflow/entity filters behave correctly.

### UX coverage

- Review context gives enough information for decision-making.
- Action dialogs are clear and safe.

## Operations

### Core coverage

- Filing operations queue loads.
- Filters work.
- Return preview opens.

### Negative coverage

- Empty queue state is meaningful.
- API failure state is meaningful.
- Invalid transition/action states are handled.

### UX coverage

- Severity indicators feel trustworthy.
- Next-step guidance is clear for operators.

## Notices

### Core coverage

- Notice list loads in selected workspace.
- Create notice flow works.
- Edit notice flow works.
- Search and filters work.

### Negative coverage

- Missing workspace blocks appropriately.
- Invalid field values are blocked.
- Server errors are visible.

### UX coverage

- Compliance/legal wording is understandable.
- Due dates and statuses are easy to scan.

## Reports

### Reports Landing

- Page loads.
- Filters render correctly.
- Tables load correctly.
- Search/no-result states work.

### Return Status Register

- Register loads in selected scope.
- Follow-up creation flow works.
- Row actions navigate correctly.

### UX coverage

- Dense filters remain understandable.
- Column labels are clear.
- Report actions are discoverable.

## Audit Trail

### Core coverage

- Audit trail loads.
- Filters/search/pagination work if available.

### State coverage

- Loading state is visible.
- Empty state is understandable.
- Error state is clear.

### UX coverage

- Timestamps are readable.
- Actor/action descriptions are understandable.

## Settings

### Settings Home

- Navigation cards open correct destinations.

### Team Management

#### Core coverage

- Team list loads for selected workspace.
- Add member works.
- Edit member works.
- Deactivate member works.

#### Negative coverage

- No workspace selected state is clear.
- Validation errors are clear.
- Permission gating works if applicable.

#### UX coverage

- Role descriptions are understandable.
- Dangerous actions should be reviewed for confirmation behavior.

### Change Password

- Successful password change works.
- Mismatch/weak password validation works.
- Wrong current password is handled.

### Workspace Management

- Create/edit workspace where allowed.
- Restricted-access states are clearly shown.

### User Guide / Pilot Readiness

- Smoke coverage for page load and link behavior.

## Global Shell and Navigation

### Core coverage

- Sidebar navigation works.
- Topbar selectors work.
- User menu works.
- Logout works.

### Behavior coverage

- Protected-route behavior after refresh.
- Session-expired behavior.
- Browser back/forward behavior.

### Mobile coverage

- Mobile nav sheet opens/closes correctly.
- Context selectors are usable on mobile.

### UX coverage

- Hardcoded or demo-looking content should be flagged.
- Context persistence should feel reliable.

## Responsive Test Plan

### Viewports

- Desktop: `1280x720`
- Tablet: `768x1024`
- Mobile: `390x844`

### Screens requiring explicit responsive review

- Login
- Register
- Dashboard
- Imports
- Reconciliation
- Returns
- Team Management
- Settings

### Responsive checks

- Navigation remains reachable.
- Buttons and forms do not clip.
- Tables remain usable or degrade gracefully.
- Modals fit viewport and remain scrollable.
- Topbar selectors do not become confusing or unusable.

## Planned Test Suite Structure

## Smoke Suite

- auth login
- dashboard load
- imports load
- reconciliation load
- returns load
- approvals load

## Critical Flow Suite

- login -> select context -> import -> reconcile -> prepare return

## Validation Suite

- auth forms
- team form validations
- upload restrictions
- locked period restrictions

## UI/UX Review Suite

- empty states
- loading states
- error states
- responsive layout checks

## Regression Suite

- auth
- navigation
- imports
- reconciliation
- returns
- team management

## Bug Reporting Format

Every bug discovered during execution should be documented with:

- Bug title
- Steps to reproduce
- Actual result
- Expected result
- Severity: Critical / High / Medium / Low
- Screenshot or video reference if available
- Suggested fix area

## UI/UX Review Format

Every UI/UX observation should be documented with:

- Layout or alignment issue
- Confusing labels or instructions
- Missing validations
- Spacing/readability issue
- Inconsistent colors/buttons/components
- Difficult navigation
- Poor mobile behavior
- Missing confirmation dialog
- Missing or weak loading/empty/error/success states

## Execution Order

1. Build and stabilize smoke coverage.
2. Add critical business-flow coverage.
3. Add negative and validation coverage.
4. Add responsive checks.
5. Add findings documents from real runs.

## Notes For Implementation

- Prefer page objects where screens have multiple reusable actions.
- Prefer shared fixtures for authenticated workspace setup and realistic backend mocks.
- Avoid brittle selectors when a user-facing role, label, or text selector exists.
- Where selectors are ambiguous or inaccessible, document `data-testid` recommendations instead of changing app code during QA authoring.
