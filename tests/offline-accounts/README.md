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

This is a separate release gate from `pnpm test`. It asserts data preservation
across account boundaries. Do not skip failing cases, mark them as expected
failures, or use a name filter as release approval. Run both suites before
shipping changes to account or sync behavior.

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

## Preservation coverage

The implementation adds regressions for the defects originally exposed by this
suite: cross-account pending uploads, both guest/account weight-unit directions,
same-name distinct templates, duplicate gym/machine identities, and legacy notes.
Additional cases cover interrupted guest transfers at both commit boundaries,
known versus unknown legacy ownership, every sync mutation's subject guard,
aliased gym memories, quarantined template prescriptions, note deletion revisions,
recoverable note alternatives, and restores of previously synced backups into the original or a different
account (signed out and already signed in), with interrupted restore rollback.

The strict suite currently contains **50 lifecycle cases**. Report its result
separately from the ordinary unit suite; neither replaces device/staging checks.

## Upgrade and recovery behavior

Guest data moves automatically into the signed-in account. Account data remains
in its own SQLite file across sign-out, including pending edits. Interrupted
transfers resume for the originally claimed account, even if another account
signs in next. Source cleanup happens only after the destination transaction
commits, with the original transfer retained as a recovery snapshot.

The old shared database is retained. Only an explicit persisted account owner
permits automatic migration; last-used credentials alone cannot prove ownership.
Unconfirmed older data stays on the phone and can be exported from **Settings →
Data recovery**. Export migrates a temporary copy, never the retained source.
Restore that file only into the correct account. Restores preserve remote IDs only when already known in the current account
partition; otherwise they create independent local identities. Restored rows and
their upload intent commit atomically. Repeated restores retain stable local IDs.

When phone and cloud notes differ without a reliable common baseline, phone text
wins and the other version remains reviewable/restorable in Settings and included
in backups. Note revisions and empty tombstones prevent stale subscriptions from
resurrecting cleared text. Existing account units govern guest merges; conversion
includes workout sets/targets, template presets, gym memories, and pending payloads.

Deploy the additive backend validators and note revisions **before** distributing
the updated mobile client. See [implementation and rollout notes](fix-plan.md).
