# Note workouts — plan

## Current direction

Ship a basic note workout before designing the parser. On iOS, anyone can
start a note workout, type freely while lifting, and finish it. Save the note
exactly as typed and show it in history and recap.

A finished note workout records that the user lifted that day. It contributes
to attendance, streaks, and session counts, but provides no exercise, set,
weight, volume, personal-record, or last-weight data. Attendance does not
depend on recognizing any notation in the note.

Apple Watch start, heart rate, HealthKit export, place tagging, and session
timing stay the same as an ordinary tracked session.

Parsing, formatting, review, and the exercise/set edit page come later.
Their design must not delay the basic release.

## V1 decisions

| Question               | Decision                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Access                 | Note workouts are free for everyone. No entitlement checks in V1.                                                                    |
| Platforms              | iOS creation, typing, history, and recap. No web note UI in this release.                                                            |
| Editor                 | One multiline plain-text field. Preserve whitespace and wording.                                                                     |
| Saving                 | Local autosave and normal session sync; works offline.                                                                               |
| Finish                 | Flush the latest text, complete the session, end Watch/Health as today, and open recap. No formatting or review.                     |
| Blank note             | Whitespace-only note uses the discard prompt. A completed nonblank note records attendance.                                          |
| Attendance             | Count lifting that day using existing attendance/day/week conventions. Count the session once, including after any later conversion. |
| Exercise/weight goals  | No contribution until actual exercises and working sets exist. Never fabricate a lift or a zero-weight set for attendance.           |
| Health export          | Export on Finish even with no structured exercises.                                                                                  |
| Templates              | Skip Save as template and Update template prompts.                                                                                   |
| Social                 | Retain today's requirement of 1–50 credited exercises. Unparsed notes cannot be posted.                                              |
| Units                  | Save the account unit at creation as `noteUnit` for future interpretation. No number conversion in V1.                               |
| Past notes             | No automatic conversion when parsing ships.                                                                                          |
| Edit note text         | Users can edit the saved note after finishing. Save the new text and sync it; session timing and completion stay intact.             |
| Exercise/set edit page | Deferred; this is separate from editing plain note text.                                                                             |

The existing helper name `sessionCountsTowardGoals` covers attendance and
weekly workout counting. Supporting note attendance there must not create
exercise or weight data. Mobile and web must use the same rule.

## V1 lifecycle

```text
Start note workout
  → type freely (local autosave + normal sync)
  → Finish
      → flush current text, including a pending debounce
      → blank: discard prompt
      → nonblank: persist text and complete the session together
      → Watch/Health end and export through the existing lifecycle
      → recap shows the saved note
```

Completion must not depend on network access. Closing before completion is
persisted leaves a resumable active workout; closing afterward leaves a
completed note available in history/recap. There is no awaiting-review state.

A debounce can lose the last keystrokes on an abrupt force-quit. Flush on
Finish and on app backgrounding when possible; do not promise uncommitted
keystrokes survive a process kill.

## Smaller PRs for V1

Each PR is independently reviewable. PRs 1–2 are preparatory; expose the start
option only in PR 3, when the whole user flow works.

### PR 1 — Store and preserve note sessions

- Add optional `inputMode: "list" | "note"`, `noteBody`, and
  `noteUnit: "lb" | "kg"` to the session schema and iOS snapshot validator.
  Missing input mode means list mode.
- Append a SQLite migration for `input_mode`, `note_body`, and `note_unit`;
  preserve them in session reads, snapshots, and sync persistence.
- Bound note length consistently on phone and server (20,000 characters).
  Make the editor limit visible; never truncate silently.
- Preserve optional note fields through account export, on-device
  backup/restore, and web session backups where applicable.
- Add compatibility coverage for a note session in its actual backup format.
  Never rewrite frozen import fixtures; keep new fields optional with
  defaults on read so old backups still restore.
