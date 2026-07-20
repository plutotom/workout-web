# AI templates & Pro billing

This doc covers the two related features:

1. **AI template create/edit** — describe a workout in plain language; get a draft in the template editor (Pro-gated).
2. **Pro billing (Polar)** — paid Pro subscriptions that unlock AI (and any future Pro-only features).

---

## Product behavior

### AI templates (Phase 1–2)

| Mode       | Where                                | What happens                                                                                                                        |
| ---------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Create** | Templates → New → “Describe with AI” | User describes a session → model returns `{ name, exercises[{ slug, sets }] }` → editor is filled. Nothing is saved until **Save**. |
| **Edit**   | Templates → Edit → “Edit with AI”    | Same, but the current template is sent as context so the model can tweak it.                                                        |

Rules baked into generation:

- Output is **one workout template**, not a multi-day program.
- Exercise **slugs must come from the catalog** (curated list + the user’s custom exercises).
- Unknown/hallucinated slugs are dropped after generation (`groundTemplateDraft`).
- Weights/reps default to `0` (“no preset”) unless the user specified numbers.
- Sets are capped at 20 per exercise (same as normal template saves).

### Pro gate

AI calls require Pro. A user is Pro if **any** of these are true:

1. Active or trialing **Polar** subscription
2. `users.plan === "pro"` (synced from Polar webhooks, or set via testing toggle)
3. Email is listed in Convex env `PRO_EMAILS`

Free users see an upgrade prompt; the API returns `403` with `code: "PRO_REQUIRED"`.

---

## Architecture

```
┌─────────────────┐     POST /api/ai/templates/generate      ┌──────────────────┐
│ Template editor │ ───────────────────────────────────────► │ Next.js route    │
│ + AI dialog     │                                          │ (AI Gateway)     │
└────────┬────────┘                                          └────────┬─────────┘
         │                                                            │
         │ useQuery(entitlement)                                      │ ConvexHttpClient
         │                                                            │ (auth JWT)
         ▼                                                            ▼
┌─────────────────┐                                          ┌──────────────────┐
│ Convex          │◄──── Polar webhooks /polar/events ───────│ Polar            │
│ users.plan +    │                                          │ checkout/portal  │
│ polar component │                                          └──────────────────┘
└─────────────────┘
```

### Key files

| Area                        | Path                                           |
| --------------------------- | ---------------------------------------------- |
| AI API                      | `src/app/api/ai/templates/generate/route.ts`   |
| Draft schema / grounding    | `src/lib/ai/template-draft.ts`                 |
| AI UI                       | `src/components/app/ai-template-button.tsx`    |
| Wired into editor           | `src/components/app/template-editor-form.tsx`  |
| Plan helpers                | `backend/lib/plan.ts`                          |
| Entitlement query           | `backend/routes/auth/users.ts` → `entitlement` |
| Polar client + checkout API | `backend/routes/billing/polar.ts`              |
| Plan sync mutation          | `backend/routes/billing/syncPlan.ts`           |
| Billing user lookup         | `backend/routes/billing/userInfo.ts`           |
| Webhooks                    | `backend/http.ts` → `/polar/events`            |
| Convex component            | `backend/convex.config.ts`                     |
| Settings UI                 | `src/app/(app)/settings/plan-settings.tsx`     |

### Template payload shape

Same shape as create/update template mutations:

```ts
{
  name: string;
  exercises: Array<{
    slug: string; // catalog slug or "custom:<id>"
    sets: Array<{ weight: number; reps: number }>; // 0 = no preset
  }>;
}
```

---

## Environment variables

### Next.js / Vercel (web)

| Variable                 | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `AI_GATEWAY_API_KEY`     | Vercel AI Gateway — required for AI generation |
| `AI_GATEWAY_MODEL`       | Optional; default `openai/gpt-4.1-mini`        |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL                          |

### Convex deployment

| Variable                    | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `PRO_EMAILS`                | Comma-separated emails treated as Pro (ops / early access) |
| `ALLOW_MANUAL_PRO`          | `true` → Settings shows “Enable Pro (testing)”             |
| `POLAR_ORGANIZATION_TOKEN`  | Polar org access token                                     |
| `POLAR_WEBHOOK_SECRET`      | Polar webhook signing secret                               |
| `POLAR_SERVER`              | `sandbox` or `production`                                  |
| `POLAR_PRODUCT_PRO_MONTHLY` | Polar product ID for monthly Pro                           |
| `POLAR_PRODUCT_PRO_YEARLY`  | Polar product ID for yearly Pro                            |

