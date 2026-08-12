# LinkWaveHub SMM

A production-style social media boosting platform by **OB CodeLab**. Customers buy followers, likes, views and other services from a **database-driven catalog**. Administrators add platforms, categories and products from the dashboard — the storefront updates without frontend code changes.

## Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Hook Form, Lucide, Recharts
- **Backend:** Node.js, Express, Zod, JWT, Helmet, rate limiting
- **Database:** PostgreSQL (local or [Supabase](https://supabase.com))

## Architecture

```
frontend  →  REST /api  →  Express services  →  PostgreSQL
                              ├─ PaymentAdapter (mock / manual / Paystack)
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
| Admin    | admin@linkwavehub.com         | Admin@12345    |
| Reseller | reseller@linkwavehub.com      | Reseller@12345 |
| Customer | customer@linkwavehub.com      | Customer@12345 |

Add your own products from **Admin → Products**. Sample catalog rows can stay for preview or you can disable them.

## Affiliates

Signed-in users get a personal link (`/register?ref=CODE`). When a referred user adds funds (auto or confirmed deposits), the referrer earns **7% for life**. Commission is credited to the referrer wallet and can be used to order services. Rate and minimum payout are in **Admin → Settings**.

## Payments and SMM API (later)

Do not connect live keys yet. The site uses:

- **Instant Demo Top-up** and **Mobile Money** (manual confirm) for deposits
- **mock** SMM adapter so orders can be placed without a supplier

When the website is complete:

- **Korapay** for instant and manual payments
- **resellersmm.com `/api/v2`** (PerfectPanel: `key` + `action=services|add|status|refill|cancel|balance`) via Admin → Providers, adapter `generic_http`, API URL `https://resellersmm.com/api/v2`

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

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the files in `supabase/migrations/` in filename order.
3. In **Project Settings → Database**, copy the **URI** (use the pooled connection on port `6543` for the API).
4. Set in `.env`:

```
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

5. Start the API once so it can seed demo data (`seedIfEmpty` only runs when `users` is empty).

The Express API is the only client that talks to Postgres. The React app never uses the anon key, so provider secrets and wallet ledgers stay server-side.

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
