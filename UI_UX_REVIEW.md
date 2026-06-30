# UI / UX Review

## Layout and Visual Consistency

- Several operational pages are strong visually, but some dense tables would benefit from clearer scan anchors such as sticky filters or bolder row grouping.

## Labels and Wording

- Some screens mix technical wording with operator wording. The product is strongest when it stays operator-first, for example `Run Reconciliation` and `Prepare GSTR-3B`.
- The master-data forms are mostly clear in live use. One small usability friction point is that the `Create client` dialog becomes quite dense once GSTIN creation fields are expanded into the same surface. It is powerful, but new operators may need stronger progressive disclosure or grouping to avoid feeling like onboarding requires too many fields at once.

## Validation and Safety

- Confirmation is now present on risky member-access changes, which is the right direction to preserve across other destructive actions.
- Current source and live verification both show the member deactivation flow behind an explicit confirmation step, which is the right interaction for a destructive access change.

## Navigation Experience

- Context switching is central to the product, so the topbar selectors are critical. They would benefit from explicit test hooks and clearer visual ownership on smaller widths.
- A live staging pass on June 30, 2026 found a navigation reliability gap inside Reports: the landing page works, but the deep route `/reports/transaction-review` resolves to a 404. For an operator, that makes bookmarked or directly shared report links feel unreliable.
- The `Operations` empty state gives users a direct next step through `Open Follow-ups` and `Open Returns workspace`, which is helpful. `Approvals` is clearer than before, but its empty state still feels more passive because it explains where approvals come from without offering a direct action back to the originating workflow.
- The imports screen also has a quieter reliability issue during load: it briefly issues a forbidden request before the client, GSTIN, and period context finish resolving. Operators do not immediately see a broken screen, but background authorization errors make the product feel less trustworthy and complicate support diagnostics.

## Loading, Empty, and Error States

- The application generally provides useful empty and error states on core workflow pages.
- This is a strength of the current UI and should be preserved as the suite expands.
- One improvement area is making destructive-action feedback more explicit, especially for membership changes and future filing actions.
- Live staging checks on June 30, 2026 reinforced this as a product strength: `Notices`, `Approvals`, `Operations`, `Follow-ups`, and filtered `Audit Trail` all explain empty or no-match states clearly enough for an operator to understand what to do next.

## Mobile Behavior

- Core auth and import layouts remain readable at mobile width.
- The biggest mobile concern is discoverability and accessibility of navigation controls rather than raw layout breakage.
- Live staging verification on June 30, 2026 confirmed this concern: the mobile dashboard exposes the `Context` control and page CTAs, but it does not present an obvious globally labeled navigation trigger such as `Menu` or `Open navigation`.
- The imports page remains readable on mobile overall. A source fix now swaps the history section to stacked cards on small screens, which should make that section materially easier to scan after deployment.

## Return Review Screens

- The return review screens are directionally strong: each page gives operators a dedicated review surface, good context gating, and clear tabs that separate concerns instead of crowding everything into one page.
- `GSTR-1` and `GSTR-3B` feel the most actionable today because they combine summary, source evidence, and scoped warnings in a way that supports real decisions.
- `GSTR-7` is easy to follow, but the most important source evidence is split across tabs. That is workable, though users may benefit from a stronger cross-tab cue when they land directly on `Source Imports`.
- The annual review pages are useful as early review surfaces, but they are still more summary-heavy than action-heavy. Operators can understand the state, but the next best action is not always as explicit as it is on monthly screens like `Returns` or `Reconciliation`.
- The focused-tab entry messaging is a UX strength. When a user lands deep-linked into a tab, the page explains why that section opened first, which reduces confusion.

## Returns Workspace Discoverability

- The return history area is much clearer once the row action explicitly signals that approval and filing actions live inside the workflow modal.
- Live staging verification on June 30, 2026 showed that blocked return actions such as `Prepare GSTR-3B` remained enabled and explained the blocker only after click via toast.
- A source fix now disables blocked preparation actions and surfaces the first blocker inline near the action area, which should reduce hesitation and misclicks once deployed.
