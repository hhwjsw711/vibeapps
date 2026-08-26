# AI Hackathon Report: auth, AI Gateway, and no-log Convex facts

Created: 2026-08-25 09:30 UTC
Last Updated: 2026-08-25 09:45 UTC
Status: Done

## Problem

The AI Hackathon Report, Convex Recap, and Best Use of Convex stats already exist, and the judge already reads `hackathon.md` from the repo or a pasted log. Two gaps keep organizers from seeing how submissions actually used Convex:

1. Auth provider and Convex AI Gateway are detected during analysis, then dropped. They never land on `aiJudgeResults`, so Stats, Recap, and the Hackathon Report cannot roll them up. A team using Clerk plus the AI Gateway looks the same as a team using neither.
2. When there is no `hackathon.md`, the repo scan still runs, but community components (`@firecrawl/firecrawl-convex`, `@exalabs/convex-exa`, `@context-dot-dev/convex`, `browser-use-convex-component`) are missed in package.json, workspace manifests are ignored for components, and a public live app with no repo has no Convex signal path besides a generic scrape.

## Root cause

Detection lived on `RepoContext` only (prompt + log discrepancies). `saveResult` never wrote `authProvider`, `usesAiGateway`, or `aiModelIdsDetected`. `extractComponents` only kept `@convex-dev/*` from the root `package.json`. Live `/hackathon.md` was never fetched (only `/hackathon.json`).

## Proposed solution

- Persist `authProvider`, `usesAiGateway`, and `aiModelIdsDetected` on each result. Derive feature labels from those facts (`auth (Clerk)`, `AI Gateway`) so Stats/Recap/Report work with or without `hackathon.md`.
- Detect known community Convex components from every fetched manifest plus every `convex.config.ts`. Keep scoring on `componentsUsed` only.
- Fetch published `/hackathon.md` from the live origin as a third fallback (repo copy, then pasted log, then live file).
- When the repo is unreachable, record Convex signals from the live scrape (`.convex.cloud`, `.convex.site`, Convex React markers) as features, never as fake repo facts.
- Do not add Exa or Browser Use to this app. Firecrawl and Context.dev already cover scrape and transcripts. Detect those packages when submissions use them.

## Files to change

- `convex/schema.ts`: optional `authProvider`, `usesAiGateway`, `aiModelIdsDetected` on `aiJudgeResults`
- `convex/aiJudge.ts`: validators, enrichResults, saveResult, getGroupAiReportData
- `convex/aiJudgeAnalysis.ts`: community components, workspace manifests, live hackathon.md, live Convex signals, persist new fields
- `src/components/admin/AIJudgeResults.tsx`: Stats cards, Recap/Report rows, result badges
- `src/pages/AIJudgeResultsPage.tsx`: auth and AI Gateway badges on the public results card

## Edge cases

- No hackathon.md and public repo: facts come from the repo scan only. Log discrepancies stay empty.
- No hackathon.md and private/missing repo: live `/hackathon.md` and live Convex signals may still populate context. Repo-based criteria stay capped as today.
- Old result rows without the new fields: Stats treat missing auth/gateway as unknown, not as "none".
- Community package installed but not referenced: appears under Installed, not Used, same as official components.
- This app does not install Exa or Browser Use. Judge needs are already covered.

## Verification steps

- Detector checks: Clerk dep, Convex Auth v2 `@convex-dev/auth`, `convexGateway(` literal, `@firecrawl/firecrawl-convex` in package.json, live-site `.convex.cloud` with no repo.
- Stats / Recap / Hackathon Report show auth provider counts and AI Gateway count after a completed review.
- A submission with no hackathon.md still lists verified Convex features from the repo (or live-site signals when the repo is missing).
- `npx tsc -p convex/tsconfig.json` clean on touched files.

## Task completion log

- 2026-08-25 09:30 UTC: PRD created. Catalog check: 26 official get-convex components as of 2026-08-22. No new component install needed on vibeapps.
- 2026-08-25 09:45 UTC: Implemented. Auth provider, AI Gateway, and model ids persist on `aiJudgeResults` and appear in Stats, Recap, Hackathon Report, and result cards. Community components, workspace manifests, live `/hackathon.md`, and live-site Convex signals are in the analysis path. Convex tsc clean; eslint 0 errors on touched files (one pre-existing unused-var warning on the public results page). Re-run an AI review on a group to populate the new fields on existing rows.
