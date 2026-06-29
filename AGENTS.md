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
"build": "convex deploy --cmd 'pnpm run build:web'"
```

`convex deploy --cmd` sets `NEXT_PUBLIC_CONVEX_URL` for the Next.js build step.

**Vercel env — use two deploy keys, scoped by environment:**

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

For local Next.js builds without deploying Convex, use `pnpm build:web`.

Manual full prod sync (Convex env vars + WorkOS redirects): `pnpm sync:prod`.
