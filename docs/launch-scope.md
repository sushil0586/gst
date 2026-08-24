# Launch Scope

## Purpose

This document defines the launch objective for the current GST Compliance product as of August 24, 2026.

The goal has changed from:

- controlled launch with some pilot-only visible surfaces

to:

- making every visible product surface launch-ready

That means no user-facing route should remain ambiguous, placeholder-like, or only partially supportable at release time.

## Launch objective

Target launch position:

- yes for controlled live rollout
- yes for tenant-limited operational usage with support oversight
- yes for every visible product module being supportable, testable, and honestly represented
- no for broad unrestricted “works for every live filing case” claims until provider and filing hardening are fully closed

## Launch-ready standard

A module counts as launch-ready only when all of the following are true:

1. It is live-backed for its intended scope.
2. It has clear empty, loading, success, and error states.
3. It behaves correctly under the intended role and permission model.
4. It has staging validation for its core user journeys.
5. It has automated coverage for its critical workflows.
6. It has no misleading placeholder, pilot-only, or temporary wording in the product experience.
7. It is supportable through audit evidence, recovery guidance, or clear operational visibility where relevant.

## Scope table

| Module | Target status | Current position | Gap to launch-ready |
| --- | --- | --- | --- |
| Auth | Launch-ready | Strong | Needs final staging signoff for login, logout, register, forgot-password, reset-password, and change-password. |
| Dashboard | Launch-ready | Strong | Needs only normal release verification. |
| Clients | Launch-ready | Strong | Needs only normal release verification. |
| GSTINs | Launch-ready | Strong | Needs only normal release verification. |
| Compliance periods | Launch-ready | Strong | Needs only normal release verification. |
| Imports | Launch-ready | Strong but backend-sensitive | Duplicate-detection semantics and backend verification need closure. |
| Reconciliation | Launch-ready | Strong | Needs only normal release verification plus backend confidence. |
| Returns | Launch-ready | Strong | Live-filing hardening and broader release evidence still matter for stronger claims. |
| Approvals | Launch-ready | Strong | Serializer/request validation should be hardened further. |
| Reports | Launch-ready | Strong | Needs only normal release verification. |
| Audit trail | Launch-ready | Strong | Needs only normal release verification. |
| Notices | Launch-ready | Partial | Needs formal graduation from “pilot-feeling” to fully supportable launch surface. |
| Settings landing | Launch-ready | Weakest visible surface | Needs redesign of messaging and product contract so it feels intentional and release-worthy. |
| Team management | Launch-ready | Strong | Needs only normal release verification. |
| Workspace management | Launch-ready | Strong | Needs only normal release verification. |
| User guide and readiness helpers | Launch-ready as support surfaces | Partial | Need clearer release framing so they support launch instead of signaling incompleteness. |
| IMS | Launch-ready | In progress | Needs feature stabilization, permissions review, staging proof, and support definition. |
| WhiteBooks live filing posture | Launch-ready within honest claim boundary | Partial | Vendor contract closure and real live evidence remain required for stronger filing claims. |

## Product requirement

The release target is now:

- every visible route is launch-ready

This includes:

- `/notices`
- `/settings`
- `/ims`

These routes should no longer be treated as acceptable pilot-only exceptions.

## What this means operationally

The launch work is no longer just about protecting a narrow core.

It now requires us to:

1. Upgrade Notices into a fully supported launch module.
2. Upgrade Settings from a lightweight router into a clearly intentional launch surface.
3. Finish IMS as a supported visible module, or remove it from the visible product until it is ready.
4. Remove pilot/demo ambiguity from user-facing wording and release documentation.
5. Raise backend verification and CI to the same confidence level as the frontend release gate.

## Hard rules

Before launch:

- no visible route should read like a temporary landing page
- no visible module should depend on “we’ll explain this is still pilot-only”
- no active module should lack a clear owner workflow
- no launch-critical backend path should rely on unreliable or undocumented verification

## Priority upgrades

The biggest scope upgrades required by this launch angle are:

1. Notices
2. Settings landing
3. IMS
4. Backend verification and CI
5. Filing contract and evidence hardening

## Messaging guidance

Use this wording:

- launch-ready
- supported operational surface
- controlled live rollout
- tenant-limited live usage

Avoid this wording:

- pilot-only
- intentionally lightweight
- placeholder workflow
- demo route

## Exit criteria

The launch scope is complete when:

- every visible module satisfies the launch-ready standard
- no visible route remains framed as temporary or pilot-only
- docs and UI describe the same release reality
- staging verification covers every visible module’s critical path
