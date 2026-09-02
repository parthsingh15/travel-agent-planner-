/**
 * Offline assistant.
 *
 * Used when no OpenAI key is configured. It does not attempt to imitate a
 * language model: it answers a narrow set of common questions directly from the
 * user's real researched itinerary, and says plainly when a question is beyond
 * it. That is more useful - and more honest - than generic filler text.
 */
import type { TripFacts } from "./trip-context";

const money = (n: number, currency: string) =>
  currency === "INR"
    ? `₹${Math.round(n).toLocaleString("en-IN")}`
    : `${currency} ${Math.round(n).toLocaleString()}`;

/** Names the key the *configured* provider actually needs. */
function missingKeyHint(): string {
  const provider = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  return provider === "openai"
    ? "add a valid OPENAI_API_KEY to .env"
    : "add a valid GEMINI_API_KEY to .env";
}

export function offlineSuffix(): string {
  return (
    "\n\n_Answered directly from your trip data. Conversational AI is off — " +
    `${missingKeyHint()} to enable it._`
  );
}

type Handler = {
  match: RegExp;
  reply: (f: TripFacts, message: string) => string | null;
};

const HANDLERS: Handler[] = [
  // ── Money left ─────────────────────────────────────────────────────────
  {
    match: /(how much).*(left|remain)|remaining budget|money left|budget left/i,
    reply: (f) => {
      const c = f.currency;
      const lines = [
        `Your budget is ${money(f.budget, c)}.`,
        `You have logged ${money(f.spend.totalSpent, c)} of actual spending (${f.spend.percentUsed}% of budget).`,
        f.spend.overBudget
          ? `You are over budget by ${money(Math.abs(f.spend.remaining), c)}.`
          : `That leaves ${money(f.spend.remaining, c)} remaining.`,
      ];
      if (f.itinerary?.totalCost) {
        lines.push(
          `The planned itinerary is estimated at ${money(f.itinerary.totalCost, c)} in total.`
        );
      }
      if (f.spend.byCategory.length) {
        lines.push(
          `Biggest categories so far: ` +
            f.spend.byCategory
              .slice(0, 3)
              .map((x) => `${x.category.toLowerCase()} ${money(x.amount, c)}`)
              .join(", ") + "."
        );
      }
      return lines.join(" ");
    },
  },

  // ── Is it too busy? ────────────────────────────────────────────────────
  {
    match: /too busy|too packed|too much|rushed|relaxed enough|pacing/i,
    reply: (f) => {
      if (!f.itinerary) return null;
      const perDay = f.itinerary.days.map((d) => ({
        day: d.day,
        stops: d.stops.filter((s) => s.kind === "attraction").length,
      }));
      const busiest = [...perDay].sort((a, b) => b.stops - a.stops)[0];
      const avg = (perDay.reduce((s, d) => s + d.stops, 0) / perDay.length).toFixed(1);

      const verdict =
        busiest.stops >= 5
          ? `Day ${busiest.day} looks packed with ${busiest.stops} sights — consider dropping one.`
          : busiest.stops <= 1
            ? `The schedule is light; you could add another sight or two.`
            : `The pacing looks reasonable.`;

      return `You average ${avg} sights per day across ${f.itinerary.days.length} days. ${verdict}`;
    },
  },

  // ── Make a specific day cheaper ────────────────────────────────────────
  {
    match: /(cheaper|reduce|cut|save).*(day\s*(\d+))|day\s*(\d+).*(cheaper|cost less)/i,
    reply: (f, message) => {
      if (!f.itinerary) return null;
      const m = /day\s*(\d+)/i.exec(message);
      const dayNum = m ? Number(m[1]) : null;
      const day = dayNum
        ? f.itinerary.days.find((d) => d.day === dayNum)
        : [...f.itinerary.days].sort((a, b) => b.dayCost - a.dayCost)[0];
      if (!day) return null;

      const priciest = [...day.stops]
        .filter((s) => s.cost)
        .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
        .slice(0, 3);

      if (!priciest.length) {
        return `Day ${day.day} has no costed items, so there is nothing to trim.`;
      }

      return (
        `Day ${day.day} costs ${money(day.dayCost, f.currency)}. ` +
        `The biggest items are: ` +
        priciest.map((s) => `${s.title} (${money(s.cost!, f.currency)})`).join(", ") +
        `. Dropping or swapping the first would save the most.`
      );
    },
  },

  // ── Restaurants ────────────────────────────────────────────────────────
  {
    match: /restaurant|food|eat|dining|dinner|lunch|breakfast|cuisine/i,
    reply: (f) => {
      if (!f.itinerary) return null;
      const meals = f.itinerary.days
        .flatMap((d) => d.stops.filter((s) => s.kind === "meal"))
        .map((s) => s.placeName)
        .filter((n): n is string => Boolean(n));
      const unique = [...new Set(meals)];
      if (!unique.length) return null;

      return (
        `Your itinerary includes these researched places to eat in ${f.destination}: ` +
        unique.slice(0, 8).join(", ") +
        `. Food is budgeted at roughly ` +
        `${money(
          f.itinerary.breakdown?.find((b) => /food/i.test(b.label))?.amount ?? 0,
          f.currency
        )} for the trip.`
      );
    },
  },

  // ── Activities / sights ────────────────────────────────────────────────
  {
    match: /activit|things to do|attraction|sight|visit|see/i,
    reply: (f) => {
      if (!f.itinerary) return null;
      const sights = f.itinerary.days
        .flatMap((d) => d.stops.filter((s) => s.kind === "attraction"))
        .map((s) => s.placeName)
        .filter((n): n is string => Boolean(n));
      const unique = [...new Set(sights)];
      if (!unique.length) return null;

      return (
        `Your ${f.days}-day plan includes ${unique.length} sights in ${f.destination}: ` +
        unique.slice(0, 10).join(", ") +
        `${unique.length > 10 ? ", and more" : ""}.`
      );
    },
  },

  // ── Hotel ──────────────────────────────────────────────────────────────
  {
    match: /hotel|stay|accommodation|where am i sleeping|lodging/i,
    reply: (f) => {
      if (!f.itinerary) return null;
      const checkin = f.itinerary.days
        .flatMap((d) => d.stops)
        .find((s) => s.kind === "checkin");
      if (!checkin?.placeName) return null;

      const hotelCost = f.itinerary.breakdown?.find((b) => /hotel/i.test(b.label));
      return (
        `You are staying at ${checkin.placeName} in ${f.destination}` +
        (hotelCost
          ? `, budgeted at ${money(hotelCost.amount, f.currency)} for the whole stay.`
          : `.`)
      );
    },
  },

  // ── Cost breakdown ─────────────────────────────────────────────────────
  {
    match: /breakdown|what does it cost|total cost|how much.*(trip|cost)|expensive/i,
    reply: (f) => {
      if (!f.itinerary?.breakdown?.length) return null;
      return (
        `Estimated breakdown for ${f.destination}: ` +
        f.itinerary.breakdown
          .map((b) => `${b.label} ${money(b.amount, f.currency)}`)
          .join(", ") +
        `. Total ${money(f.itinerary.totalCost ?? 0, f.currency)} against a ` +
        `${money(f.budget, f.currency)} budget.`
      );
    },
  },

  // ── Transport ──────────────────────────────────────────────────────────
  {
    match: /transport|travel there|get there|train|bus|flight|drive/i,
    reply: (f) => {
      if (!f.itinerary) return null;
      const leg = f.itinerary.days
        .flatMap((d) => d.stops)
        .find((s) => s.kind === "travel");
      if (!leg) return null;
      const t = f.itinerary.breakdown?.find((b) => /transport/i.test(b.label));
      return (
        `${leg.title}. Transport is budgeted at ` +
        `${money(t?.amount ?? 0, f.currency)} for the round trip.`
      );
    },
  },
];

export function answerOffline(message: string, facts: TripFacts | null): string {
  if (!facts) {
    return (
      "I can answer questions about a specific trip — open a trip and start the " +
      "chat from there, or create one first." + offlineSuffix()
    );
  }

  for (const h of HANDLERS) {
    if (h.match.test(message)) {
      const reply = h.reply(facts, message);
      if (reply) return reply + offlineSuffix();
    }
  }

  // No handler matched: summarise rather than pretend to converse.
  const c = facts.currency;
  const summary = [
    `Here is where your ${facts.destination} trip stands.`,
    facts.itinerary
      ? `You have a ${facts.days}-day itinerary (version ${facts.itinerary.versionNumber}) ` +
        `estimated at ${money(facts.itinerary.totalCost ?? 0, c)}.`
      : `No itinerary has been generated yet — open the AI Planner to create one.`,
    `Budget ${money(facts.budget, c)}, logged spend ${money(facts.spend.totalSpent, c)}, ` +
      `remaining ${money(facts.spend.remaining, c)}.`,
    `I can answer questions about your budget, hotel, restaurants, sights, ` +
      `transport, or whether a day is too busy.`,
  ].join(" ");

  return summary + offlineSuffix();
}
