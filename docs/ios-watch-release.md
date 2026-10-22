# iOS 0.3.2 / build 19 — Watch recording

This release adds a local Watch auto-start preference (on by default), manual
start, and recording-state recovery. Settings and Apple Health settings show
the same native switch. Phone Health export remains a separate preference.
Preferences are stored per local account partition; they do not sync to other
phones. Existing and newly created SQLite databases default Watch auto-start on.

## Recording behavior

- Auto-start uses the phone workout's start time. Manual start uses tap time.
- Leaving the workout, changing input modes, and losing reachability do not
  reset the recording state or launch another workout.
- Foreground/resume requests current Watch state without starting recording.
  Native lifecycle acknowledgements and Health UUIDs survive process restart.
- End on Watch leaves the phone workout open. Finish ends the corresponding
  Watch session; Discard discards its recording. New commands include session
  identity so delayed commands cannot stop a different workout.
- Closed Watch session identities are retained to reject delayed duplicate
  starts. Heart rate/calories remain in memory; only recent lifecycle/UUID
  acknowledgements are persisted by the phone bridge.
- Native acknowledgements are adopted only when the current local database
  owns that session. Those writes participate in account-transition tracking.
- Phone export waits while Watch launch is pending, resumes if launch fails,
  and is cancelled when recording is confirmed. The export coordinator also
  checks native recording evidence before saving, covering delayed/interrupted
  SQLite adoption.
- Editing a completed workout does not start Watch recording.
- Every phone start requests read access for workouts, heart rate, and active
  energy, with write access only for workouts. The Watch requests the same types
  after its view appears and offers an explicit retry if that request fails.
  An older workout-only grant does not bypass requests for newly added types.
- Blank readings show Health-settings guidance on both devices. A completed
  authorization request is not treated as proof that read access was granted:
  HealthKit intentionally hides individual read-permission decisions. Previously
  declined types must be enabled in Health settings.
- Restoring a Watch session reattaches its live data source as well as delegates.
- Finish/Discard received during Watch startup wait for HealthKit recovery.
  Closure commands are retained locally until acknowledged and are applied
  before queued starts. Recovery errors remain visible with an explicit retry.
- A new start waits until the previous session and builder finish closing.
  Collection/save callbacks check their originating session, builder, identity,
  and attempt, so late callbacks cannot save or clear a newer workout.
- Collection/save errors remain visible and retryable on Watch, with saving and
  retry states mirrored to iPhone. Failed saves do not create successful terminal
  acknowledgements or trigger phone fallback exports. If an ended builder cannot
  be recovered after process death, its failure remains visible for recovery or
  explicit discard; the app does not claim its Health data was saved.
- Before ending a Watch session, a single local finalization record retains its
  identity, sync identifier, start/end timestamps, phase, and Discard intent.
  Recovery never treats an absent active session as proof of the save outcome.
  Interrupted commits are reconciled by exact sync metadata and this Watch app’s
  Health source; empty/failed reads remain visible and nonterminal. No replacement
  workout is exported while the original outcome is unknown.
- Discard received during an in-flight save waits for its result. A committed
  workout is deleted from Health before Discard is acknowledged. Missing locked
  data or failed deletion retains the intent for explicit retry after unlocking;
  it cannot silently turn Discard into a successful save. A separate deleting
  phase and exact-identity/source predicate make removal idempotent: a successful
  zero-match deletion safely completes after a prior deletion callback was lost.
  Reconciliation checks
  sync metadata was attached successfully before beginning the save.
- iPhone retry triggers recovery when the builder no longer exists and receives
  a fresh state even if recovery still cannot restore it. Watch and phone labels
  refer to the Health update so retry covers saving, recovery, and pending removal.
  Cold-start recovery errors are scoped to waiting workout identities and clear
  the phone’s pending action without acknowledging closure. A scoped Retry
  command retries recovery without converting an outstanding Start into End.
  Surviving sessions restore the journal’s original End timestamp before replay,
  including through collection retry, so recovery delay does not extend duration.
- HealthKit can successfully save while locked without returning a workout UUID.
  A separate retained saved flag distinguishes that success from Discard and
  prevents a second phone export even when the recording event was missed.

Successful saves without UUIDs follow Apple's [finishWorkout contract](<https://developer.apple.com/documentation/healthkit/hkworkoutbuilder/finishworkout(completion:)>).
Authorization follows Apple's [workout-session guidance](https://developer.apple.com/documentation/healthkit/running-workout-sessions)
and [Health privacy contract](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data).

## Automated release checks

Run on the final integration commit:

```sh
pnpm test:review
pnpm typecheck:ios
pnpm test:watch-native # macOS and Xcode required
```

The native command checks the complete Watch app and the phone Watch transport
against Apple's simulator SDKs, then executes the production snapshot cache,
command-identity policy, Health authorization requests, recovered data-source
attachment, and HealthKit closing logic in Swift test harnesses. Closing tests
include recovery-time commands, retained commands through restart, starts during
finalization, obsolete callbacks, collection/save failures and retries, and
successful locked-device saves, process death at each finalization boundary,
commits with lost callbacks, Discard during save/deletion, query/deletion errors,
scoped reconciliation, successful deletion with callback loss, scoped cold-start
recovery errors, retained End timestamps with surviving sessions, and phone
recovery retry. SQLite and the offline gate cover retry/saving
ownership plus locked-device success without an initial recording event.
The **Watch native lifecycle** macOS CI job runs this alongside both mandatory
Linux review jobs. The offline account gate includes Watch delivery before and
after Finish, process restart, lost upload responses, both subscription orders,
duplicate acknowledgements, and replay into the wrong account. Unit checks also
cover SQLite write failure/replay, remount, reconnect, late launch errors,
manual timestamps, stop failures, and the installed legacy bridge API.