- Defer parse jobs, pending status, raw/formatted duplicates, and line
  timestamps. V1's `noteBody` is the original text.
- Provide a local note-text writer for active and completed note sessions;
  preserve completion/timing, bump the update timestamp, and queue a snapshot.
- Verify migration, snapshot round-trip, and backup/restore with focused tests.

### PR 2 — History, recap, and attendance

- Include completed note sessions in local completed-session reads even with
  `exercises: []`.
- Count completed nonblank notes in mobile and backend attendance, streaks,
  and session counts without invoking a parser.
- Keep exercise, set, volume, PR, and last-weight calculations based on actual
  structured sets only.
- Show the note in iOS recap/history, alongside
  available session/Health details. Avoid an empty lift recap.
- Retain social restrictions; keep MCP history/get and exports compatible
  with empty exercise arrays.
- Verify using seeded sessions: note visible, attendance credited, no lift
  data invented, list-session behavior unchanged.

### PR 3 — Start, type, and finish on iOS

- Add Note workout next to Quick start and extend `useStartWorkout`.
  Keep the existing workout-already-in-progress prompt.
- Follow blank-workout creation conventions, with template name
  `"Note workout"`, note input mode, and the account unit captured at start.
- Render the note editor at `/workout/[sessionId]` for note sessions.
- Mount `WatchCompanionCard`; retain timing and place behavior.
- Debounce autosave (~500ms), queue snapshots, and resume persisted text.
- Keep Finish visible above the keyboard and the text area scrollable.
- Persist the current editor value and complete the session in one local
  transaction, then queue the completed snapshot. A delayed autosave must not
  overwrite the finished snapshot or omit the final keystrokes.
- Nonblank Finish opens recap, skips template prompts, and runs existing
  Watch/Health completion/export behavior. Blank Finish uses discard handling.
- Add Edit note on completed note recaps. Save text through the note writer;
  do not re-finish, repeat Health export, or create another attendance entry.
  Retain a nonblank body on completed notes, with a clear validation message
  if the user tries to save only whitespace.
- Verify on device: offline finish, reconnect/sync, app reopening, immediate
  Finish after typing, Watch HR, Health export, and attendance without lift
  or weight credit.
- Verify post-finish text edits offline and after reconnect, with unchanged
  timing and no duplicated Health export or attendance.

## Builder notes for V1

### Ownership and classification

- iOS sessions live in SQLite (`mobile/src/data/local/`) and are pushed via
  `backend/routes/ios/sync.ts` → `pushSession`. Bootstrap does not send
  sessions down. Preserve that ownership model.
- Keep `sessionKind: "tracked"`; it controls Health export/deduplication and
  distinguishes Apple Health summaries. Input method belongs in `inputMode`.
- Use `noteBody`, since `sessionExercises.notes` and `exerciseNotes` already
  mean other things.
- Queue a session snapshot after session writes. The outbox coalesces updates
  for an entity. Bump `updated_at`; the server rejects snapshots older than
  its stored `clientUpdatedAt`.
- Empty exercise arrays are legal for iOS snapshots. Finish notes locally;
  web/MCP finish functions still require logged sets.

### Paths to check

| Location                                                       | Required behavior                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `mobile/src/components/workout/workout-screen.tsx`             | Route note mode to its editor; bypass list-mode no-sets discard and template prompts. |
| `mobile/src/data/local/repository.ts`                          | Preserve note fields, include completed notes, finish with latest text persisted.     |
| `mobile/src/data/local/insights.ts`                            | Attendance from completed notes; lift metrics from structured sets.                   |
| `backend/lib/health_sessions.ts` and `backend/lib/insights.ts` | Match mobile attendance, including loaded-session fields and filtering.               |
| `mobile/src/health/watch-companion-card.tsx`                   | Mount in the editor so Watch start still works.                                       |
| `mobile/src/health/export.ts`                                  | Preserve tracked-session export with zero structured sets.                            |
| Account export / mobile and web backups                        | Preserve note fields through export and restore.                                      |

