# Data preservation fixes

The six failing lifecycle cases cover five defects in existing sync/storage
behavior. Fix the implementation while keeping the assertions strict. Account
isolation comes first because it affects every other migration and merge.

## 1. Isolate accounts and guest storage

`LocalDatabaseProvider` currently mounts one database for everyone. Sign-out
clears credentials, while pending rows remain available to the next account's
coordinator. Backend authorization correctly identifies the current account; it
cannot infer that a client payload actually belonged to someone else.

- Give the guest and each WorkOS user a separate durable storage partition.
  Persist ownership independently of tokens, which can expire or be removed.
- Gate sync on agreement between the loaded partition owner, authenticated
  subject, and bootstrapped account. Key the coordinator to that ownership scope.
- Stop the old worker before changing partitions. Old responses may acknowledge
  only their original partition and generation; they must never affect B's state.
- Treat guest adoption as an explicit, resumable merge with a durable journal and
  stable operation IDs. Copy genuine guest data into the destination account;
  keep the source until the destination's durable writes are confirmed.
- Back up the legacy database before migration. Where existing ownership can be
  established, migrate to that account without losing rows or pending operations.
  A legacy database with no trustworthy owner must remain recoverable and must
  not silently become guest data or upload into the next account.

Expand the account-switch case to cover session/template data, in-flight uploads,
offline switching, migration interruption, and recovery of both partitions.

## 2. Preserve the physical meaning of weights

Bootstrap currently changes a global unit preference without converting bare
numbers in workouts/templates. A guest unit preference can also relabel existing
account data. Preference acknowledgments alone cannot solve this.

- Capture the source unit before bootstrap/merge. Persist it with queued
  snapshots and stored workout/template data, rather than inferring it later from
  whichever account is signed in.
- Keep an existing account's display unit during guest adoption. Convert guest
  copies into that unit, or store an explicit source unit and convert for display.
  Do not let guest preferences silently change the existing account's unit.
- Make unit changes a consistent web/mobile data contract: recorded weights
  retain their original meaning, and display preferences change their rendering.
  Cover target weights, completed sets, template presets, gym/machine memories,
  and custom lifts. Preserve zero presets and captured `noteUnit` values.
- Add new Convex/wire fields as optional. Deploy server support before clients
  emit them. Define an explicit fallback for legacy clients/rows and retain old
  import fixtures. Backfill only from trustworthy unit information; do not
  blindly multiply existing production weights.

Already relabeled historical data may need an audited recovery from backups or
known original units. Current numbers alone do not identify the original intent.

## 3. Make guest template merges additive

`adoptCloudTemplateId` currently treats a unique matching name as identity, even
when the exercises and weights differ.

- Existing remote IDs or confirmed receipts establish identity; names do not.
- Keep distinct guest/cloud templates. Resolve names with a suffix, following
  the existing portable import behavior, and persist the source-to-target mapping
  so retries do not create another copy.
- If identical-content deduplication is retained, compare the full normalized
  definition, including weights and reps, and avoid overwriting the cloud row.
- Preserve references from sessions to the chosen target template.

Add same-name/same-slug/different-weight and lost-response retry cases, alongside
the existing same-name/different-exercise requirement.

## 4. Consolidate duplicate local place identities atomically

The server can adopt an existing same-name gym while bootstrap has already
inserted that remote gym into SQLite. `completePlaceSync` then assigns the same
unique remote ID to the guest row and fails, blocking every later upload.

- In one SQLite transaction, detect both local identities for the returned
  remote ID and select a canonical row.
- Repoint session places, template last-place references, machines, weight-memory
  rows, and queued snapshots before removing the redundant local identity.
- Preserve local pending edits during bootstrap; account for named/default
  machine identity collisions as well as place collisions.
- Acknowledge only the completed operation. Make the consolidation idempotent
  when replayed after a lost response or interrupted transaction.

Test subscription-before-ack and ack-before-subscription, duplicate machine names,
pending gym edits, and restart during consolidation.

## 5. Recover pre-outbox local notes before applying bootstrap

Older builds saved local exercise notes without upload entries. Their
`updated_at` values alone cannot establish a shared ordering with cloud notes;
the server currently exposes no comparable note revision history.

- Before the first cloud bootstrap, migrate legacy notes into a recoverable
  reconciliation set without discarding their original text.
- If only one side has text, preserve and synchronize it. If texts are equal,
  acknowledge the match. If both differ and there is no trustworthy common base,
  preserve both versions for conflict resolution rather than silently replacing
  either with a timestamp-based guess.
- Persist a sync baseline/revision for future edits, so dirty local changes,
  cloud deletions, and genuine conflicts can be distinguished.
- Keep oversized note protection and truncated-prefix recovery working.

Add conflicting notes, deletion versus offline edit, interrupted migration, and
repeated bootstrap cases. The original legacy-note requirement must stay green
without sacrificing the cloud version.

## Rollout order

1. Implement storage ownership and safe legacy migration.
2. Establish compatible unit/revision fields on the backend, then client support.
3. Implement additive guest template merging, place/machine consolidation, and
   legacy-note reconciliation against the new ownership model.
4. Run `pnpm test:review`, typechecks, and relevant migration/import tests. Verify
   real account-provider/token/subscription behavior on a device and staging.
5. Exercise interrupted upgrades and old clients against the new backend before
   rolling out the mobile update. Retain recovery snapshots until verified.

Do not automatically rewrite real account data to make the tests pass. Existing
corruption, if any, needs a separate evidence-backed recovery plan.
