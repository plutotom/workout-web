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
