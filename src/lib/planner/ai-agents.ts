/**
 * AI reasoning layer for the planning agents.
 *
 * Design rule: the model NEVER supplies facts. Each agent is handed the real
 * researched candidates (OpenStreetMap places, OSRM distances, costed transport
 * options) and may only *choose among them* and explain the choice. Every id it
 * returns is validated against the candidate pool, so a hallucinated place is
 * discarded rather than reaching the itinerary.
 *
 * Every function degrades to null when AI is unconfigured or fails, leaving the
 * deterministic planner result in place.
 */
import { generateJson, isAIConfigured, AIError } from "@/lib/ai";
import type { Poi } from "@/lib/research/overpass";
import type { TransportOption } from "@/lib/research";
import type { PlannedDay } from "./assemble";
import type { CostBreakdown } from "./budget";

export type AgentContext = {
  destination: string;
  origin?: string | null;
  days: number;
  travellers: number;
  budget: number;
  currency: string;
  travelStyle: string;
  interests: string[];
};

/** Compact candidate list - only real, researched fields. */
function describePois(pois: Poi[], limit: number): string {
  return pois
    .slice(0, limit)
    .map((p, i) => {
      const bits = [
        `#${i} id=${p.id}`,
        `name="${p.name}"`,
        `kind=${p.kind}`,
        p.cuisine ? `cuisine=${p.cuisine}` : null,
        p.stars ? `stars=${p.stars}` : null,
        p.openingHours ? `hours="${p.openingHours}"` : null,
        p.address ? `area="${p.address}"` : null,
      ].filter(Boolean);
      return bits.join(" ");
    })
    .join("\n");
}

