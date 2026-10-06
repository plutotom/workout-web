# iOS sync reliability

On October 6, 2026, a retained 70-second production log window contained 401
`routes/ios/sync:pushTemplate` executions and 276 executions each of bootstrap
and template-list queries. Retried template uploads rewrote template documents
and exercise rows even when their operation already had a receipt. Those writes
invalidated both subscribed queries and restarted the old sync effect.

## Upload and acknowledgment

SQLite is the durable outbox. Each saved snapshot has an operation ID; retries
reuse it, and local completion removes only that operation. A newer edit replaces
the queued snapshot with a new operation ID and survives an older acknowledgment.
Template values and their queued snapshot commit in one exclusive transaction:
cloud refreshes and acknowledgments see either the previous save or the complete
new save, and a failed outbox write rolls back the edit.

`pushTemplate` returns a completed operation's original receipt without writing
anything, including when the template was later edited or deleted. New operations
with unchanged normalized content write their receipt but leave template rows and
`updatedAt` untouched. Actual edits still update the template.

The phone uses one sync worker. It serializes bootstrap application, uploads, and
local acknowledgments; cloud updates and SQLite revisions request another pass
rather than starting overlapping uploads. A pass handles at most 20 uploads and
schedules another pass when needed. Empty queues produce no polling requests.

Transient upload, bootstrap-application, or acknowledgment failures leave the
outbox intact and retry after 2, 4, 8, 16, 32, then at most 60 seconds, with jitter.
Cloud/local wakeups cannot bypass that delay. Backgrounding or signing out pauses
new work; an already-sent upload can still be acknowledged locally. Returning to
the foreground resumes queued work. The existing template-limit rejection keeps
the template locally and quarantines its upload so other queued work can continue.

## Cloud updates and local identity repair

A cloud template echo does not overwrite a pending local edit. If an older app
already stored both an authored local template and its bootstrap echo, upload
acknowledgment merges them transactionally, retaining the authored ID and all
workout links. If the echo has a newer queued edit, that edit and its operation ID
are moved to the surviving template. Newly known remote IDs are also written into
newer queued snapshots without deleting those snapshots. Workout-link repair and
its follow-up uploads commit in the same acknowledgment transaction, so an
interruption cannot drop the needed session upload.

Bootstrap application tracks the actual query snapshot rather than `serverTime`,
which does not change for every preference or note update. This keeps those cloud
updates flowing even when the timestamp remains unchanged.

## Rollout and verification

Deploy the backend first: receipt replays and unchanged saves immediately stop
rewriting templates for existing clients. Then ship the mobile JavaScript update
through the usual release/OTA process; no native module or schema migration is
required by this change. Existing SQLite data repairs itself on acknowledgment.

After release, check the same three functions in Convex usage and logs. A single
saved edit should cause one upload plus the necessary subscribed-query refreshes;
a lost response may add a receipt-only retry, with no template rewrite. Idle phones
should not continuously execute `pushTemplate`.

Regression coverage exercises the real registered mutation handler, actual SQLite
transactions with foreign keys enabled, the React coordinator under subscription
churn, and the scheduler with controlled timers. Device testing should also cover
airplane-mode edits, reconnect, background/foreground, and app restart with a queued
upload. These tests complement post-release usage checks.
