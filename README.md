# Belle Ethiopia

A hair and nail salon booking platform for Ethiopia. Customers find salons and book real open times; owners and staff run their diary; admins approve and moderate. Prices are in birr (ETB), times are Africa/Addis_Ababa, phone numbers are Ethiopian (+251) by default.

"Belle Ethiopia" is a working name. Change `BRAND_NAME` and the logo component (`client/src/components/Art.tsx`) when you pick the final brand.

- **Client:** React 18, Vite, TypeScript, Tailwind, Radix primitives, TanStack Query
- **Server:** Node 20, Express, TypeScript, PostgreSQL 16, Drizzle ORM, Zod, argon2, JWT
- **Tests:** Vitest + Supertest (server), Vitest + Testing Library (client)

## What is real, and what is not

Read this before showing the app to anyone.

| Area | Status |
| --- | --- |
| Booking engine | **Works.** Slots come from staff hours, breaks, time off, service duration and buffers. Double-booking is prevented in the database (an exclusion constraint per staff member) and tested under concurrency. |
| Accounts and roles | **Works.** Customer, owner, staff, admin. Every permission is enforced on the server; hiding buttons is not the control. |
| Payments | **Pay at the salon only.** No online payment provider is connected. The API refuses online/deposit payment modes and returns `PAYMENT_PROVIDER_NOT_CONFIGURED`. Telebirr and CBE Birr are **not implemented** (see below). |
| Revenue figures | "Booked value" is the list price of confirmed and completed bookings. It is **not** money collected. "Recorded payments" counts only cash the salon has marked as received. The UI and CSV label them separately. |
| Email notifications | Sent **only if SMTP is configured**. Otherwise they are stored as in-app notifications and marked as not delivered by email. |
| SMS notifications | **Not implemented.** The channel reports "not configured". |
| Reminders | A job runs every 10 minutes and sends one reminder per booking about 24 hours ahead, through the channels that are configured. |
| Demo data | The seed creates 6 salons, accounts and a few bookings, all flagged `is_demo`. They show a "Demo" badge and **cannot be verified**. No fake reviews are created. |
| Photos | Salon cards use drawn artwork until owners upload real photos. Owners upload through the dashboard (re-encoded to WebP). |
| Amharic | Only the header, home hero, search bar and a few common buttons are translated. The rest of the app is English. The Amharic text is a first pass and **needs review by a native speaker**. |
| Docker | The Dockerfiles and the full-stack compose profile were written but **not run** in the environment where this was built (no Docker there). Everything else below was run. |

## Quick start (local development)

Requirements: Node 20+, and either Docker or a local PostgreSQL 16.

```bash
cp .env.example .env          # set the two JWT secrets to long random values
npm install
npm run db:up                 # Postgres in Docker  (or use your own Postgres and edit DATABASE_URL)
npm run migrate
npm run seed                  # demo data, optional
npm run dev                   # API on :4000, web on :5173
```

Open http://localhost:5173.

Without Docker, `./dev-up.sh` starts a locally installed Postgres 16 cluster plus the API and web dev servers.

### Demo accounts (seed only, password `Demo@12345`)

| Role | Email |
| --- | --- |
| Admin | `admin@demo.belle.et` |
| Salon owners | `owner1@demo.belle.et` … `owner6@demo.belle.et` |
| Staff member (Zewditu Hair Studio) | `staff@demo.belle.et` |
| Customers | `customer1@demo.belle.et` … `customer3@demo.belle.et` |

Never run the seed against a real production database. It creates accounts with a known password.

## Full stack in Docker

```bash
docker compose --profile full up --build     # web on http://localhost:8080
docker compose exec api npx tsx src/db/seed.ts   # optional demo data
```

The compose file serves plain HTTP, so it sets `COOKIE_SECURE=false`. Put the site behind HTTPS, remove that line, and replace the JWT secrets before using it for anything real.

## Configuration

All settings are environment variables. See `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | At least 32 characters each. Never reuse the example values. |
| `CLIENT_ORIGIN` | Allowed browser origin (CORS) and the base for links in emails |
| `COOKIE_SECURE` | Refresh-cookie Secure flag. Defaults to true in production. |
| `UPLOAD_DIR` | Where uploaded images are stored (mount a volume in production) |
| `SMTP_*` | Enables email. Leave blank to disable. |
| `TEST_DATABASE_URL` | Separate database for tests |

## Commands

```bash
npm run dev          # API + web with reload
npm run build        # production build of both
npm test             # server (61 tests) + client (15 tests)
npm run lint
npm run migrate      # apply database migrations
npm run seed         # demo data
```

Server tests use a separate database (`belle_test`, created and migrated automatically).

## API documentation

With the API running: interactive docs at http://localhost:4000/api/docs, machine-readable spec at `/api/openapi.json`. All routes live under `/api/v1`. Responses are `{ success, data, meta }` or `{ success: false, error: { code, message, details } }`.

## Security notes

- Passwords are hashed with argon2id. Access tokens (15 minutes) live in browser memory only. The refresh token is an HTTP-only cookie, rotated on every use; replaying an old one revokes the whole token family. Refresh and logout also require the `X-Requested-With` header.
- Blocked or demoted users lose access immediately: the user is re-read from the database on every request.
- Rate limits on sign-in, registration and password reset. Helmet headers. Input validated with Zod on every route; unknown fields are rejected on owner and admin endpoints.
- Uploads accept only real JPEG/PNG/WebP files (checked by content, not file name), capped at 6 MB, and are re-encoded.
- CSV exports neutralise spreadsheet formula injection.
- In development, "forgot password" returns the reset token in the API response when SMTP is not configured. This never happens in production.

## Integrations that need your credentials

These are not part of the app until you obtain accounts and implement or enable them.

1. **Telebirr** and **CBE Birr** online payments need merchant onboarding with each provider (app id/key, webhook secret). The payment-mode setting, the `/me/appointments/:id/pay` endpoint and `/webhooks/*` routes are in place as honest stubs. Webhooks return 501 until an adapter verifies provider signatures.
2. **SMS** (reminders and confirmations) needs an Ethiopian SMS provider or aggregator. No adapter exists yet.
3. **Email** needs any SMTP account (`SMTP_*`).
4. **Maps:** salons store a Google Maps link and coordinates; there is no embedded map or API key.
5. **Real photography and final Amharic copy** from the business.

## Project layout

```
client/    React app (pages/, components/, lib/, i18n/)
server/    Express API (controllers/, services/, routes/, validators/, db/schema.ts, drizzle/ migrations)
shared/    Phone, money and constants used by both sides
```

Key rules live in `server/src/services/booking.ts` (create, cancel, reschedule, status changes, reviews, cash payments) and `server/src/services/availability.ts` (slot generation).

## What was verified

- Server: 61 automated tests (booking rules, concurrency/double-booking, availability, auth, role and cross-salon access, owner and admin workflows, reports and CSV, uploads, payment honesty).
- Client: 15 unit tests, TypeScript strict, ESLint, production build.
- Real-browser click-throughs (headless Chromium): customer registration/sign-in, search, booking end to end, cancellation, owner confirm/reschedule/manual booking/service creation/staff hours/profile save/CSV export, staff restrictions, salon-owner registration followed by admin approval (including the "needs an active service" rule), role redirects, and a 390 px mobile layout check without horizontal overflow.

Not verified: Docker images, real email delivery, any payment or SMS provider, screen readers, browsers other than Chromium, and load or performance testing.