### Mobile and verification

- Append a migration using the current `PRAGMA user_version`; check its
  current value rather than relying on a number in this document.
- Root already has `KeyboardProvider`. Follow `Screen` and
  `KeyboardStickyFooter` patterns with safe areas respected. Do not add RN
  `KeyboardAvoidingView` inside a pageSheet.
- No new native modules planned. Check current `runtimeVersion` policy before
  relying on OTA delivery.
- Use repository worktree commands if isolation is needed. Never copy
  arbitrary environment files or remote deployment credentials.
- Use focused tests per PR and applicable release checks: `pnpm test`,
  `pnpm test:import-compat`, `pnpm lint`, `pnpm typecheck:ios` (or
  `pnpm verify:ios`), and backend typechecking/bundling against an appropriate
  local/dev deployment. Complete the PR 3 device acceptance cases.
- No browser validation required by this plan. Ask before any git command.
  Do not build or deploy the feature as part of reviewing this plan.

## Later — parsing and formatting

Conversion to tracked working sets remains Pro-only. Free users retain saved
notes and attendance. The exercise/set edit page and reassignment stay later
work; they are not prerequisites for V1.

The original parser dialect and conversion PR sequence are proposals to
revisit, not settled requirements. Collect realistic notes first, then decide
ambiguity, bodyweight, units, and unrecognized-line behavior. Split formatting,
review, server conversion, and local application into small PRs when designed.

### User examples for the future parser corpus

```text
Bench 3 sets 10 @ 150, 10@150 6@160
```

`10 @ 150` means 10 reps at 150 lb. Clarify whether `3 sets` summarizes the
listed sets or instructs expansion before implementing that rule.

```text
Pull up, 10, 9, 9
```

Three bodyweight sets: 10 reps, 9 reps, then 9 reps.

```text
Bent over row
- 150 10 reps
- 160 8 reps
- 180 6
```

Exercise heading, then weight/reps lines, with the word `reps` optional.
V1 preserves all these examples as text without interpretation.

### Constraints to retain when conversion is designed

- Preserve original text. If formatting is introduced, separate original and
  confirmed versions and choose which drives conversion/retry.
- Use saved unit context, explicit suffixes, and an explicit rounding policy.
  Formatting must be idempotent with that context; changing account units
  must not reinterpret old numbers.
- Keep unknown lines visible; never silently drop overflow or guess a credited
  exercise. Warmups stay in the note without credited sets. List-mode warmup
  support would be separate work.
- Shared pure parsing code belongs in `src/lib/` (mobile `@shared/...`),
  with Hermes-compatible dependencies. Evaluate `parseLiftNumber` and
  `convertWeight` against the eventual grammar and precision policy.
- Match catalog/custom names first; AI may resolve remaining names grounded
  to those catalogs. Do not duplicate the catalog.
- Check live entitlement (Polar or manual Pro), including before model work.
  Design rate limits, quotas, retries, and concurrent-job behavior explicitly.
- Choose worker orchestration and authentication before implementing enqueue.
  Existing Next AI routes use user access tokens; a scheduled Convex worker
  calling Next needs an explicit auth design.
- Server results are applied transactionally by the phone, then synced.
  Existing set writers reject completed sessions; add a dedicated writer.
- Respect ownership, session deletion, note revisions, and retries. Separate
  content identity from a rerun request: unchanged text has the same hash.
- Sync offline-created custom lifts before matching. Bound drafts/results to
  current exercise/set limits and validate server results.
- Introduce pending/failed states only with working enqueue and coordination.
  V1 notes must not become surprise jobs when conversion ships.
- If later review happens after Watch/Health ends, define recovery for
  completed sessions awaiting review.
- Line timestamps, notifications, aliases, advanced notation, past-note
  conversion, and web note creation are deferred. Past-note conversion needs
  an explicit request and a bounded backlog.
