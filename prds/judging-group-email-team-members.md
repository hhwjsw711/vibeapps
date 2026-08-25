# Include hackathon team members when emailing submission owners

Created: 2026-08-25 06:15 UTC
Last Updated: 2026-08-25 06:30 UTC
Status: Done

## Problem

Submitters can attach a whole team to a submission. Both submit forms capture `teamName`, `teamMemberCount`, and a repeating list of `teamMembers` (`{ name, email }`), stored on the `stories` document.

The judging group Emails section can email "Submission owners", but it only resolves one recipient per submission: the account email, falling back to `story.email`. Every teammate the submitter typed in is ignored, so deadline reminders and results notes never reach the rest of the team. Organizers have to copy addresses out of the admin tables by hand.

## Root cause

`collectGroupSubmissionOwnerRecipients` in `convex/emails/judgingGroupEmails.ts` reads only `story.email` / author account email and never touches `story.teamMembers`. The picker and `sendGroupEmail` are keyed by `storyId`, so there is no way to address a second person on the same submission.

## Proposed solution

1. Collect team members alongside owners. For each group submission, emit the owner first, then each `teamMembers` entry with a valid email address. Deduplicate globally by lowercased email so an owner listed on their own team is only emailed once.
2. Key recipients by a stable string instead of `storyId`: `owner:<storyId>` and `team:<storyId>:<lowercased email>`. This lets the picker select individual teammates on the same submission.
3. Extend `sendGroupEmail` with an optional `recipientKeys` array used for the `submission_owners` audience. Keep the existing `storyIds` path so older clients and scheduled sends keep working.
4. Add an "Include team members" dropdown (`SimpleSelect`, same control already used for audience and template) shown only for the submission owners audience:
   - Submission owners only (default, current behavior)
   - Owners and team members
   - Team members only
   The dropdown is disabled with explanatory copy when no submission in the group has a teammate email.
5. Recipient rows for teammates carry a "Team" badge plus the team name and submission title so an organizer can tell who is who before sending.

Everything else is reused: `judging_group` email type, per-recipient template variables, preview, test send, scheduling, rolling daily cap.

## Files to change

- `convex/emails/judgingGroupEmails.ts` - recipient collection, list query shape, `recipientKeys` on send
- `src/components/admin/judging/GroupEmailsSection.tsx` - team dropdown, badges, key-based selection
- `prds/judging-group-email-team-members.md`
- `TASK.MD`, `changelog.md`, `files.md`

No schema change: `stories.teamName` / `teamMembers` already exist and `groupScheduledEmails.recipients` already stores `{ name, email }`.

## Edge cases

- Team member rows with a name but no email, or a malformed email, are skipped.
- Team member email equal to the owner email is deduplicated (owner wins, since owners are collected first for each submission).
- Same teammate on two submissions is emailed once; the first submission wins for the picker row.
- No teammates anywhere in the group: dropdown is disabled, mode stays "owners only", nothing changes.
- "Team members only" with zero teammates leaves an empty recipient list and the send button disabled.
- Switching the audience resets the team mode, exclusions, and preview selection.
- Deselections survive a team mode change, since exclusions are keyed per recipient.
- Teammates rarely have a VibeApps account, so the footer falls back to the signed-in links, same as judges today.
- Daily recipient cap counts teammates, so adding teams can trip the 200 per 24h limit sooner.

## Verification steps

1. `npx convex codegen` (or dev push) clean, `tsc --noEmit` clean on touched files, zero lints.
2. Submit a story with a team name and two teammate emails, attach it to a judging group.
3. Admin, judging group, Emails, audience Submission owners: dropdown lists the teammates when "Owners and team members" is selected, each with a Team badge.
4. Preview as a teammate resolves `{{firstname}}` / `{{name}}` / `{{email}}` to that teammate.
5. Send and confirm one `emailLogs` row per selected address with `metadata.recipientType = submission_owners`.
6. Owner-only mode still produces the exact recipient list it did before.

## Task completion log

- 2026-08-25 06:15 UTC PRD created, implementation started.
- 2026-08-25 06:30 UTC Implemented. Convex codegen clean, app tsc reports no errors in the touched files, zero lints. A read-only query against the dev deployment resolved the "github links" group to 1 owner plus 1 team member with no duplicate address. Docs synced. A live Resend send was not exercised in this session.
