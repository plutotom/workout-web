This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

AI (templates + in-session reshape) and Pro billing (Polar) env vars are listed in [`.env.example`](./.env.example).

## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:4271](http://localhost:4271) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## iOS Development

Run the iOS app from the `workout-ios-v1` worktree with two terminals. The mobile app uses a custom Expo development client rather than Expo Go.

### Terminal 1 — backend and web services

From the worktree root, run:

```bash
pnpm worktree:start workout-ios-v1
```

Keep this process running. It starts the worktree's local Convex backend and Next.js server. Next.js must remain available while testing iOS because mobile authentication and AI requests use its API routes.

Stop both services with `Ctrl-C`. From another terminal, you can also stop the
managed services cleanly with:

```bash
pnpm worktree:stop workout-ios-v1
```

The launcher tracks only processes started for this worktree. If a previous
Convex setup was interrupted, the next start safely removes that worktree's
stale local backend before reusing its ports.

### Terminal 2 — iOS app

For the first run, or after changing a native dependency or Expo configuration, run:

```bash
pnpm ios
```

This builds the native development client, boots iOS Simulator, installs Workout, and starts Metro.

For the normal JavaScript and TypeScript development loop after the development client is installed, run:

```bash
pnpm dev:ios
```

Press `i` in the Expo terminal to open the app in Simulator. JavaScript and TypeScript changes should fast-refresh automatically.

To open Simulator manually:

```bash
open -a Simulator
```

Useful development shortcuts:

- `Cmd-R` in Simulator reloads the app.
- `Cmd-D` in Simulator opens the development menu.
- `r` in the Expo terminal reloads the app.

### Environment for physical devices (preview / staging)

Simulator and local dev use **`.env.local`** (via `pnpm ios` / `pnpm dev:ios`). Values are read at **build or Metro start** and baked into `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_WEB_URL`.

For a **real iPhone** (no localhost), use a separate file:

```bash
cp .env.mobile.preview.example .env.mobile.preview
# Edit .env.mobile.preview — preview Convex URL + HTTPS app redirect URI
```

| Command                           | Env file              | Use                                                  |
| --------------------------------- | --------------------- | ---------------------------------------------------- |
| `pnpm dev:ios`                    | `.env.local`          | Simulator + local worktree backend                   |
| `pnpm dev:ios:preview`            | `.env.mobile.preview` | Simulator against preview backends                   |
| `pnpm ios:device:preview`         | `.env.mobile.preview` | Debug install on device                              |
| `pnpm ios:device:preview:release` | `.env.mobile.preview` | Release install (no Metro; ~7 days on Personal Team) |

Override the file path anytime: `MOBILE_ENV_FILE=.env.mobile.preview pnpm ios -- --device`.

### Metro connection recovery

Do not run `pnpm ios` and `pnpm dev:ios` simultaneously. Competing Metro instances can select different ports, leaving the installed development client pointed at a stopped server.

If the app reports that it cannot connect to Metro:

1. Stop the existing mobile or Metro terminal with `Ctrl-C`.
2. Leave `pnpm worktree:start workout-ios-v1` running.
3. Run `pnpm ios` again to rebuild or reopen the development client against the active Metro server.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