function contextHeader(ctx: AgentContext): string {
  return [
    `Destination: ${ctx.destination}`,
    ctx.origin ? `Starting city: ${ctx.origin}` : null,
    `Duration: ${ctx.days} days · Travellers: ${ctx.travellers}`,
    `Budget: ${ctx.currency} ${ctx.budget}`,
    `Travel style: ${ctx.travelStyle}`,
    `Interests: ${ctx.interests.join(", ") || "not specified"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const RULES =
  "You may ONLY choose from the numbered candidates given. " +
  "Never invent a place, price, or opening time. " +
  "Refer to candidates by their exact id. " +
  "Reply with a single JSON object and nothing else.";

async function ask<T>(
  agent: string,
  system: string,
  prompt: string
): Promise<T | null> {
  if (!isAIConfigured()) return null;

  try {
    return await generateJson<T>({
      system,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxOutputTokens: 800,
    });
  } catch (error) {
    const kind = error instanceof AIError ? error.kind : "unknown";
    console.error(`[ai-agents] ${agent} failed (${kind}):`, (error as Error).message);
    return null;
  }
}

// ─── Hotel Agent ────────────────────────────────────────────────────────────
export async function aiSelectStay(
  candidates: Poi[],
  ctx: AgentContext
): Promise<{ poi: Poi; reason: string } | null> {
  if (candidates.length < 2) return null;

  const result = await ask<{ id?: string; reason?: string }>(
    "hotel",
    `You are the Hotel Agent for an India travel planner. ${RULES}
Return: {"id": "<candidate id>", "reason": "<one sentence, max 25 words>"}`,
    `${contextHeader(ctx)}

Pick the single best place to stay for this traveller.

CANDIDATES:
${describePois(candidates, 30)}`
  );

  const poi = candidates.find((c) => c.id === result?.id);
  if (!poi) return null;
  return { poi, reason: (result?.reason ?? "").slice(0, 200) };
}

// ─── Activity Agent ─────────────────────────────────────────────────────────
export async function aiSelectAttractions(
  candidates: Poi[],
  ctx: AgentContext,
  count: number
): Promise<{ pois: Poi[]; reason: string } | null> {
  if (candidates.length <= count) return null;

  const result = await ask<{ ids?: string[]; reason?: string }>(
    "activity",
    `You are the Activity Agent for an India travel planner. ${RULES}
Return: {"ids": ["<id>", ...], "reason": "<one sentence, max 30 words>"}`,
    `${contextHeader(ctx)}

Choose exactly ${count} attractions that best match the traveller's interests,
ordered most compelling first. Prefer well-known landmarks over minor mapped features.

CANDIDATES:
${describePois(candidates, 60)}`
  );

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const pois = (result?.ids ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Poi => Boolean(p));

  // Reject a mostly-hallucinated selection.
  if (pois.length < Math.min(count, 3)) return null;

  return { pois: pois.slice(0, count), reason: (result?.reason ?? "").slice(0, 200) };
}

// ─── Food Agent ─────────────────────────────────────────────────────────────
export async function aiSelectFood(
  candidates: Poi[],
  ctx: AgentContext,
  count: number
): Promise<{ pois: Poi[]; reason: string } | null> {
  if (candidates.length <= count) return null;

  const result = await ask<{ ids?: string[]; reason?: string }>(
    "food",
    `You are the Food Agent for an India travel planner. ${RULES}
Return: {"ids": ["<id>", ...], "reason": "<one sentence, max 30 words>"}`,
    `${contextHeader(ctx)}

Choose ${count} places to eat giving good variety across cuisines and price levels.

CANDIDATES:
${describePois(candidates, 50)}`
  );

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const pois = (result?.ids ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Poi => Boolean(p));

  if (pois.length < Math.min(count, 2)) return null;
  return { pois: pois.slice(0, count), reason: (result?.reason ?? "").slice(0, 200) };
}

// ─── Transport Agent ────────────────────────────────────────────────────────
export async function aiChooseTransport(
  options: TransportOption[],
  ctx: AgentContext
): Promise<{ option: TransportOption; reason: string } | null> {
  if (options.length < 2) return null;

  const described = options
    .map(
      (o) =>
        `mode=${o.mode} distance=${o.distanceKm.value}km ` +
        `duration=${o.durationMin.value}min fare=${ctx.currency}${o.fare.value}`
    )
    .join("\n");

  const result = await ask<{ mode?: string; reason?: string }>(
    "transport",
    `You are the Transport Agent for an India travel planner. ${RULES}
Return: {"mode": "<one of the listed modes>", "reason": "<one sentence, max 25 words>"}`,
    `${contextHeader(ctx)}

Choose the best way to travel from ${ctx.origin ?? "the origin"} to ${ctx.destination},
balancing cost against journey time for this budget and travel style.

OPTIONS:
${described}`
  );

  const option = options.find((o) => o.mode === result?.mode);
  if (!option) return null;
  return { option, reason: (result?.reason ?? "").slice(0, 200) };
}

// ─── Research Agent ─────────────────────────────────────────────────────────
export async function aiSummariseResearch(
  ctx: AgentContext,
  counts: { stays: number; food: number; attractions: number },
  topAttractions: string[]
): Promise<string | null> {
  const result = await ask<{ summary?: string }>(
    "research",
    `You are the Research Agent for an India travel planner. ${RULES}
Summarise only what the research found. Do not add facts of your own.
Return: {"summary": "<2-3 sentences>"}`,
    `${contextHeader(ctx)}

Research found ${counts.attractions} attractions, ${counts.stays} places to stay
and ${counts.food} eateries mapped around ${ctx.destination}.

Most notable attractions found: ${topAttractions.slice(0, 12).join(", ")}

Write a short orientation for the traveller based strictly on this.`
  );

  return result?.summary?.slice(0, 600) ?? null;
}

// ─── Budget Agent ───────────────────────────────────────────────────────────
export async function aiBudgetAdvice(
  breakdown: CostBreakdown,
  ctx: AgentContext
): Promise<string | null> {
  const lines = breakdown.lines
    .map((l) => `${l.label}: ${ctx.currency}${l.amount.value} (${l.detail})`)
    .join("\n");

  const result = await ask<{ advice?: string }>(
    "budget",
    `You are the Budget Agent for an India travel planner. ${RULES}
Return: {"advice": "<2-3 sentences of practical budget guidance>"}`,
    `${contextHeader(ctx)}

COSTED PLAN:
${lines}
Total: ${ctx.currency}${breakdown.total}
Budget: ${ctx.currency}${breakdown.budget}
${breakdown.withinBudget ? `Remaining: ${ctx.currency}${breakdown.remaining}` : `OVER BUDGET by ${ctx.currency}${Math.abs(breakdown.remaining)}`}

Give practical advice on where this money is going and where it could flex.`
  );

  return result?.advice?.slice(0, 600) ?? null;
}

// ─── Itinerary Agent ────────────────────────────────────────────────────────
export async function aiDayTitles(
  days: PlannedDay[],
  ctx: AgentContext
): Promise<string[] | null> {
  const outline = days
    .map(
      (d) =>
        `Day ${d.day}: ${d.entries
          .filter((e) => e.placeName)
          .map((e) => e.placeName)
          .join(", ")}`
    )
    .join("\n");

  const result = await ask<{ titles?: string[] }>(
    "itinerary",
    `You are the Itinerary Agent for an India travel planner. ${RULES}
Name each day after what actually happens on it, using the real place names given.
Return: {"titles": ["<day 1 title>", ...]} with exactly ${days.length} titles, each under 45 characters.`,
    `${contextHeader(ctx)}

${outline}`
  );

  const titles = result?.titles;
  if (!Array.isArray(titles) || titles.length !== days.length) return null;
  return titles.map((t) => String(t).slice(0, 60));
}

// ─── Checker Agent ──────────────────────────────────────────────────────────
export type AiReview = {
  concerns: string[];
  suggestions: string[];
};

export async function aiReviewItinerary(
  days: PlannedDay[],
  breakdown: CostBreakdown,
  ctx: AgentContext
): Promise<AiReview | null> {
  const outline = days
    .map(
      (d) =>
        `Day ${d.day} (${d.date}) — ${ctx.currency}${d.dayCost}\n` +
        d.entries
          .map(
            (e) =>
              `  ${e.time}-${e.endTime} ${e.title}` +
              (e.travelFromPrevious
                ? ` [${e.travelFromPrevious.distanceKm}km, ${e.travelFromPrevious.durationMin}min travel]`
                : "")
          )
          .join("\n")
    )
    .join("\n\n");

  const result = await ask<AiReview>(
    "checker",
    `You are the Checker Agent for an India travel planner. ${RULES}
Review the schedule for practical problems a traveller would hit: unrealistic timing,
too much back-and-forth, meals at odd hours, a day that is too full or too empty.
Structural checks (dates, overlaps, budget) are already done separately — focus on realism.
Return: {"concerns": ["..."], "suggestions": ["..."]} with at most 4 of each, each under 25 words.
Return empty arrays if the plan looks sound.`,
    `${contextHeader(ctx)}

Total ${ctx.currency}${breakdown.total} of a ${ctx.currency}${breakdown.budget} budget.

${outline}`
  );

  if (!result) return null;
  return {
    concerns: (result.concerns ?? []).slice(0, 4).map((c) => String(c).slice(0, 200)),
    suggestions: (result.suggestions ?? []).slice(0, 4).map((s) => String(s).slice(0, 200)),
  };
}
