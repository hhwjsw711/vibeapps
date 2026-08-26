# Profile activity toggles, compact CTAs, Luma heading

Created: 2026-08-24 05:55 UTC
Last Updated: 2026-08-24 05:55 UTC
Status: Done

## Problem

Profile Votes, Ratings Given, Comments, and Bookmarks open on load, so the page dumps a list before the visitor asked for one. Edit my profile and Manage Profile & Account wrap into tall blocks next to Inbox. The account button still says Manage Profile & Account. Luma square covers are small. Upcoming events in the sidebar is hardcoded, so admins cannot rename it.

## Root cause

`activeTab` defaults to `"votes"`. Header CTAs share Inbox padding but wrap on long labels. Luma compact covers are 72px. `LumaEventList` hardcodes the heading.

## Proposed solution

- Start with no activity list open. Tab buttons and mini dashboard cards still open the matching list. Clicking an open tab closes it.
- Shrink Edit my profile and the account CTA to one-line `h-8` controls. Rename the account CTA to Manage Account & Email.
- Grow Luma square covers 50 percent (compact 108, default 144).
- Store optional `lumaConfig.sidebarTitle`. Admin Settings Luma block can edit it. Blank falls back to Upcoming events. Sidebar and `/events` share the heading.

## Files to change

- `src/pages/UserProfilePage.tsx`
- `src/components/LumaEventCard.tsx`
- `src/components/LumaEventList.tsx`
- `src/pages/EventsPage.tsx`
- `src/components/admin/LumaEventsSettings.tsx`
- `convex/schema.ts`
- `convex/luma.ts`
- `TASK.MD`, `changelog.md`, `files.md`

## Edge cases

- Empty or whitespace heading uses Upcoming events.
- Heading capped at 80 characters.
- Mini dashboard always opens the list; tab buttons toggle.
- Existing lumaConfig rows stay valid without the new field.

## Verification

- Profile loads with no Votes/Ratings/Comments/Bookmarks panel.
- Clicking a tab or mini card opens that list. Clicking the open tab closes it.
- Account CTA reads Manage Account & Email and stays one line.
- Sidebar cover is 108px square.
- Admin sidebar heading save updates the catalog sidebar and `/events`.
