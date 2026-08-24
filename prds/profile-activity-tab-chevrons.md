# Profile activity tab chevrons

Created: 2026-08-24 06:44 UTC
Last Updated: 2026-08-24 06:52 UTC
Status: Done

## Problem

Votes, Ratings Given, Comments, Bookmarks, Followers, and Following start closed. The buttons look like plain labels, so visitors do not see that the lists can open.

## Root cause

The activity controls use `aria-expanded` but have no visual disclosure affordance. After the lists started closed, that missing cue became the whole problem.

## Proposed solution

Add a small Lucide `ChevronDown` after each tab label. Closed: down, `text-faint`. Open: rotate 180, `text-ink`. `aria-hidden` so screen readers keep using `aria-expanded`. Same tokens and borders-only chrome as the rest of the profile.

## Files to change

- `src/pages/UserProfilePage.tsx`
- `TASK.MD`, `changelog.md`, `files.md`

## Edge cases

- Bookmarks, Followers, and Following already have leading icons. The chevron sits after the label so it does not collide.
- Mobile full-width rows put the chevron on the trailing edge.

## Verification

- Closed tabs show a down chevron.
- Opening a tab flips that chevron. Closing it points down again.
- Mini dashboard cards still open the matching list.

## Task completion log

- 2026-08-24 06:52 UTC: Done. Browser checks on `/waynesutton`: closed Votes chevron `transform: none` at `rgb(107,107,107)` (faint); open Votes chevron `matrix(-1,0,0,-1,0,0)` at `rgb(0,0,0)` (ink) with `tab-section-votes` mounted; second click unrotates it and unmounts the panel. All five tabs carry exactly one chevron (Followers and Following keep their leading Users icon). At 375px every row is 311px wide with the chevron 16px off the trailing edge. Dark theme closed chevron is `rgba(255,255,255,0.45)` on `#0f0f0f`. Zero lint errors.
