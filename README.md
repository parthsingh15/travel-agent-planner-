# AI Travel Planner

A full-stack travel planning application with a multi-agent AI itinerary generator, built with Next.js, PostgreSQL, Prisma, and OpenAI.

## Features

- **Authentication**: Signup/login with JWT, 6-digit email OTP (Brevo), forgot/reset password
- **Trip Management**: Create trips with destination, dates, budget, travelers, interests, travel style
- **Multi-Agent AI**: 9 specialized agents coordinated by a supervisor, with per-agent fault tolerance
- **Itinerary Versioning**: Complete historical data — never overwrites previous versions
- **Flight & Hotel Search**: Cross-vendor price comparison showing the cheapest booking source
- **Price Alerts**: Target-price watches on flights, stays and activities, with email on trigger
- **Weather**: Live forecast per destination, with a seasonal fallback for far-future trips
- **Interactive Maps**: OpenStreetMap location view for every trip destination
- **Expense Tracking**: Log real spend by category against the planned trip budget
- **Bookmarks**: Save flights, hotels, restaurants, places and itineraries
- **AI Chatbot**: Travel assistant connected to OpenAI for trip Q&A
- **Payments**: Stripe sandbox/demo payment gateway (no card details stored)
- **Admin Dashboard**: Manage users, trips, itineraries, AI runs, bookings, saved items, payments, price alerts and audit logs, with analytics
- **Testing**: Unit + API/integration suites (Vitest)
- **CI/CD**: GitHub Actions for lint, typecheck, test, and build

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT (jose) + bcrypt password hashing
- **AI**: OpenAI API (gpt-4o-mini)
- **Email**: Brevo API
- **Payments**: Stripe (test mode)
- **Testing**: Vitest + Testing Library
- **CI**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- (Optional) OpenAI API key, Brevo API key, Stripe test keys

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# Push database schema
npm run db:push

# Seed demo data
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo Accounts (after seeding)

| Role  | Email                    | Password    |
|-------|--------------------------|-------------|
| Admin | admin@travelplanner.com  | Admin123!   |
| User  | user@travelplanner.com   | User1234!   |

## Environment Variables

See `.env.example` for all required variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for JWT signing. **Required in production** and must be
  at least 32 characters; the app refuses to start otherwise rather than signing
  tokens with a public fallback constant.
- `OPENAI_API_KEY` — OpenAI API key (falls back to the mock pipeline if unset)
- `BREVO_API_KEY` — Brevo email API key (logs to console in dev if unset)
- `STRIPE_SECRET_KEY` — Stripe test secret key (demo mode if unset)

**No key required:** weather (Open-Meteo forecast + archive), geocoding
(Open-Meteo geocoding) and maps (OpenStreetMap embeds) are all keyless, so they
work out of the box.

### Flight and hotel inventory

There is no keyless real-world flight/hotel inventory API, so search ships a
deterministic **sandbox provider** behind the `InventoryProvider` interface in
`src/lib/services/travel-inventory.ts`. Results are seeded by the search query,
so the same route and dates always return the same offers and prices — price
comparison and price alerts need a stable baseline to compare against. To use
live inventory, implement `InventoryProvider` and return it from
`getInventoryProvider()` when its credentials are present.

## Scripts

| Command           | Description                |
|-------------------|----------------------------|
| `npm run dev`     | Start dev server           |
| `npm run build`   | Production build           |
| `npm run lint`    | Run ESLint                 |
| `npm run typecheck` | TypeScript check         |
| `npm test`        | Run tests                  |
| `npm run db:push` | Push Prisma schema to DB   |
| `npm run db:seed` | Seed demo data             |
| `npm run db:studio` | Open Prisma Studio       |

## Testing

```bash
npm test                 # unit + API/integration suites
npm run test:watch
npm run test:coverage
```

- `tests/unit/` — pure logic: validators, auth hashing, agent JSON parsing,
  the agent registry, weather mapping, inventory search, expense rollups.
