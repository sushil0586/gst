# UI / UX Review

## Layout and Visual Consistency

- Several operational pages are strong visually, but some dense tables would benefit from clearer scan anchors such as sticky filters or bolder row grouping.

## Labels and Wording

- Some screens mix technical wording with operator wording. The product is strongest when it stays operator-first, for example `Run Reconciliation` and `Prepare GSTR-3B`.
- The master-data forms are mostly clear in live use. One small usability friction point is that the `Create client` dialog becomes quite dense once GSTIN creation fields are expanded into the same surface. It is powerful, but new operators may need stronger progressive disclosure or grouping to avoid feeling like onboarding requires too many fields at once.

## Validation and Safety

- Confirmation is now present on risky member-access changes, which is the right direction to preserve across other destructive actions.
- Live staging verification on June 30, 2026 showed a regression in this area: `Deactivate` from Team Management currently executes immediately without a confirmation step. That makes member-access changes feel unsafe and increases the chance of accidental destructive actions.

## Navigation Experience

- Context switching is central to the product, so the topbar selectors are critical. They would benefit from explicit test hooks and clearer visual ownership on smaller widths.
- A live staging pass on June 30, 2026 found a navigation reliability gap inside Reports: the landing page works, but the deep route `/reports/transaction-review` resolves to a 404. For an operator, that makes bookmarked or directly shared report links feel unreliable.
- The `Operations` empty state gives users a direct next step through `Open Follow-ups` and `Open Returns workspace`, which is helpful. `Approvals` is clearer than before, but its empty state still feels more passive because it explains where approvals come from without offering a direct action back to the originating workflow.

## Loading, Empty, and Error States

- The application generally provides useful empty and error states on core workflow pages.
- This is a strength of the current UI and should be preserved as the suite expands.
- One improvement area is making destructive-action feedback more explicit, especially for membership changes and future filing actions.
- Live staging checks on June 30, 2026 reinforced this as a product strength: `Notices`, `Approvals`, `Operations`, `Follow-ups`, and filtered `Audit Trail` all explain empty or no-match states clearly enough for an operator to understand what to do next.

## Mobile Behavior

- Core auth and import layouts remain readable at mobile width.
- The biggest mobile concern is discoverability and accessibility of navigation controls rather than raw layout breakage.
- Live staging verification on June 30, 2026 confirmed this concern: the mobile dashboard exposes the `Context` control and page CTAs, but it does not present an obvious globally labeled navigation trigger such as `Menu` or `Open navigation`.

## Return Review Screens

- The return review screens are directionally strong: each page gives operators a dedicated review surface, good context gating, and clear tabs that separate concerns instead of crowding everything into one page.
- `GSTR-1` and `GSTR-3B` feel the most actionable today because they combine summary, source evidence, and scoped warnings in a way that supports real decisions.
- `GSTR-7` is easy to follow, but the most important source evidence is split across tabs. That is workable, though users may benefit from a stronger cross-tab cue when they land directly on `Source Imports`.
- The annual review pages are useful as early review surfaces, but they are still more summary-heavy than action-heavy. Operators can understand the state, but the next best action is not always as explicit as it is on monthly screens like `Returns` or `Reconciliation`.
- The focused-tab entry messaging is a UX strength. When a user lands deep-linked into a tab, the page explains why that section opened first, which reduces confusion.

## Returns Workspace Discoverability

- The return history area is much clearer once the row action explicitly signals that approval and filing actions live inside the workflow modal.
- Live staging verification on June 30, 2026 showed that blocked return actions such as `Prepare GSTR-3B` remain enabled and explain the blocker only after click via toast. This is functional, but some operators may read the enabled button state as ready-to-run. A stronger inline disabled state or embedded blocker summary near the action would reduce hesitation and misclicks.