## Binary rollout

The full recovery and scoped-command behavior requires **both the new iPhone
binary and its bundled Watch app**. The optional JS bridge methods retain
compatibility with 0.3.1, but an OTA cannot add native methods or update the
Watch app. Version 0.3.2 uses its own app-version runtime; do not publish this
as a complete recovery fix for the 0.3.1 runtime.

Deploy the additive account-export validator before the native release. Run the
normal production build/release scripts after the checks and device validation.
SQLite v9 is additive, but older v8-only bundles refuse that database version;
any rollback bundle for 0.3.2 must retain v9 compatibility. Never reset a user's
database to make a rollback work.

## Recorded iPhone checks

On October 21, 2026, the signed Release candidate at `45c4c1a` was installed
over 0.3.1 / build 18 on an iPhone 15 Pro running iOS 27.0:

- The in-place upgrade to 0.3.2 / build 19 and app launch passed. Before/after
  SQLite snapshots confirmed that existing workout, set, note, and template
  content was preserved. Active databases migrated from v8 to v9 and passed
  integrity checks; the legacy database remained unchanged.
- Watch auto-start defaulted on after migration. Turning it off in Apple
  Health settings, terminating the app, and launching it again preserved the
  off value in both SQLite and the visible switch. Existing workout and note
  records remained unchanged across that restart.
- The user-assisted exercise-note typing check passed: the user reported that
  typing felt good after the requested multiline and cursor-editing check.
- With Airplane Mode on and Wi-Fi off, cold launches loaded the dashboard,
  an existing completed workout with its sets and note, and a template with
  its saved exercise note. All SQLite tables matched the fresh pre-test
  snapshots and passed integrity checks. Settings retained the saved account
  with the expected temporary "Account unavailable" message. This check read
  existing data; it did not create or modify workouts or queue test writes.
- Restoring connectivity automatically returned Settings to the authenticated
  account view without a sign-in prompt or retry tap. Workout, set, note, and
  outbox rows remained unchanged. The normal cloud refresh rebuilt template
  cache rows; template content and parsed exercise prescriptions still matched.

## Recorded Watch setup

The connected Series 7 runs watchOS 26.6. Developer Mode is enabled and
confirmed. A signed Watch-only Release build of 0.3.2 / build 19 was installed
over 0.3.1 / build 18 after refreshing the development profile to include the
Watch. The existing app preferences were retained, and the updated app launched
successfully. The iPhone remains on its validated 0.3.2 / build 19 binary.

Device Hub requires watchOS 27 for screen sharing, so Watch-screen observations
on this device require the tester's assistance.

## Recorded paired-device checks

On the installed `45c4c1a` candidate, with auto-start off:

- Manual start began the Watch timer near zero after the phone workout had
  already started. The iPhone displayed Recording and End on Watch.
- Force-closing and reopening only the iPhone retained the same workout identity,
  start time, and recording flag. The tester confirmed the Watch timer continued.
- Initially both devices showed blank heart-rate and energy values. Enabling
  their Health read permissions restored both live readings on both devices.
  This confirms missing access caused the symptom; the original permission
  prompt history cannot be reconstructed from HealthKit.
- Discarding the temporary workout stopped the Watch. SQLite confirmed the test
  session was abandoned with no pending phone Health export. The Watch retained
  a closed acknowledgement with no saved Health UUID. Existing session rows
  matched the pre-test baseline and all database integrity checks passed.

The permission-flow improvements, recovered live-data-source attachment, and
subsequent recovery/finalization/save-error fixes were added after those
observations. They pass native regression tests and Apple SDK typechecking;
their final binaries still need an on-device pass. Auto-start,
radio disconnect/reconnect, Watch process recovery, Finish, and the single-Health
workout checks below remain release gates.

## Required paired-device validation

Automated checks cannot validate Health authorization, wrist state, radio
delivery, HealthKit background recovery, or app installation on a real Watch.
Before production distribution, use a test iPhone/Watch and verify:

1. Upgrade an existing install; confirm defaults and old workout/note data.
2. Switch auto-start off and restart the phone app; starting a lift does not
   launch the Watch. Test the same preference from both settings screens.
3. Start manually several minutes into a lift; Watch duration starts at the tap.
4. Leave/reopen the workout and switch list/focus modes. Live state and End
   remain available, without a second Watch start.
5. Disconnect/reconnect, background/foreground, and force-close/reopen iPhone.
   Recording continues; state and the Health acknowledgement are recovered.
6. Test denied permissions, missing Watch app, locked Watch, and launch timeout.
   Verify actionable errors and successful explicit retry.
7. End on Watch; the phone workout remains open. Finish and Discard also work
   from iPhone. An old queued command must not end a newer workout.
8. With phone Health export on and off, finish/restart/reconnect and confirm
   one Health workout and one app workout. Test a delayed Health UUID and a
   sign-out/sign-in before delivery; only the original owner adopts it.
9. If tracking with Apple's Workout app or another tracker, turn auto-start off
   and review the separate phone Health export setting for overlap.

Do not merge/distribute on the assumption that simulator or fixture results
establish paired-device behavior. Record the tested OS versions and outcome in
the PR before release.
