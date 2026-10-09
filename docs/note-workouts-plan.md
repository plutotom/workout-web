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

V1 status: the user reports that the basic note version is live and working
as of October 8, 2026. The next feature slice is a conversion preview.

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

### Next slice — conversion preview

Build this in three stages:

1. **Parser and examples.** Collect realistic workout notes and turn them
   into a test corpus. Add a shared, pure note parser with a dedicated draft
   type: recognized exercise names, explicit working sets, original source
   lines, and unresolved items. Keep unknown or ambiguous lines visible.
2. **Review UI.** Add an explicit Convert note action for Pro users. Preview
   the proposed exercises and sets alongside the original note. Let the user
   correct an exercise match or its numbers and resolve unsupported lines.
   Opening or cancelling the preview does not alter saved workout data.
3. **Apply confirmed sets.** Add a dedicated local transaction for applying
   the reviewed result to the existing completed session and queuing sync.
   Preserve its original note, date, duration, Health linkage, and single
   attendance entry. Exercise statistics begin using the confirmed sets.

Implementation constraints for these stages:

- Reuse the existing exercise catalog, custom lifts, and server Pro checks.
- Use a separate conversion contract from `sessionDraftSchema`: the current
  workout generator adds default sets and rounds numbers, which is suitable
  for suggested workouts but must not fabricate recorded work from a note.
- Interpret unsuffixed weights using the note's saved `noteUnit`; decide
  decimal precision and conversion rounding before accepting those forms.
- Match clear catalog names directly. If AI name resolution is added, keep
  it bounded to catalog/custom exercises and review any uncertain match.
- Until its meaning is settled, `3 sets` beside an explicit set list must not
  cause extra sets to be invented. A count mismatch should be shown for review.
- Use dedicated conversion gating: existing on-device workout generation can
  be available to free users, while this plan keeps note conversion Pro-only.
- Keep the first parser/preview work independent of background jobs. Decide
  generation authentication, quotas, and retry behavior when adding AI calls.

Notation rules remain proposals until checked against the user's examples.

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

#### October 8 examples

The user's new multiline and inline examples are saved verbatim as note bodies
in `src/lib/fixtures/note-workouts/user-examples.json`. The shared parser in
`src/lib/parse-workout-note.ts` is checked against these examples in
`src/lib/parse-workout-note.test.ts`.

These examples cover:

- Exercise headings followed by sets, with blank lines and `—-` separators.
- `6 @ 180`, `6@180`, comma-separated lists, and bare `10 50` pairs.
- Weight-first `10x6` notation, supplied as equivalent to six reps at ten.
- `fail` and `F` suffixes, including `4 @ 25 s fail` with separated tokens.
- Dumbbell-style `10s` suffixes and squat weight expressions like `45+10`.
- Unmatched headings such as `Gym` / `Normal gym`, which need review rather
  than an invented catalog match.

Confirmed interpretation:

- `5 45+10` means five reps with 45 lb and 10 lb plates on each side of a
  45 lb bar: 155 lb total. Plus expressions in this note dialect are per-side
  plate loading; ordinary weight-field addition remains unchanged.
- `6 @ 10s` means six reps with 10 lb dumbbells, recorded as 10 lb per dumbbell.
- `4 @ 25 fail` / `4@25F` means four successful reps followed by a failed
  attempt. Preserve the completed reps and a failure annotation; do not add
  a failed set or reduce the rep count.

Parser foundation status: implemented as a pure review-draft function, with
catalog/custom names and aliases supplied by the caller. No network requests
or saved-workout writes occur. Unknown names and malformed lines remain
visible through source text and issues; the parser does not pad sets. It
preserves explicit units and fractional weights for later review rather than
rounding them silently. The confirmed default bar for lb notes is 45 lb; kg
plate notation requires a caller-supplied bar weight.

Review UI status: completed note details and recaps now expose **Convert note ·
Pro**, checked against the existing server entitlement query. The sheet uses
the live catalog and custom lifts, offers explicit exercise selection, editable
reps/weights/units and failure annotations, and retains unsupported lines for
review or explicit note-only retention. It shows the original text verbatim.
Missing saved units require a choice; unknown kg bars require a reviewed total.
The development Pro override can open the preview, but confirmation requires
the actual server Pro grant before adopting or saving a workout.
Fractional weights remain visible with a warning instead of automatic rounding.
Over-limit lists show the limit and retain the remainder in the original note;
removing excess entries requires an explicit preview action.

Opening the sheet reads an existing local revision when available without
adopting remote data. Draft edits are temporary until **Confirm conversion**;
closing an edited preview asks before discarding them. Confirmation adopts a
remote-only note when needed, verifies the reviewed source is still current,
and commits the logged sets and sync snapshot in one SQLite transaction.
It switches the same completed session to list mode while retaining the exact
original note and its unit, timing, place, Health linkage, and attendance.
The original note remains visible in workout details and the structured recap.
Failures are saved as per-exercise annotations identifying the set and completed
rep count; no extra failed set is created.

Reviewed input weights use whole-number set fields. Cross-unit weights convert
to the account unit with the existing conversion factor, rounded to the nearest
whole unit. The preview shows the resulting saved weight before confirmation;
fractional source weights require a manual correction rather than silent
rounding. The transaction rejects changed preferences and out-of-range results.

Sync requires authenticated Pro access for the initial conversion, including
notes finished and converted offline before their first upload. It validates
the selected catalog/custom lifts and completed sets before writing. Already
converted workouts can sync after Pro expires, and stale note-only snapshots
cannot erase confirmed sets. Backend changes must deploy before the OTA client.
Device checks for keyboard layout, sheet dismissal, confirmation and sync,
and history navigation remain necessary.

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
