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

**Vercel env (production):** add `CONVEX_DEPLOY_KEY` from the Convex dashboard
(Project Settings → Deploy Keys → Production Deploy Key). Without it, Vercel
builds succeed for frontend-only changes but Convex functions stay stale.

For local Next.js builds without deploying Convex, use `pnpm build:web`.

Manual full prod sync (Convex env vars + WorkOS redirects): `pnpm sync:prod`.
