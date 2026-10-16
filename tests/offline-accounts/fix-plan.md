# Account data preservation: implementation and rollout

## Agreed behavior

- Genuine guest workouts merge automatically on sign-in or account creation.
- Signed-out account data and unsynced changes stay privately on the phone and
  resume only when that account returns.
- When older phone/cloud notes disagree without reliable ordering, phone text
  wins and cloud text remains recoverable.
- Existing account units govern guest merges. Distinct templates are additive;
  ambiguous historical ownership is never assigned to the next login.

## Implemented protections

`storage-scopes.ts` partitions guest and account SQLite files, persists ownership,
and journals guest transfers with stable IDs. Destination writes and an immutable
source snapshot commit before guest cleanup. A crash resumes the claimed owner's
transfer rather than adopting it into whichever account next signs in.

Sync checks the loaded partition, authenticated subject, and bootstrap owner.
Every iOS mutation also accepts an optional expected WorkOS subject and rejects
mismatches. Uploads wait for the initial owner-matched bootstrap transaction to
commit, independently of when authentication becomes ready. Optional fields
preserve old-client/schema compatibility. An in-flight
request or acknowledgment remains bound to its original partition.

Unstamped old shared databases remain untouched and recoverable. A last-used login
is not proof of who authored offline rows. Explicitly owned legacy files migrate
only to their owner and retain the original file. Settings exports an in-memory
migrated clone for manual recovery without modifying the source. Backup restores trust remote IDs only when already present in the current
account partition and consistently remap custom lifts before merging. Data and
upload intent commit together. Restores into an established different-unit
account convert prescriptions, so another account's backup cannot disappear,
block the upload queue, or silently reinterpret weights.

Guest merging converts workouts, target weights, template presets, gym/machine
memories, and queued/quarantined snapshots into the account unit. Only imported
rows convert when an account already has local state. Zero presets and captured
free-text note units retain their meaning. This fixes guest/bootstrap conversion;
it is not a redesign of historical units throughout web and mobile. Already
mislabelled historical numbers need evidence-backed recovery, not guessed backfills.

Template adoption requires the full ordered prescription to match. Different
same-name templates create suffixed names within the 100-character limit,
including multi-digit suffixes. Restored sessions derive template links from
verified destination templates; transfer repairs and queued payloads commit
together after weight conversion. Place/machine acknowledgments consolidate
aliases and their references in a SQLite transaction, preserving pending changes
and remembered prescriptions.

Legacy notes are reconciled before bootstrap can replace them. A baseline and
server revision distinguish clean cloud updates from pending phone edits. Phone
text wins uncertain conflicts; alternatives are included in backups and can be
reviewed/restored from Settings. Empty server tombstones retain revision ordering;
older subscriptions and acknowledgments cannot resurrect discarded text. Explicit
portable imports may fill cleared notes through the same revision-aware writer;
nonempty notes and opting out of note import remain unchanged.

## Required verification

Run `pnpm test:review` without skips or filters and report **both** unit and
lifecycle results. The lifecycle harness uses temporary real SQLite files and
synthetic Convex/WorkOS accounts. Its README documents the simulated boundaries.
Also run web/mobile typechecks, import compatibility checks, relevant lint, and
web/iOS bundle builds after implementation changes.

The two GitHub checks, `Unit tests` and `Offline account lifecycle`, are required
on the current integration commit for `main` and `staging`. Keep those job names
and the ruleset synchronized. Do not turn regressions into expected failures.

## Rollout order and remaining device checks

1. Deploy backend code first: optional expected-owner fields, bootstrap owner,
   optional note revisions/receipt revisions, and revision-preserving note clears.
   Older clients may omit all new fields; no destructive schema migration occurs.
2. On an isolated staging backend, exercise old and new clients against the new
   schema, including old user documents and legacy note rows with no revision.
3. On a simulator/device, verify real WorkOS sign-in and token refresh, SQLite
   provider remounts, sign-out/sign-in across two synthetic accounts, offline
   restart/reconnect, Settings recovery export/restore, and keyboard visibility.
   Node SQLite and the test transport cannot establish these native boundaries.
4. Distribute the mobile update only after those checks pass. Retain old database
   files and recovery snapshots. Do not deploy clients before backend support:
   older validators reject the client's new expected-owner argument.

No production users, production credentials, or real data belong in the lifecycle
harness. Historical corruption requires a separate reviewed recovery plan.
