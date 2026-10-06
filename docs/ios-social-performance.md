# iOS social performance

Development builds emit local `[mobile-timing]` console records. Each measurement
has a numeric `id`, a fixed `name`, and `start` / `finish` events. Finish records
include `durationMs` and `success`, `failure`, or `cancelled`. No account IDs,
tokens, comment text, request arguments, or error payloads are recorded.
Release builds do not emit these diagnostics.

Start Metro using `pnpm dev:ios` for the configured local environment, or
`pnpm dev:ios:preview` for the preview environment, and open the development
client on a physical device. View its console in React Native DevTools.

Reproduce a cold launch into Social/Settings, a return from the background,
opening a post's comments, and tapping like, follow, and post comment. Compare
the matching start/finish records rather than adding overlapping durations.

| Measurement                                      | What it includes                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `auth.storage`                                   | Reading the stored credentials, including the local storage queue                    |
| `auth.token` / `auth.exchange`                   | Mobile auth HTTP request through response parsing; includes server-side WorkOS work  |
| `auth.convex`                                    | Waiting for Convex to confirm credentials, including interrupted-token recovery      |
| `auth.bootstrap`                                 | The account bootstrap action round trip, which may verify the email with WorkOS      |
| `auth.user`                                      | Waiting for the current-user query's first result                                    |
| `auth.account`                                   | Waiting for account readiness or connection failure within one account/retry attempt |
| `social.feed`, `.me`, `.notifications`           | Initial subscription readiness after the account connects                            |
| `social.profile`, `.posts`, `.post`, `.comments` | Subscription readiness on the destination screen                                     |
| `social.*.ui_commit`                             | Tap to the next React commit of the component handling the action                    |
| `social.*.confirmation`                          | Mutation invocation to Convex promise settlement, including query synchronization    |

`alreadyAvailable: true` means the query result existed when the hook observed
it. It is not proof of a persistent cache hit. A cancelled measurement means the
screen, account, or subscription changed before completion.

A fast UI commit with slow confirmation points toward the connection, auth, or
server path. A slow UI commit also warrants profiling JavaScript and rendering.
React commit timing does not measure the actual frame presented by iOS; use a
device profiler to confirm visible frame stalls. Query readiness timings include
client processing and scheduling and do not isolate backend execution time.

The social post screen may display its cached feed preview before `social.post`
finishes. That measurement intentionally tracks the actual detail subscription.
Do not expand caching or change the account verification policy until a device
trace identifies the expensive stage.

## Publishing a workout

Sharing uses the existing authenticated React client. On tap, the composer shows
a local pending preview and progress indicator immediately; this preview has no
post ID or interaction controls. It is not a successful publication. Only a
settled mutation opens the canonical post. Convex retains responsibility for
authentication recovery, automatic retries, and query consistency. See
[Convex retries](https://docs.convex.dev/client/react/overview#retries).

`social.share.ui_commit` measures the tap to the React commit showing the pending
preview. `social.share.confirmation` measures the live mutation through promise
settlement, including retries and query synchronization. Compare these with the
destination's `social.post` timing. A fast preview with slow confirmation warrants
separate network, auth, backend mutation, and subscribed-query profiling; it does
not establish which stage is slow. Development timings measure React commits,
not presented frames. Use Xcode Instruments for a release-build comparison,
since release builds do not emit these console diagnostics.

On a real iPhone, record tap → pending preview → visible published post. Exercise
Wi-Fi/cellular, interrupted connections, token expiry, background/resume, leaving
during publishing, server rejection/retry, and web-logged workouts. A connection
interruption should retain the pending preview while the live client retries.
A rejected mutation should restore the caption and retry button. A late response
should neither reopen a post nor show an alert on another screen. After success,
verify both header Back and the iOS swipe gesture return to Social in one step.
No before/after device latency measurements have yet been collected; this change
improves immediate feedback without claiming faster server execution.