Also required for the app generally: WorkOS + `MCP_API_KEY_PEPPER` (see `.env.example`).

---

## Setup guide

### 1. AI Gateway (try AI locally / on Vercel)

1. Create an AI Gateway key in the [Vercel dashboard](https://vercel.com/docs/ai-gateway).
2. Set `AI_GATEWAY_API_KEY` in `.env.local` and on Vercel.
3. Optional: set `AI_GATEWAY_MODEL`.
4. For a quick Pro unlock while billing isn’t live:
   ```bash
   npx convex env set ALLOW_MANUAL_PRO true
   # and/or
   npx convex env set PRO_EMAILS you@example.com
   ```
5. In the app: **Settings → Enable Pro (testing)** (if manual toggle is on).
6. **Templates → New → Describe with AI**.

Vercel teams get monthly AI Gateway credits useful for development.

### 2. Polar billing (production Pro)

1. Create a [Polar](https://polar.sh) organization and products (e.g. Pro Monthly, Pro Yearly).
2. Create an organization token with product/subscription/checkout/customer permissions (see [@convex-dev/polar](https://www.convex.dev/components/polar)).
3. Create a webhook pointing at:
   ```
   https://<your-deployment>.convex.site/polar/events
   ```
   Enable at least:
   - `product.created`
   - `product.updated`
   - `subscription.created`
   - `subscription.updated`
4. Set Convex env vars:
   ```bash
   npx convex env set POLAR_ORGANIZATION_TOKEN …
   npx convex env set POLAR_WEBHOOK_SECRET …
   npx convex env set POLAR_SERVER sandbox   # or production
   npx convex env set POLAR_PRODUCT_PRO_MONTHLY prod_…
   npx convex env set POLAR_PRODUCT_PRO_YEARLY prod_…
   ```
5. Deploy Convex so `http.ts` and the Polar component are live (`pnpm dev` / production deploy).
6. If products already existed in Polar before the component was installed, run once:
   ```ts
   // Convex dashboard → Functions → run action
   api.routes.billing.polar.syncProducts;
   ```
7. In the app: **Settings → Upgrade to Pro** (checkout) or **Manage subscription** (portal).

When Polar marks a subscription `active` or `trialing`, we set `users.plan` to `pro`. Other statuses set `free`. Entitlement also reads the live subscription from the Polar component tables.

---

## API: generate template

`POST /api/ai/templates/generate`

Auth: WorkOS session (same as the rest of the app).

### Body

```json
{
  "prompt": "Push day: bench, OHP, dips — 4x8-10",
  "mode": "create",
  "current": {
    "name": "Push",
    "exercises": [
      { "slug": "bench-press", "sets": [{ "weight": 0, "reps": 8 }] }
    ]
  }
}
```

- `mode`: `"create"` | `"edit"` (default `"create"`)
- `current`: required when `mode` is `"edit"`

### Responses

| Status                | Meaning                                        |
| --------------------- | ---------------------------------------------- |
| `200`                 | `{ draft, droppedSlugs, model }`               |
| `401`                 | Not signed in                                  |
| `403`                 | `{ error, code: "PRO_REQUIRED" }`              |
| `400` / `422` / `502` | Bad input / no valid exercises / model failure |

---

## Manual / ops Pro (without Polar)

Useful before products are live:

- **Allowlist:** `PRO_EMAILS=a@x.com,b@y.com` on the Convex deployment.
- **Testing toggle:** `ALLOW_MANUAL_PRO=true` → Settings → “Enable Pro (testing)” / “Switch to Free”.
- Turn `ALLOW_MANUAL_PRO` **off** in production once Polar is trusted.

---

## Related PRs

- AI templates + Pro entitlement stubs: see the AI template PR.
- Polar checkout / portal / webhook plan sync: see the Pro billing PR.

---

## Out of scope (for now)

- Multi-day program generation
- Conversational coach / chat UI
- Auto-save without editor review
- Progressive overload engine (algorithmic, not LLM)
- Removing `PRO_EMAILS` / manual toggle permanently (keep as escape hatch until you’re comfortable)
