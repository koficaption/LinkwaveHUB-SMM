# LinkWaveHub SMM

A production-style social media boosting platform by **OB CodeLab**. Customers buy followers, likes, views and other services from a **database-driven catalog**. Administrators add platforms, categories and products from the dashboard — the storefront updates without frontend code changes.

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form, Lucide, Recharts
- **Backend:** Node.js, Express, Zod, JWT, Helmet, rate limiting
- **Database:** PostgreSQL (local or [Supabase](https://supabase.com))

## Architecture

```
frontend  →  REST /api  →  Express services  →  PostgreSQL
                              ├─ PaymentAdapter (mock / manual / Korapay)
                              └─ SmmProviderAdapter (mock / generic HTTP panel)
```

- Products, platforms, categories, prices and payment methods live in the database.
- Provider API keys are encrypted at rest and **never** returned to the browser.
- Orders debit the wallet in a SQL transaction (row lock + audit + notification).
- New SMM or payment suppliers are registered adapters — not scattered `if` statements.

## Demo accounts

These logins are **sample rows in your own database**, created on first boot so the dashboards are not empty. They are not another company’s live panel.

| Role     | Email                         | Password       |
|----------|-------------------------------|----------------|
| Admin    | owussamuel18@gmail.com        | Admin@12345    |
| Reseller | reseller@linkwavehub.com      | Reseller@12345 |
| Customer | customer@linkwavehub.com      | Customer@12345 |

Add your own products from **Admin → Products**. Sample catalog rows can stay for preview or you can disable them.

## Affiliates

Signed-in users get a personal link (`/register?ref=CODE`). When a referred user adds funds (auto or confirmed deposits), the referrer earns **7% for life**. Commission is credited to the referrer wallet and can be used to order services. Rate and minimum payout are in **Admin → Settings**.

## Payments and SMM API

Wallet deposits and reseller upgrade fees can use:

- **Card / Korapay** — hosted checkout (test or live keys). Set `KORAPAY_PUBLIC_KEY`, `KORAPAY_SECRET_KEY`, and `KORAPAY_ENCRYPTION_KEY` in `.env` (never commit them). After a successful charge, the API verifies with Korapay and credits the wallet. Reseller upgrade card payments do **not** credit the wallet; they promote the account instead.
- **Mobile Money** — manual confirmation by an admin
- **Instant Demo Top-up** — local/demo only; disable it when real payments are on

Webhook URL (Korapay Dashboard → Settings → Webhooks):

`{API_ORIGIN}/api/payments/webhooks/korapay`

SMM fulfilment uses the **resellersmm.com `/api/v2`** PerfectPanel adapter from Admin → Providers.

## Admin configuration

From **Admin → Settings** you can set the customer service number, WhatsApp number, and channel/community links (Telegram, WhatsApp community, etc.). They appear in the public footer, the bottom help bar, and on the support page.

From **Admin → Payments** you can add or edit **manual** payment details (MoMo network and number, account name, bank name and account number, extra instructions). Customers see those details when they fund their wallet. An admin then confirms the deposit.

From **Admin → Providers** you can add your SMM API now: paste `https://resellersmm.com/api/v2`, the API key, and adapter `generic_http`. Saving a key (or clicking **Import packages**) pulls the panel service list into the catalog as products, grouped by platform. **Test** reads panel balance.

## Local development

PostgreSQL 16+ is required.

```bash
# 1. Create the database (example)
createdb linkwavehub

# 2. Copy environment
cp .env.example .env

# 3. Install and run
npm install
npm install --prefix backend
npm install --prefix frontend
npm run dev
```

- API: http://localhost:4000/api/health  
- Web: http://localhost:5173  

The API applies migrations and seeds demo data on first boot.

## Google sign-in

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (Web application).
2. Add your site origin (for example `http://localhost:5173`) under **Authorized JavaScript origins**.
3. Add `{FRONTEND_URL}/api/auth/google/callback` under **Authorized redirect URIs**.
4. Put the client ID (and secret, for the redirect fallback) in `.env`:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

The login and register pages show **Continue with Google**. A client ID is enough for the popup flow.

## Supabase / live database

The Cloud Agent uses **local Postgres** until you attach a hosted project.

1. Create a free project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **Project Settings → Database** and copy the **URI** (include the password). Session pooler (port `5432`) is best for this API; transaction pooler (`6543`) also works.
3. From the repo, copy local data up (catalog, users, wallets, settings):

```bash
LIVE_DATABASE_URL='postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres' npm run db:go-live
```

4. Put that same URI in `.env` as `DATABASE_URL`. **Do not change `ENCRYPTION_KEY`** if you copied provider API keys.
5. Restart the API. Admin login is `owussamuel18@gmail.com` / `Admin@12345` if demo users were copied.

The Express API is the only client that talks to Postgres. The React app never uses the anon key, so provider secrets and wallet ledgers stay server-side. Public tables have RLS enabled so the Supabase Data API cannot read them.

## Adding a new service (no code)

Admin dashboard → **Platforms** → add e.g. Spotify  
→ **Categories** → add or reuse Followers  
→ **Products** → Add Product → set min/max, selling price, cost, reseller price, provider  
→ Save as **Active**

The product appears on `/services` immediately.

## Adding a payment or SMM provider (later)

- Payments: implement `PaymentAdapter` in `backend/src/providers/payment/` and `registerPaymentAdapter` (Korapay will go here).
- SMM panels: the `generic_http` adapter already speaks PerfectPanel / resellersmm.com v2. Create a **Providers** row in admin, set adapter to `generic_http`, paste the API key (encrypted at rest).

## Scripts

| Command        | Description                |
|----------------|----------------------------|
| `npm run dev`  | API + Vite together        |
| `npm run migrate` | Apply SQL migrations    |
| `npm run seed` | Re-seed (only if empty)    |

Developed by **OB CodeLab**.
