# Broadcast email scheduling

Created: 2026-08-26 04:30 UTC
Last Updated: 2026-08-26 04:45 UTC
Status: Done

## Problem

Admins can only send broadcast emails immediately from the Broadcast Emails card in the admin dashboard. There is no way to compose a broadcast now and have it deliver at a chosen date and time.

## Proposed solution

Add a schedule send option to all three broadcast targeting modes (all users, selected users, tag). Admins pick Send now or Schedule, and Schedule opens a themed date and time picker built from the existing Calendar, Popover, and SimpleSelect components. Scheduled broadcasts appear in a list with a cancel action.

Backend uses Convex `ctx.scheduler.runAt` instead of `runAfter(0)` when a schedule time is provided. A `broadcastEmails` record is created at schedule time with status `queued`, the schedule timestamp, and the scheduled function id so the job can be cancelled.

## Files to change

- `convex/schema.ts`: add `scheduledAt`, `scheduledFunctionId`, `recipientSummary` to `broadcastEmails`.
- `convex/emails/broadcast.ts`: optional `scheduledAtMs` on `sendBroadcast`, `sendBroadcastToSelected`, `sendBroadcastToTag`; pass `broadcastId` through to the internal actions; new `listScheduledBroadcasts` query, `cancelScheduledBroadcast` mutation, `createScheduledBroadcastRecord` and `markBroadcastSending` internal mutations.
- `src/components/ui/date-time-picker.tsx`: new single date and time picker matching site tokens.
- `src/components/admin/EmailManagement.tsx`: delivery mode toggle, picker, scheduled broadcasts list with cancel.

## Edge cases

- Scheduled time in the past: mutation throws, UI validates before submit.
- Cancel after the job already ran: mutation early-returns if status is not `queued` (idempotent).
- Zero recipients at send time: queued record is marked completed with 0 sent.
- Timezone: picker uses the admin browser local time; UI shows the resolved timezone name.
- Master email switch off at send time: existing per-send checks in the resend pipeline still apply.

## Verification steps

- `npx tsc --noEmit` passes for app and convex code.
- Schedule a broadcast a few minutes out on dev and confirm the queued record, then delivery.
- Cancel a queued broadcast and confirm the scheduler job is cancelled and status becomes `cancelled`.

## Task completion log

- 2026-08-26 04:30 UTC: PRD created, implementation started.
- 2026-08-26 04:45 UTC: Schema fields, scheduled send support in all three mutations, list and cancel functions, DateTimePicker component, and admin UI shipped. tsc clean for touched files, lints clean. Live schedule and cancel still to be exercised on dev.
