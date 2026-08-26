# Profile account button, email preference anchors, Luma cards

Created: 2026-08-23 05:10 UTC
Last Updated: 2026-08-24 05:47 UTC
Status: Done

## Problem

Own-profile owners can edit bio/socials from the header, but the Manage Profile & Account block (email preferences, Clerk account settings) sits below the fold with no header shortcut. Email footers already point at `/{username}#email-preferences`, but that section only renders for the signed-in owner, so a signed-out click lands on a public profile with nothing to scroll to. Upcoming Luma events in the sidebar still use a wide thumbnail beside the copy, with no location, no visible link, and no path to `/events`.

## Root cause

The header action row only has Inbox + Edit my profile. Hash scroll assumes the Email Preferences node exists. Luma sync never stored a location string, and `LumaEventCard` is a horizontal compact row.

## Proposed solution

- Owner-only `Manage Profile & Account` control next to Edit my profile. Same CTA chrome. Anchor to `#manage-profile`.
- Keep email footer URLs as `https://vibeapps.dev/{username}#email-preferences`. If the visitor is signed out, send them through sign-in with a return path. If they are signed in on someone else's profile, send them to their own username. Scroll the Email Preferences card (`scroll-mt` so the sticky header does not cover it). Welcome "Complete your profile" uses the same helper.
- Parse a one-line Luma location, store it, restack sidebar cards: modest square cover, then title, date, location, one-line blurb, visible event link. Hairline between events. `View all` → `/events`.

## Files to change

- `src/pages/UserProfilePage.tsx`
- `src/lib/redirectPath.ts` (only if hash/query return paths need a tweak)
- `convex/emails/render.ts`
- `convex/emails/templates.ts`
- `convex/schema.ts`
- `convex/luma.ts`
- `src/components/LumaEventCard.tsx`
- `src/components/LumaEventList.tsx`
- `src/pages/EventsPage.tsx`
- `convex/sendEmails.ts` (admin sample sends to wayne@convex.dev)
- `TASK.MD`, `changelog.md`, `files.md`

## Edge cases

- Button and manage section only for the signed-in owner, not visitors.
- No username yet: preference URL still goes to `/set-username`.
- Missing Luma cover or location: skip that row, do not invent placeholders.
- Multiple events: divider between items, View all still shows for one event.
- Sample emails are admin-only and bypass type toggles the same way the existing test send does.

## Verification

- Own profile: Manage Profile & Account appears beside Edit my profile and scrolls to the section. Implemented. Not click-tested in the agent browser this session (localhost would not load).
- Signed-out visit to `/{username}#email-preferences` goes to sign-in, then to that section on the owner profile. Implemented via `?section=` because Clerk can drop hashes.
- Sidebar Luma cards are square-on-top, details below, View all opens `/events`. Implemented in `LumaEventCard` / `LumaEventList`.
- Sample emails: `sendEmails:sendSampleNotificationEmailsInternal` sent four messages to wayne@convex.dev (submission confirmation, group alert, results live, judging). Convex tsc exit 0.

## Completion log

- 2026-08-24 05:47 UTC: Shipped. Sample emails delivered on the unspecified (dev) Convex deployment.
