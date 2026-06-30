# UI / UX Review

## Layout and Visual Consistency

- Several operational pages are strong visually, but some dense tables would benefit from clearer scan anchors such as sticky filters or bolder row grouping.

## Labels and Wording

- Some screens mix technical wording with operator wording. The product is strongest when it stays operator-first, for example `Run Reconciliation` and `Prepare GSTR-3B`.
- The master-data forms are mostly clear in live use. The `Create client` dialog is now easier to scan because optional GSTIN setup is progressively disclosed instead of always expanding the onboarding surface.

## Validation and Safety

- Confirmation is now present on risky member-access changes, which is the right direction to preserve across other destructive actions.
- Current source and live verification both show the member deactivation flow behind an explicit confirmation step, which is the right interaction for a destructive access change.

## Navigation Experience

- Context switching is central to the product, and the topbar selectors now expose explicit automation hooks, which makes them easier to validate and maintain in end-to-end coverage.
- The reports workspace now preserves the transaction-review deep link by resolving `/reports/transaction-review` into the main transaction review surface, which is much more reliable for bookmarked or shared URLs.
- The `Operations` empty state gives users a direct next step through `Open Follow-ups` and `Open Returns workspace`, which is helpful. `Approvals` now follows the same pattern more closely by linking users back to `Returns` and `Imports` when no requests are present.
- The imports screen no longer emits the earlier workspace-only authorization error during context hydration, which makes the product feel calmer and more trustworthy under the hood.

## Loading, Empty, and Error States

- The application generally provides useful empty and error states on core workflow pages.
- This is a strength of the current UI and should be preserved as the suite expands.
- One improvement area is making destructive-action feedback more explicit, especially for membership changes and future filing actions.
- Live staging checks on June 30, 2026 reinforced this as a product strength: `Notices`, `Approvals`, `Operations`, `Follow-ups`, and filtered `Audit Trail` all explain empty or no-match states clearly enough for an operator to understand what to do next.

## Mobile Behavior

- Core auth and import layouts remain readable at mobile width.
- The biggest mobile concern is still discoverability and accessibility of navigation controls rather than raw layout breakage, but the app now exposes a stable mobile navigation trigger hook for QA coverage.
- The imports page remains readable on mobile overall, and the history section now uses stacked cards on small screens, which materially improves scanability on staging.

## Return Review Screens

- The return review screens are directionally strong: each page gives operators a dedicated review surface, good context gating, and clear tabs that separate concerns instead of crowding everything into one page.
- `GSTR-1` and `GSTR-3B` feel the most actionable today because they combine summary, source evidence, and scoped warnings in a way that supports real decisions.
- `GSTR-7` is easy to follow, but the most important source evidence is split across tabs. That is workable, though users may benefit from a stronger cross-tab cue when they land directly on `Source Imports`.
- The annual review pages are useful as early review surfaces, but they are still more summary-heavy than action-heavy. Operators can understand the state, but the next best action is not always as explicit as it is on monthly screens like `Returns` or `Reconciliation`.
- The focused-tab entry messaging is a UX strength. When a user lands deep-linked into a tab, the page explains why that section opened first, which reduces confusion.

## Returns Workspace Discoverability

- The return history area is much clearer once the row action explicitly signals that approval and filing actions live inside the workflow modal.
- Blocked return actions such as `Prepare GSTR-3B` now render disabled and explain the blocker inline near the action area, which reduces hesitation and makes the state feel more deliberate on staging.
