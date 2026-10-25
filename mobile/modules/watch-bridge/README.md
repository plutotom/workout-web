# Connected Watch release

The 0.3.3 (21) candidate keeps phone-led workout logging. The Watch owns its
HealthKit recording; native workout-session mirroring carries live data and
scoped control messages. Standalone set/weight entry on Watch is deferred.

## Start and recovery contract

- `startWatchApp` and WatchConnectivity Start/context packets only wake the app.
  They do not authorize recording. A reachable Watch requests a fresh invitation
  for the phone's current account. Native admission commits to an atomic,
  protected journal before replying.
- Each recording attempt has its own identity, mapped to an app workout and
  account. Invitations expire after 45 seconds and are checked again after
  recovery/finalization. Actual recording starts when the builder is created.
- A launch failure can release phone export only if admission never occurred.
  Once admitted, elapsed time or an idle status response cannot release it.
  Watch recovery supplies its active identity before an expired, uncertain
  attempt can be retired. A healthy recording continues through a missing reply.
- SQLite commits Finish/Discard, the original end time, and the upload snapshot
  together. A coordinator transfers the scoped closure into native durable
  storage, then acknowledges that exact SQLite intent. Foreground and connection
  recovery retry delivery. The Watch persists closures before acknowledging them
  and applies them before new Starts.
- Closed app workouts fence late authorization completions. Rejected attempts
  can retry with a new recording identity. Delayed old rejections cannot release
  a newer attempt. A busy Watch explicitly rejects a competing recording.
- Native replay retains original account ownership. Guest recording ownership
  transfers only for workout ids named in the destination SQLite database's
  durable guest-transfer receipt. Account changes cannot adopt another account's
  results or send controls to its recording, even if restored app ids coincide.
- `WatchBridgeAppDelegateSubscriber` registers the mirroring handler at native
  launch. A replacement mirrored session replaces the old object after reconnect.
  WatchConnectivity retains closure/outcome delivery outside a live mirror;
  live metrics are not queued for historical playback.

The existing Watch finalization journal, unknown-save reconciliation, exact-source
Health lookup, and durable Discard/delete behavior remain in use. A disconnected
Watch cannot instantly learn about phone Finish. Saving the phone log and
confirming Watch completion remain separate outcomes.

## Upgrade and release checks

Build 21 also retains provisional custom-exercise aliases for open editors and
history, and resolves stale template draft slugs to the adopted exercise inside
the save transaction. This prevents the internal `custom:local-…` identifier from
replacing a lift's name when its initial upload finishes while an editor is open.
The Watch recording implementation is unchanged from the tested build 20.

Install matching iPhone and Watch binaries in place. An older Watch cannot admit
the new protocol. Both target versions/builds derive from `mobile/app.json`, and
the 0.3.3 runtime isolates this native change from 0.3.2 OTA bundles. SQLite stays
at the additive version 9; any rollback must continue supporting that schema.

Required automated commands:

```sh
pnpm test:review
pnpm test:watch-native
pnpm test:import-compat
pnpm typecheck:ios
pnpm exec tsc --noEmit
```

Native tests execute production Swift methods and the actual phone journal over
temporary files, plus React coordinators and synthetic SQLite. Apple SDK checks
cover the complete Watch app and phone transport. They do not establish radio,
Health persistence, locked-device behavior, or OS process recovery on hardware.

Keep the release draft until paired devices verify auto/manual start, reconnect,
phone Retry without signing out, Watch recovery, Finish and Discard, expiration
and old-message delivery around a second workout, and exactly one intended
Health workout. Check timestamps and associated samples as well as record count.
An overdue recording's samples must not be assumed repaired merely by changing
the final workout end time. Preserve user data and login; do not reset either app.

Deploy the additive account-export validator before distribution. No OTA can
install these native Watch changes. Native build success alone does not approve
TestFlight/App Store distribution or a production merge.
