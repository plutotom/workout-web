# Grayed Lift — agent guide

This branch is the native iOS rebuild. Read [`ios/PLAN.md`](ios/PLAN.md) first;
it holds the agreed decisions, data model, and stages. Do not reintroduce cut
features (Pro, cloud AI, MCP keys, template sharing, cues, set kinds, web app)
without the user asking.

The old Expo app and web app still run from `main` against the same Convex
backend until cutover. Never remove or break existing backend functions or
tables on this branch; add new ones beside them.

## Review and merge checks

- Run `pnpm typecheck && pnpm lint && pnpm test` before recommending a merge.
- Swift: `swift test` in each `ios/` package. Packages that build on Linux must
  keep doing so.
- Do not skip cases, use test-name filters, or mark failures as expected.
- GitHub Actions runs `Unit tests` on PRs. App builds go through Xcode Cloud on
  request only; do not add automatic macOS jobs (CI credits are limited).

## iOS app invariants

- **Local-first.** GRDB is the source of truth. The app opens and works fully
  offline; an auth token never gates local data.
- **Migrations are explicit and append-only.** Never edit a shipped migration.
  Every schema version keeps a snapshot database that tests upgrade to the
  current schema.
- **A local edit and its outbox entry commit in one transaction.** Never write a
  row and queue it later.
- **Outbox entries carry an `opId` and `accountId`.** Only entries for the
  signed-in account flush. The server dedupes by `opId`.
- **Aggregates sync whole:** a workout with its exercises and sets; a template
  with its exercises.
- **Weights are fixed-point integers (hundredths) plus the entered unit.**
  Convert only for display.
- **Remembered weights are computed from history**, never stored.

## iOS keyboard and layout

Mobile-first, one-handed, portrait. A focused text field must never sit under
the software keyboard; a sticky primary action (Finish / Save) stays above it.
Respect safe areas and keep tap targets ~44pt or larger.

## Backend (Convex)

Convex functions live in `backend/`.

- **Schemas** — `backend/schemas/` per domain; compose in `backend/schema.ts`.
- **Routes** — `backend/routes/<feature>/` for queries, mutations, actions, and
  HTTP endpoints. Avoid new files at `backend/` root.

See `.cursor/rules/backend-organization.mdc`.

Account, auth, sync, and migration changes must preserve existing users and
data. Use synthetic accounts in tests — never real users, production data, or
production credentials.

## Old-format imports

Frozen payloads in `src/lib/fixtures/import-compat/` must keep parsing
(`pnpm test:import-compat`, also a pre-commit hook). Never edit those fixtures.
See `.cursor/rules/import-compat.mdc`.

## Deployment

Vercel deployments are disabled for this branch (`vercel.json`). Production and
staging still deploy from `main` / `staging` via `scripts/vercel-build.mjs`.
Do not deploy Convex from this branch until cutover is planned.

`pnpm sync:prod` / `pnpm sync:preview` push Convex environment variables.
