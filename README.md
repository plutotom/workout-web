This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

AI (templates + in-session reshape) and Pro billing (Polar) env vars are listed in [`.env.example`](./.env.example).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:4271](http://localhost:4271) with your browser to see the result.

## Staging

`origin/staging` is the long-lived, public test channel for changes that are not
ready for production. It has its own Vercel project, WorkOS callback, and
persistent Convex backend:

| Environment              | Frontend                                                   | Convex data                                                      |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| Managed local worktree   | Worktree-specific localhost port                           | Isolated Convex Local database in that worktree                  |
| Ordinary feature preview | Protected preview on the main `workout-web` Vercel project | Configured shared Preview backend; backend deployment is skipped |
| `staging`                | Public `workout-web-staging` Vercel Preview                | Persistent `staging` / `successful-jackal-872` deployment        |
| `main`                   | Production `workout-web` Vercel deployment                 | Production Convex deployment                                     |

Convex does not create a cloud development deployment for every Git branch in
this repository. Managed worktrees use isolated Convex Local databases, so
those development databases do not appear as branch deployments in the Convex
cloud dashboard.

### Publishing a change to staging

Test backend and frontend changes in the feature worktree first. Then either
open a pull request with `staging` as its base, or merge the feature branch from
the checkout used to publish staging:

```bash
git fetch origin
git merge <feature-branch>
git push origin HEAD:staging
```

The managed staging worktree uses a local `wt/workout-staging` branch that
tracks `origin/staging`, so `git push origin HEAD:staging` is intentional.

Every push to `origin/staging` automatically:

1. Starts a Preview deployment in the isolated `workout-web-staging` Vercel
   project.
2. Uses a branch-scoped deploy key that can deploy only to the persistent
   Convex staging deployment, `successful-jackal-872`.
3. Pushes the current backend functions and schema without clearing staging
   data.
4. Builds Next.js against the backend URL returned by that Convex deployment.
5. Uses the WorkOS callback
   `https://staging.workout.plutotom.com/callback`.
6. Updates [staging.workout.plutotom.com](https://staging.workout.plutotom.com)
   after the deployment succeeds.

The staging Vercel project builds only the `staging` branch. Production and
ordinary feature previews remain on the protected `workout-web` project.

In the Convex dashboard, use the deployment named `successful-jackal-872` when
inspecting staging functions, logs, environment variables, or data. The unused
`original-reindeer-313` Preview deployment is not connected to the staging
website.

### Verifying a staging deployment

Wait for the newest `workout-web-staging` deployment to report **Preview** and
**Ready**, then verify:

1. The staging URL loads without a Vercel login screen.
2. Sign-in goes to WorkOS and returns to the staging `/callback`.
3. An authenticated read and write work.
4. The changed data survives a refresh, browser restart, and later deployment.
5. Backend/schema changes appear under `successful-jackal-872`.

If a staging build fails, inspect its build log and leave the previous working
deployment in place. Do not work around a missing staging credential by using a
production credential.

### Persistent data and schema changes

Staging data is intentionally long-lived and is never cleared during a normal
deployment. This makes staging production-like, but it also means schema
changes must remain compatible with existing staging documents.

For a new field on an existing table:

1. Add it as optional.
2. Deploy to staging.
3. Backfill existing documents.
4. Make it required only after the backfill is complete.

Do not clear `successful-jackal-872` to fix a schema deployment. Migrate its
data instead. Staging uses preview/sandbox credentials and must never receive
production Convex data, production WorkOS credentials, or a production Convex
deploy key.

### Promoting staging changes

After verification, merge `staging` into `main` and let `main` perform a clean
production build. Never promote the staging Vercel artifact directly to
production because `NEXT_PUBLIC_*` values are fixed when Next.js builds.

### Staging maintenance

Run `pnpm sync:preview:all` from a cloud-connected checkout when rotating
staging credentials. Override `STAGING_APP_URL` only if the staging domain
changes.

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
