<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Backend (Convex)

Convex functions live in `backend/`. As the app grows:

- **Schemas** — `backend/schemas/` per domain; compose in `backend/schema.ts` only.
- **Routes** — `backend/routes/<feature>/` (e.g. `auth/`, `templates/`, `workouts/`) for queries, mutations, and actions. Avoid dumping new function files at `backend/` root.

See `.cursor/rules/backend-organization.mdc` for full conventions.

## Deployment

Vercel runs `pnpm build` → `scripts/vercel-build.mjs`:

The long-lived staging branch is hosted by the isolated
`workout-web-staging` Vercel project. That project builds only `staging` and
has public deployment access for the staging custom domain. The main
`workout-web` project keeps deployment protection enabled for production and
ordinary previews.

- **Production** — `convex deploy`, then Next.js. Deploy injects
  `NEXT_PUBLIC_CONVEX_URL` for the web build.
- **Staging branch Preview** — deploys backend code to the persistent
  `preview/staging` deployment, then builds Next.js against the URL returned by
  that deploy. Its deploy key is restricted to that one deployment, so data
  survives every deployment.
- **Other Previews** — skip `convex deploy` and build against their configured
  Preview `NEXT_PUBLIC_CONVEX_URL`.

`scripts/resolve-workos-redirect-uri.mjs` sets the redirect URI from
`convex.json` `authKit.prod` on **Production** builds (custom domain) and from
`https://staging.workout.plutotom.com` on the **staging Preview** build.
Other previews use the stable `VERCEL_BRANCH_URL` (`VERCEL_URL` is only a
fallback). Override the staging origin with `STAGING_APP_URL` if its domain
changes.

Set `NEXT_PUBLIC_CONVEX_URL` on Vercel **Preview** for ordinary PR previews.
The `staging` branch build receives its URL directly from `convex deploy`.

### Vercel deploy keys

| Vercel environment  | `CONVEX_DEPLOY_KEY` source                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Production**      | Convex Dashboard → Project Settings → **Production** Deploy Key                                                         |
| **Preview/staging** | `convex deployment token create vercel-staging --deployment preview/staging`, scoped to Vercel Preview branch `staging` |

Both variables are named `CONVEX_DEPLOY_KEY` in Vercel, but each key must be
restricted to the matching environment (Production only / Preview only). If a
production key is available during a preview build, Convex fails with:

> Detected a non-production build environment and "CONVEX_DEPLOY_KEY" for a
> production Convex deployment.

The `staging` branch always reuses `preview/staging` (see `convex.json` →
`authKit.preview`). Without its branch-scoped Preview key, staging fails closed
instead of silently building against the wrong backend. Ordinary PR previews do
not deploy backend/schema changes.

### WorkOS / AuthKit (preview builds)

`convex.json` `authKit.preview` configures WorkOS redirect URIs from
`VERCEL_BRANCH_URL` at deploy time. The Convex CLI still needs
`WORKOS_CLIENT_ID` and `WORKOS_API_KEY` in the **Vercel Preview** build
environment (not just on the Convex deployment).

1. **Convex dashboard** — create a project-level AuthKit environment for
   preview (Settings → Integrations → WorkOS on any deployment). See
   [AuthKit auto-provision](https://docs.convex.dev/auth/authkit/auto-provision).
2. **Convex preview env defaults** — set `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`,
   and `MCP_API_KEY_PEPPER` under Project Settings → Environment Variable
   Defaults → Preview (applies to new preview backends).
3. **Vercel staging branch env** — same `WORKOS_*` vars plus
   `WORKOS_COOKIE_PASSWORD`, scoped to Preview branch `staging`.
   `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is set at build time by
   `scripts/resolve-workos-redirect-uri.mjs` (`VERCEL_BRANCH_URL` on preview,
   `authKit.prod` redirect URI on production).

Quick sync from local `.env.local`:

```bash
pnpm sync:preview        # Convex preview defaults + preview/staging deployment
pnpm sync:preview:all    # Also push secrets to Vercel Preview branch staging
```

`sync:preview:all` targets `workout-web-staging` by default. Set
`VERCEL_PROJECT_NAME` only when intentionally syncing another project.

The sync also registers the stable staging callback, homepage, and CORS origin
with WorkOS. Override the default custom domain with `STAGING_APP_URL` if the
staging domain changes.

For local Next.js builds without deploying Convex, use `pnpm build:web`.

Manual full prod sync (Convex env vars + WorkOS redirects): `pnpm sync:prod`.

## Local worktrees

Use the repository commands instead of copying `.env.local` or invoking
`git worktree` directly:

```bash
pnpm worktree:create <slug>
pnpm worktree:list
pnpm worktree:start <slug>
pnpm worktree:remove <slug>
```

Each `wt/<slug>` worktree receives persisted frontend and Convex Local ports,
an anonymous local Convex deployment, and an allowlisted projection of the
primary checkout's WorkOS Sandbox credentials. State and ownership manifests
live under the common Git directory. Starts remain foreground processes;
removal refuses dirty or listening worktrees and preserves the branch.

Never copy `CONVEX_DEPLOYMENT`, remote Convex URLs, Vercel OIDC tokens,
production WorkOS keys, or arbitrary environment files into a worktree.
