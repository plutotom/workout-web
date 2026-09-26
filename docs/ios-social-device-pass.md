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