- `tests/integration/` — API route handlers exercised end to end against mocked
  Prisma and auth (`// @vitest-environment node`), covering status codes,
  validation errors, ownership checks and admin access control, plus the
  orchestrator's fault-tolerance behaviour.

## Multi-Agent Architecture

```
Phase 1  Destination Research Agent        (grounds every downstream specialist)
            │
Phase 2  ├── Flight Agent          ─┐
         ├── Hotel Agent            │
         ├── Activity Agent         ├─ run in parallel
         ├── Restaurant Agent       │
         └── Transportation Agent  ─┘
            │
Phase 3  Supervisor Agent                  (reconciles specialists into one plan)
Phase 4  Budget Agent                      (checks every cost against the budget)
Phase 5  Itinerary Planner Agent           (builds the day-by-day plan)
Phase 6  Itinerary Critic / Validator      (scores pacing, budget fit, quality)
```

Each agent produces structured JSON. Outputs are stored per-agent in
`ItineraryGeneration`; the final plan is written as an immutable
`ItineraryVersion`, numbered sequentially per trip.

**Fault tolerance.** Every specialist runs through a `settleAgent` wrapper that
records a failure instead of propagating it, so one flaky agent degrades its own
section rather than discarding the work its siblings already completed. Degraded
agents are listed in `orchestratorNotes` and in the version's
`metadata.degradedAgents`, and the pipeline UI shows them as *skipped* rather
than silently claiming success. Only the Itinerary Planner is treated as
non-degradable — if it fails, the run is marked `FAILED` and the trip returns to
`DRAFT`.

**Resilient parsing.** Agent JSON is parsed tolerantly (markdown fences and
surrounding prose are stripped); an unparseable response is retried once with an
explicit repair instruction before the agent is considered failed.

**Mock mode.** Without a valid `OPENAI_API_KEY`, the orchestrator runs a mock
pipeline that mirrors the live one step for step, so the whole flow is
demonstrable with no API credentials.

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/verify-otp` | Verify email OTP |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| GET | `/api/auth/me` | Get current user |
| GET/POST | `/api/trips` | List/create trips |
| GET/PATCH/DELETE | `/api/trips/[id]` | Trip CRUD |
| GET/POST | `/api/trips/[id]/generate` | List runs / start AI generation |
| GET | `/api/trips/[id]/generations/[generationId]` | Poll a generation run |
| GET | `/api/search/flights` | Flight search with vendor price comparison |
| GET | `/api/search/hotels` | Hotel search with vendor price comparison |
| GET | `/api/weather` | Destination weather (by `tripId`, or destination + dates) |
| GET | `/api/geocode` | Resolve a destination to coordinates |
| GET/POST | `/api/bookmarks` | List/save bookmarks |
| DELETE | `/api/bookmarks/[id]` | Remove a bookmark |
| GET/POST | `/api/expenses` | Trip expenses + budget summary / add expense |
| PATCH/DELETE | `/api/expenses/[id]` | Update/delete an expense |
| GET/POST/PATCH | `/api/price-alerts` | Price alert management |
| GET/POST | `/api/bookings` | Booking list/create |
| POST | `/api/chat` | AI chat assistant |
| GET/POST | `/api/payments` | Payment history/create |
| GET | `/api/admin/dashboard` | Admin analytics |
| GET | `/api/admin/resources/[resource]` | Paginated admin listing (see below) |
| PATCH | `/api/admin/users/[id]` | Change a user's role / verification |

`[resource]` is one of `users`, `trips`, `itineraries`, `generations`,
`bookings`, `bookmarks`, `payments`, `price-alerts`, `audit-logs`. Each supports
`?page`, `?pageSize` (capped at 100), `?search`, and a per-resource whitelist of
exact-match filters — only fields a resource opts into are filterable, so a
crafted query string cannot reach arbitrary columns.

## License

MIT
