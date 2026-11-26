# Grayed Lift — native iOS rebuild plan

Native SwiftUI rewrite of the Expo app. The web app is retired; the Convex
backend in `backend/` stays. Four users, ~6 months of data, all on social.

## Decisions

- **Platform:** SwiftUI, iOS 26 minimum. Watch companion later.
- **Repo:** app lives in `ios/` next to `backend/` on the `iOS-native` branch.
  The Expo app and web app are removed on this branch and keep running from
  `main` until cutover.
- **Local store:** SQLite via GRDB. Explicit, versioned migrations. Every
  schema version keeps a snapshot DB that tests upgrade to current.
- **Auth:** Clerk (native Sign in with Apple, Google, email/password).
  Sign-in required on first launch. Convex trusts both WorkOS and Clerk during
  cutover. Each identity's sync owner is fixed at first sign-in
  (`nativeIdentities`); a legacy user row is adopted only through a
  provider-verified email that matches exactly one user. The Clerk `convex` JWT
  template must include `email` and `email_verified` claims.
- **Offline forever:** a token never gates local data. Expired session pauses
  sync and shows a "Sign in to sync" banner; the outbox waits.
- **Sync:** own outbox in GRDB + plain HTTPS push/pull to Convex HTTP actions.
  The Convex Swift client is not used for sync (no durable queue, can replay
  committed mutations, no offline cache). Maybe later for live feed only.
- **CI:** Xcode Cloud for TestFlight builds on request. GitHub Actions runs only
  the Linux `GrayedCore` tests. No automatic app builds.

## Cut

Pro / StoreKit / admin grants, cloud AI, MCP keys, template sharing (link,
file, code — replaced by "copy template" from a friend's post), per-lift
technique cues, session notes, set kinds, duplicate-template cleanup, web app,
"recovery data" and note-conflict pickers.

## Feature rules

- One active workout at a time; continue-or-discard prompt.
- **Sticky note** lives on an exercise inside a template. Editing it during a
  workout started from that template updates the template. Quick Start
  workouts have none until saved as a template. Templates have no description.
- Dashboard shows the 3 most recently used templates; weekly goal is a setting.
- List view only at first; Focus view designed later alongside the Watch.
- Switching gyms mid-workout re-files the workout and only *suggests* the new
  gym's remembered values for empty sets.
- Remembered weights are computed from history (exercise + place + machine),
  never stored.
- Rest timer is deferred; if built, one global duration with optional Live
  Activity, toggleable.
- Backup/restore (later): the SQLite file itself, restored by running the same
  migrations, merged additively by id (never deletes or overwrites).
- On-device AI only (Apple Foundation Models) for drafting/editing templates
  and workouts.
- Note Workout + parser postponed; parser must be deterministic and tested,
  AI only resolves ambiguity.

## Data model

Every synced row: `id` (client UUID), `ownerId`, `createdAt`, `updatedAt`,
`deletedAt` (tombstone).

Sync units are aggregates: a workout (+ exercises + sets) and a template
(+ exercises) travel whole. Places, machines, custom exercises, and settings
sync per row. Built-in exercises ship in the app with stable ids
(`builtin:<slug>`) and never sync.

### Phone (GRDB)

```text
exercise          id, source(builtin|custom), name, muscleGroups[], equipment,
                  usesBar, loadType(weighted|assisted|bodyweight), archivedAt
place             id, name, isDefault, archivedAt
machine           id, placeId, name, archivedAt

template          id, name
template_exercise id, templateId, position, exerciseId,
                  setCount, targetReps, presetWeight, presetUnit, stickyNote

workout           id, status(active|completed), startedAt, endedAt,
                  placeId?, templateId?
workout_exercise  id, workoutId, position, exerciseId, machineId?
workout_set       id, workoutExerciseId, position, weight, unit, reps,
                  completedAt?

settings          ownerId, defaultUnit, barWeight, barUnit, weeklyGoal,
                  preferredView
```

Local-only:

```text
outbox       opId, accountId, aggregateType, aggregateId, payload(json),
             baseVersion, createdAt, attempts, lastError
sync_state   accountId, pullCursor, lastPullAt
```

Rules:

- Partial unique index: one `status = 'active'` workout per owner.
- Weights are fixed-point integers in hundredths plus the entered unit;
  convert only for display.
- Template "last used" is derived from workouts.
- Starting from a template copies its exercises/sets into the workout.
- A local edit and its outbox entry commit in one transaction.
- Outbox only flushes entries whose `accountId` matches the signed-in user.

### Server (Convex)

```text
users            id, clerkId?, workosId?, email, displayName, username, bio
workouts         id, ownerId, version, seq, updatedAt, deletedAt, doc
templates        id, ownerId, version, seq, updatedAt, deletedAt, doc
exercises / places / machines / settings   per row, same fields
appliedOps       opId, ownerId
userSeq          ownerId, seq
```

- **Push:** skip ops already in `appliedOps`; otherwise write, bump `version`,
  assign next `seq`, record `opId`. If server `version` > op `baseVersion`,
  newer `updatedAt` wins.
- **Pull:** everything with `seq` > cursor, tombstones included. Runs on
  launch, reconnect, and push-notification receipt.

### Social (stage 2.5, online-only except queued posts)

```text
follows        followerId, followeeId
posts          id, authorId, workoutId, caption, summary(snapshot), createdAt
reactions      postId, userId
comments       id, postId, authorId, body, deletedAt
notifications  id, userId, type(follow|reaction|comment), actorId, postId?, readAt
pushTokens     userId, apnsToken
```

Editing a posted workout updates its post; never creates a second one.

## Old data migration

One-time Convex script maps old workouts, templates, custom lifts, places,
machines, and settings into the new tables, preserving ids. Cues are dropped.
Old social posts are optional. Users matched by email and linked to Clerk ids.
New tables live beside old ones until cutover.

## Stages

| Stage                      | Contents                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| **0. Foundations**         | Packages, GRDB schema + migration harness, Clerk auth spike, outbox sync spike, Convex push/pull, CI     |
| **1. Logger MVP**          | Quick Start, logging, exercise library, plate calculator, history, edit finished workouts, settings      |
| **2. Your edge**           | Places, machines, remembered weights, templates + sticky notes, dashboard, weekly goal                   |
| **2.5 Social + cutover**   | Feed, follows, reactions, comments, push notifications, copy template from post, old-data migration      |
| **3. Body data**           | Write to Health, Health import (Strava model, maybe into feed), Watch companion                          |
| **4. Insights**            | Lift pages, Insights views, recap, share image, backup/restore, rest timer if wanted                     |
| **5. Notes + AI**          | Note Workout, parser, preview/correction, on-device AI drafting                                          |

## Stage 0 checklist

1. `ios/` Xcode project with Swift packages:
   - `GrayedCore` — pure Swift models, plate math, 1RM, remembered-weight
     logic. Tests run on Linux.
   - `GrayedStore` — GRDB schema, migrations, outbox, pull.
   - App target + placeholder Watch target.
2. Migration harness: snapshot DB per schema version, upgraded in tests.
3. Auth spike: native Sign in with Apple via Clerk → authenticated Convex call.
   WorkOS stays enabled for the old app.
4. Sync spike: log offline → force-quit → reconnect → arrives exactly once;
   fresh install pulls it back.
5. Convex: new tables, `appliedOps`, `userSeq`, push/pull HTTP actions,
   alongside old tables.
6. CI: Xcode Cloud → TestFlight on request; GitHub Actions for Linux
   `GrayedCore` tests.

**Done when** an empty app installs on a phone from CI and the sync spike
passes.
