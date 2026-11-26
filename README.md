# Grayed Lift

Strength-training app for iPhone, being rebuilt as a native SwiftUI app.
See [`ios/PLAN.md`](./ios/PLAN.md) for the decisions, data model, and stages.

| Path       | What                                                      |
| ---------- | --------------------------------------------------------- |
| `ios/`     | Native iOS app (SwiftUI, GRDB, Clerk) — in progress       |
| `backend/` | Convex backend (shared by the old Expo app until cutover) |
| `src/lib/` | TypeScript helpers the backend imports, plus their tests  |
| `scripts/` | Convex / Vercel deployment and environment sync scripts   |

The old Expo app and Next.js web app live on `main` until cutover.

## Backend

```bash
pnpm install
pnpm dev          # convex dev
pnpm test         # vitest (backend + shared helpers)
pnpm typecheck
pnpm lint
```

Environment variables are listed in [`.env.example`](./.env.example).
