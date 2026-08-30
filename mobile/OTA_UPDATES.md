# OTA Updates

This app is configured for Expo OTA updates through EAS Update.

The committed source of truth is the Expo config in `app.json`. Native `ios/` is gitignored; regenerate with `npx expo prebuild` when native config changes.

## One-time setup

1. Install dependencies (from repo root): `pnpm install`
2. Link the Expo project (from `mobile/`): `pnpm exec eas init`
   - Adds `extra.eas.projectId` and `updates.url` to `app.json`.
3. Copy production env: `cp .env.mobile.production.example .env.mobile.production` and fill in production URLs.

## Current defaults

- Slug: `workout-ios-v1`
- Runtime version policy: `appVersion` (`expo.version` in `app.json`)
- Production channel: `production`
- Preview channel: `preview`

## What can ship over the air

- JavaScript and TypeScript changes
- UI and styling changes
- Copy/content changes
- Bundled asset changes such as images

## What still needs a new binary

- New native dependencies
- Expo SDK upgrades
- Config plugin changes
- Permission or entitlement changes
- Any change that alters native runtime compatibility

## Production OTA release

From the repo root:

```sh
pnpm ota:production -- "Describe the change"
```

Or from `mobile/`:

```sh
pnpm ota:production -- "Describe the change"
```

Deploys Convex production, then publishes to the `production` EAS Update channel. Users receive the update on the next launch; it applies after the app restarts.

JavaScript-only release (no Convex changes):

```sh
SKIP_CONVEX_DEPLOY=1 pnpm ota:production -- "Describe the change"
```

## Preview OTA release

From `mobile/`:

```sh
pnpm exec eas update --channel preview --message "Describe the change"
```

## Production native build + submit

Bump version, local EAS iOS build:

```sh
pnpm build:ios:production
```

After the `.ipa` is ready, submit to Apple and publish matching OTA:

```sh
pnpm release:ios:production
```

Use `KEEP_PAID_IOS_ENTITLEMENTS=1` when building a binary that keeps Push, Associated Domains, and Private Cloud Compute (paid Apple team / TestFlight).

## Versioning rule

`runtimeVersion` follows `expo.version`.

- Keep `expo.version` the same for OTA-only releases.
- Bump `expo.version` when you ship a new native binary (`build:ios:production` bumps it for you).
