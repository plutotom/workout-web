# iOS social — later pass

Not a code review. This is the work left after the handle/search/quarantine/lockfile fixes.

**Bar:** TestFlight for us and a few people is OK. App Store social for everyone is not, until the production gates below.

Simulator lies for share sheets, Health, and the AuthKit browser bounce. Prefer a real iPhone.

---

## Device pass (do this first)

One run that hits all four:

> Offline workout → sign in from Share → post → copy on another account → 101st template while a new session still uploads.

### 1. Share

Workouts live in SQLite first. Share needs the Convex session id.

- [ ] Signed in, online: finish a strength workout → Share → caption → post. Post opens. It shows on profile and feed.
- [ ] Offline: finish a workout → Share. Expect wait copy (“Waiting for this workout to sync…”), not a crash or a fake id.
- [ ] Go online, wait for sync, reopen Share, post succeeds.
- [ ] Health summary / in-progress session cannot be shared.

Fail: `local:…` template ids or unsynced sessions hitting the server and retrying forever in the outbox.

### 2. Copy

Save someone else’s shared workout as _your_ template (`copyWorkout` → portable import).

- [ ] Copy a friend’s post. New template appears. Name collision gets a `(2)` suffix.
- [ ] Their `custom:…` lifts become yours (matched by name; archived ones revive).
- [ ] Copy the same post again. Second copy does not overwrite the first.
- [ ] Copy at 100 cloud templates. Clear error. No half-import. Outbox not stuck.

### 3. 100-template quarantine

Server cap is 100. The phone can still create templates locally. That create must not sit at the head of the outbox and block sessions.

- [ ] Account already has 100 synced templates.
- [ ] Create template #101 on the phone. Alert: saved on device, cannot sync.
- [ ] Log a new workout. **That session still syncs.**
- [ ] Delete one cloud template, edit local #101, it uploads.

Fail: new workouts stay on the phone, or no alert and the queue retries forever.

Server wording to match: `At most 100 templates are allowed` (needle `At most 100 templates`).

### 4. Sign-in return path (`next`)

Sign-in redirects on `isAuthenticated`, not `canUseApp`. Social and Share pass `next`.

- [ ] Signed out → Social tab → Sign in. After auth, land on **Social**, not Home.
- [ ] Signed out → Share on a specific workout → Sign in. Return to **that share screen**.
- [ ] Offline (local mode, no account) → open Sign in. Stay there until you actually sign in. Do not bounce because the app is “usable.”
- [ ] Kill the app mid-auth, or wait >5 minutes on the browser exchange. Fail cleanly. No broken stored session.

Fail: you sign in and lose the workout you were about to share; or offline users can never reach Sign in.

### 5. Saved login after reopening

Automated session tests cover cold launch, a simulated 30-day gap, transient refresh errors, concurrent callers, Keychain write retries, and stale responses after sign-out. Complete these checks on a physical iPhone before marking the device pass complete:

- [ ] Sign in through the popup, force-close, and reopen. The account reconnects without another popup.
- [ ] Force-close, enable airplane mode, and reopen. Local workouts and the cached account remain available; cloud writes wait for verified auth.
- [ ] Restore connectivity and return to the foreground. The saved account reconnects automatically.
- [ ] Background beyond access-token expiry, then reopen. Access-token renewal happens silently.
- [ ] Explicitly sign out, force-close, and reopen. The saved login does not return.
- [ ] Revoke the session in WorkOS. Cloud access stops; local workouts remain accessible and account reconnection requires sign-in.

The controller in `mobile/src/auth/session-controller.ts` owns restoration, refresh, retry timers, and serialized Keychain writes. Only a typed `401 / session_expired` response clears saved credentials. Temporary server failures return `503 / retry_later`; retries pause in the background.

Deploy the web auth changes before releasing the mobile changes. New mobile login tickets require proof held by the initiating app. Legacy tickets remain supported for installed older apps during rollout; they are not proof-bound. The web callback removes its duplicate session cookie so the browser cannot rotate the mobile credential independently. The existing atomic `workout.auth.v2` Keychain format and after-first-unlock accessibility are preserved. Older v1 credentials migrate through the existing Keychain helper before refresh; failed writes retry without discarding rotated credentials.

Production retention also depends on WorkOS **Applications → production application → Sessions**. On 2026-10-09, the dashboard for `workout-web deafening-lemur-863 (prod)` / default application `client_01KW2VKY4JBPDP51S77ZYB3XS6` showed a 365-day maximum session length, 5-minute access tokens, and a 2-day inactivity timeout. The inactivity timeout was changed to **90 days**; the maximum and access-token duration were retained. These settings are shared by web and mobile. Active use can renew access tokens silently within the session limits; an expired or revoked session still requires sign-in. Dashboard configuration is separate from the automated tests, and the code fixes still require deployment and the physical-device checks above.

---

## Production gates (before everyone sees Social)

Do not call this an open social launch until these exist.

1. **Stop auto-publishing email-local handles.** `jane.doe@company.com` must not become public `@jane_doe`. Assign nothing, or a random `athlete_xxxx`, and let people pick a username.
2. **Empty Find Athletes is not a directory.** No “suggested” newest accounts. Results only after they type, or only people they already follow.
3. **Rate-limit follow and comment.** `consumeRateLimit` already exists for AI/MCP/billing. Use it.
4. **Block, or at least hide/report.** Crude is fine. Zero safety is not.

Also true, not blockers for TestFlight:

- Web has no social. Don’t market it on the website.
- `healthSegments` is accepted on the server; iOS does not upload `health_segments_json` yet. Don’t advertise multisport legs.
- `search_displayName` only works after that Convex search index is deployed. Handle prefix search works without it.

---

## Deploy

Ship **Convex backend + web together**. iOS can follow; search still accepts legacy `{ handle }` as well as `{ query }`.

Include `template-sync-policy` in the same commit as the sync coordinator.

Do **not** regenerate `pnpm-lock.yaml` without the HealthKit patch and `pnpm-workspace.yaml` overrides.

Production iOS sign-in needs `MOBILE_AUTH_ENABLED=true`.
