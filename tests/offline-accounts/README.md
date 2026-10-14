# Offline account lifecycle release gate

Run from the repository root after installing the workspace dependencies:

```bash
pnpm test:offline-accounts
```

For general reviews, run both required test suites with:

```bash
pnpm test:review
```

`.github/workflows/review.yml` runs `Unit tests` and `Offline account lifecycle`
for every PR, merge-group commit, and push to `main`/`staging`. There are no path
filters or successful fallbacks for failed data-preservation checks. GitHub's
merge rules require both checks against the latest base branch code. Keep the job
names stable; changing them also requires updating the repository ruleset.

Use Node 22.13+ (tested with 22.23.1), which provides `node:sqlite` without a
command-line flag. No simulator, development server, credentials, internet
connection, or existing account is needed. The SQLite experimental warning on
Node 22 is expected.

This is a separate release gate from `pnpm test`. It deliberately asserts correct
data preservation, including requirements the current app fails. Do not skip the
failing cases, mark them as expected failures, or use a name filter as release
approval. Run both commands before shipping changes to account or sync behavior.

## What stays real

Each scenario mounts the production `LocalDatabaseProvider`, local state/store,
and `SyncCoordinator`/`SyncWorker`. It uses the actual migrations and repository
against temporary **file-backed SQLite** databases. A restart unmounts the tree,
closes the connections, constructs a new session controller, and reopens the same
files. Files and synthetic stored credentials are deleted after each test.

`convex-test` runs the actual app schema, queries, mutations, account creation
action, validators, ownership checks, and receipt logic in an isolated in-memory
Convex backend. Its version is pinned to remain compatible with this project's
Convex version. Assertions inspect stored server rows as well as local rows,
pending operations, relationships, values, and duplicate counts.

## Boundaries simulated

The harness replaces native SQLite bindings with Node SQLite, secure credential
storage with a persistent fixture map, AppState with foreground/background
events, and Watch I/O with inert adapters. It replaces React's Convex hooks with
an injectable transport and synthesizes the AuthKit/token/account-ready boundary
around the **real `MobileSessionController`**. A strict WorkOS HTTP stub only
accepts synthetic `user_test_*` account verification requests; other external
fetches fail.

Offline transport rejects requests while preserving cached subscription data.
Online transport calls actual Convex handlers and can lose responses after a
commit or hold an acknowledgment until a newer local edit exists. Subscription
delivery and response delivery are independent. The fake retry clock advances
in steps while real handler/module I/O completes between steps, with seeded retry
jitter. Core new/existing account merges run with subscription updates before
acknowledgments and with updates withheld until uploads have been acknowledged.

This tests persistence and synchronization across the account lifecycle. It does
**not** test the actual WorkOS browser login, production `MobileAccountProvider`
and Convex token/subscription integration, device keychain, radio connectivity,
native keyboard, or hosted Convex infrastructure. Device and staging smoke tests
are still required for those boundaries.

## Scenarios

- Guest offline data survives restart and merges into new and existing accounts.
  Fixtures include completed workouts, sets, templates, custom lifts, notes,
  preferences, a gym, and named/default machines.
- Repeated sign-in preserves every server row without creating duplicates.
- Offline sign-in fails safely; signed-in offline edits and cached identity
  survive restart and token expiration, then synchronize after refresh.
- Server commits with lost responses retry the same operation without duplicating
  workouts, sets, receipts, or deleted children.
- A genuinely late old acknowledgment preserves a newer queued edit.
- Background edits wait for foreground; queues larger than one worker batch drain.
- A populated SQLite v7 database and old queued session payload migrate and merge
  with a minimal legacy Convex user and legacy workout.
- Concurrent cloud notes/preferences and deletion of an unedited cloud template
  merge with queued phone edits.
- Same-name custom lifts retain their definitions and resolve to the correct
  template/session references.
- Three reproducible stress schedules each cycle through eight five-minute
  offline periods, edits, reconnections, a restart, and lost responses. Uploads
  must converge within a bounded 125-second online window: up to two capped
  60-second retry delays plus scheduling time. Pending data must survive the first
  minute if a retry remains outstanding.
- Unauthenticated and authenticated-but-unbootstrapped uploads are rejected by
  the actual backend without receipts.
- Account switching, unit mismatches, template/place name collisions, and legacy
  notes are checked as strict data-preservation requirements.

## Current release blockers

Validated on the merged PR branch: **19 of 25 cases pass; six remain failing**.
The ordinary unit suite also passes (745 tests). A green unit suite alone does
not satisfy this release gate.

The initial implementation exposes six failing cases across five bug classes:

| Requirement                            | Observed behavior                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Account ownership                      | A's offline note and preference upload into B after sign-out/sign-in; A loses its pending changes.                                        |
| Weight meaning (both unit directions)  | A guest lb workout becomes numerically unchanged kg data, or a guest kg preference relabels existing lb cloud presets without conversion. |
| Different templates with the same name | The guest template replaces the existing cloud template's exercises and weights.                                                          |
| Same-name guest/cloud gym              | Local acknowledgment hits `UNIQUE constraint failed: local_places.remote_id`; remaining uploads stall.                                    |
| Legacy offline exercise note           | Reconnecting replaces a newer pre-outbox local note with the older cloud note.                                                            |

These exercise existing storage/sync paths also present on `main`, rather than
the keyboard layout changes alone. Keep the requirements enabled until the
implementations satisfy them. When fixing a failure, run the entire gate: a merge
fix can affect acknowledgments, idempotency, references, and account ownership.

See [the implementation and migration plan](fix-plan.md) for the recommended
fix order and additional regression cases.
