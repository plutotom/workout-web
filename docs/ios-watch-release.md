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

## Automated release checks

Run on the final integration commit:

```sh
pnpm test:review
pnpm typecheck:ios
pnpm test:watch-native # macOS and Xcode required
```

The native command checks the complete Watch app and the phone Watch transport
against Apple's simulator SDKs, then executes the production snapshot cache,
command-identity policy, and HealthKit closing logic in Swift test harnesses.
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

Paired Watch recording is still unverified. The connected Series 7 runs
watchOS 26.6, and development deployment is blocked by Developer Mode being
disabled. Offline cold-launch checks remain pending. These
iPhone results do not complete the paired-device checklist below.

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
