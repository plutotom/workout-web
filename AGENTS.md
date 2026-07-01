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

Vercel runs `pnpm build`, which deploys Convex then builds Next.js:

```json
"build": "convex deploy --cmd 'sh -c \"NEXT_PUBLIC_WORKOS_REDIRECT_URI=$(node scripts/resolve-workos-redirect-uri.mjs) pnpm run build:web\"'"
```

`scripts/resolve-workos-redirect-uri.mjs` sets the redirect URI from
`convex.json` `authKit.prod` on **Production** builds (custom domain) and from
`VERCEL_URL` on **Preview** builds.

`convex deploy --cmd` sets `NEXT_PUBLIC_CONVEX_URL` for the Next.js build step.
Do **not** set `NEXT_PUBLIC_CONVEX_URL` for Vercel Preview — the deploy step
injects it per preview backend.

### Vercel deploy keys

| Vercel environment | `CONVEX_DEPLOY_KEY` source                                      |
| ------------------ | --------------------------------------------------------------- |
| **Production**     | Convex Dashboard → Project Settings → **Production** Deploy Key |
| **Preview**        | Convex Dashboard → Project Settings → **Preview** Deploy Key    |

Both variables are named `CONVEX_DEPLOY_KEY` in Vercel, but each key must be
restricted to the matching environment (Production only / Preview only). If a
production key is available during a preview build, Convex fails with:

> Detected a non-production build environment and "CONVEX_DEPLOY_KEY" for a
> production Convex deployment.

Preview deploys get a branch-specific Convex backend (see `convex.json` →
`authKit.preview`). Without a preview key, PR preview builds will not deploy
backend/schema changes.

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
3. **Vercel Preview env** — same `WORKOS_*` vars plus `WORKOS_COOKIE_PASSWORD`.
   `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is set at build time by
   `scripts/resolve-workos-redirect-uri.mjs` (`VERCEL_URL` on preview,
   `authKit.prod` redirect URI on production).

Quick sync from local `.env.local`:

```bash
pnpm sync:preview        # Convex preview defaults + preview/staging deployment
pnpm sync:preview:all    # Also push WorkOS secrets to Vercel Preview
```

For local Next.js builds without deploying Convex, use `pnpm build:web`.

Manual full prod sync (Convex env vars + WorkOS redirects): `pnpm sync:prod`.
