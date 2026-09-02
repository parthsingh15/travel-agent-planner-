# AI Travel Planner — India

A full-stack travel planner that researches a trip before planning it, then builds
a day-by-day itinerary from real places, real road distances and a hard budget
constraint.

Built with Next.js 15, PostgreSQL + Prisma, and Google Gemini.

> **Design rule: the app never invents travel facts.**
> Places come from OpenStreetMap, distances and durations from OSRM, and costs
> from a documented Indian cost model. Every figure carries its source and is
> labelled **VERIFIED** or **ESTIMATED** in the UI. A verification agent rejects
> any itinerary containing placeholder text, unlinkable places, wrong dates,
> overlapping activities or a budget overrun.

---

## What it does

Enter a trip — say **Delhi → Manali, 5 days, 2 people, ₹50,000, nature + history** —
and the app researches the destination, costs the trip against your budget, and
produces an itinerary of actual named places:

```
Day 1 — Arrival in Manali
  19:32 (prev day)  Delhi → Manali by bus        ₹1,780 (est)  532.5 km · 13h 28m
  09:00–09:45       Check in at Travelosic Junction  ₹1,050 (est)
                    001, Manu Mandir Road · view on OpenStreetMap
  09:50–12:20       Visit Manali WLS              ₹300 (est)   1.8 km · 4 min
  12:30–13:30       Lunch at Southern Souls       ₹1,040 (est)
                    Hadimba Road · Hours: Mo-Su 09:00-21:00
```

Every place links back to the OpenStreetMap element it came from, so any claim is
checkable.

## Features

- **Research-first itineraries** — real hotels, restaurants and attractions with
  opening hours, addresses and coordinates
- **Budget-first planning** — the ₹ budget is a hard constraint; the planner
  applies real downgrades (cheaper transport, lower tier, free-entry sights) and
  says plainly when a budget is insufficient rather than returning an
  unaffordable plan
- **Complete expense breakdown** — transport, hotel, food, activities, local
  transport and contingency, each labelled verified or estimated
- **AI assistant** — answers questions about *your* stored trip ("how much is
  left?", "is this too busy?", "suggest cheaper restaurants")
- **Itinerary versioning** — regeneration never overwrites history
- **Weather and maps** — live forecast with a seasonal fallback for far-future
  dates; OpenStreetMap location view
- **Expenses, bookmarks and price alerts**
- **Auth** — JWT, bcrypt, 6-digit email OTP via Brevo, forgot/reset password
- **Payments** — Stripe test mode (no card details stored)
- **Admin dashboard** — users, trips, itineraries, AI runs, bookings, payments,
  alerts and audit logs, with role-based access
- **242 tests**, and CI running lint → typecheck → test → build

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Backend | Next.js API routes |
| Database | PostgreSQL + Prisma |
| Auth | JWT (jose) + bcrypt |
| AI | Google Gemini (default) · OpenAI (optional) |
| Places | OpenStreetMap Overpass + Nominatim |
| Routing | OSRM |
| Weather | Open-Meteo |
| Email | Brevo |
| Payments | Stripe (test mode) |
| Tests | Vitest |

**Only one API key is required** (Gemini, free tier). OpenStreetMap, OSRM and
Open-Meteo are keyless; Brevo and Stripe degrade to console/demo modes.

---

## Getting started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- A free Gemini API key — https://aistudio.google.com/apikey

### Setup

```bash
npm install
cp .env.example .env          # then edit .env (see below)
npm run db:push               # create the schema
npm run db:seed               # demo data: Delhi → Jaipur, ₹20,000
npm run dev
```

Open http://localhost:3000.

### Demo accounts (after seeding)

| Role  | Email                   | Password  |
|-------|-------------------------|-----------|
| Admin | admin@travelplanner.com | Admin123! |
| User  | user@travelplanner.com  | User1234! |

---

## Environment variables

Required:

```bash
DATABASE_URL="postgresql://user@localhost:5432/travel_planner?schema=public"
JWT_SECRET="at-least-32-characters"   # required in production; app refuses to start otherwise
GEMINI_API_KEY="AIza..."              # free tier, no card
```

AI provider selection:

```bash
AI_PROVIDER="gemini"                     # gemini | openai
GEMINI_MODEL="gemini-3.5-flash-lite"     # ~1s replies
                                         # gemini-3.6-flash reasons more deeply but takes 10–20s
OPENAI_API_KEY="sk-..."                  # only needed for AI_PROVIDER=openai
```

Keyless services (defaults work as-is): `OVERPASS_URL`, `NOMINATIM_URL`,
`NOMINATIM_USER_AGENT`, `OSRM_BASE_URL`.

Optional: `BREVO_API_KEY` (else OTP emails log to the console),
`STRIPE_SECRET_KEY` (else demo payments).

See `.env.example` for the full list. **No key is ever exposed to the browser** —
all AI calls are server-side, verified against the built client bundles.

---

## How planning works

```
Research ──► Select ──► Budget-fit ──► Assemble ──► Verify ──► Save
```

| Agent | Does |
|---|---|
| **Research** | Geocodes the destination, pulls real POIs and the intercity route |
| **Hotel** | Picks a real property fitting budget and travel style |
| **Activity** | Selects real attractions matching the traveller's interests |
| **Food** | Selects real restaurants and cafes |
| **Transport** | Costs the intercity journey and local travel |
| **Budget** | Enforces the ₹ budget, downgrading until the trip fits |
| **Itinerary** | Builds the schedule around opening hours and routed travel legs |
| **Checker** | Verifies the result before anything is saved |

### Where the AI fits

Facts are never asked of the model. Each agent receives the **researched
candidate list** and may only choose among it and explain the choice — and every
id the model returns is validated against that pool, so a hallucinated place is
discarded rather than rendered. If no AI key is configured, the deterministic
planner still produces a complete, real itinerary.

### Honest costing

OpenStreetMap records *which* places exist, but rarely what they cost, and there
is no free live pricing API for Indian hotels, restaurants or transport. So:

- a recorded OSM `charge` or `fee=no` → **VERIFIED**
- otherwise a documented cost-model band → **ESTIMATED**, with the exact rule shown

OSRM returns free-flow driving time, which badly understates Indian roads, so
long routes get a documented traffic/terrain factor (Delhi → Manali: 7h raw →
13h 28m adjusted) — the distance stays verified, the adjusted duration is marked
estimated.

---

## Testing

```bash
npm test              # 242 tests
npm run test:coverage
```

- `tests/unit/` — cost model, budget fitting, verification, INR formatting,
  AI provider and its error taxonomy, itinerary shape handling
- `tests/integration/` — API route handlers against mocked Prisma and auth,
  covering status codes, validation, ownership and admin access control

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Tests |
| `npm run db:push` | Push schema |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Prisma Studio |

> Running `npm run build` while `npm run dev` is active will clobber the dev
> server's `.next` cache. Use `NEXT_DIST_DIR=.next-ci npm run build` to build
> alongside a running dev server.

## License

MIT
