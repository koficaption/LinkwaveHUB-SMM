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

| Role     | Email                         | Password       |
|----------|-------------------------------|----------------|
| Admin    | admin@linkwavehub.com         | Admin@12345    |
| Reseller | reseller@linkwavehub.com      | Reseller@12345 |
| Customer | customer@linkwavehub.com      | Customer@12345 |

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

## Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/migrations/20260812100000_init_linkwavehub.sql`.
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

## Adding a payment or SMM provider (code, once)

- Payments: implement `PaymentAdapter` in `backend/src/providers/payment/` and `registerPaymentAdapter`.
- SMM panels: implement `SmmProviderAdapter` in `backend/src/providers/smm/` and `registerSmmAdapter`, then create a **Providers** row in admin (API key is encrypted).

## Scripts

| Command        | Description                |
|----------------|----------------------------|
| `npm run dev`  | API + Vite together        |
| `npm run migrate` | Apply SQL migrations    |
| `npm run seed` | Re-seed (only if empty)    |

Developed by **OB CodeLab**.
