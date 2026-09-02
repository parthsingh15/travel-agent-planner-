/**
 * Verification agent.
 *
 * Runs after assembly and before anything is written to the database. These are
 * deterministic checks, not a model opinion, so a failure is always explainable.
 */
import type { PlannedDay, ScheduleEntry } from "./assemble";
import type { CostBreakdown } from "./budget";

export type Severity = "error" | "warning";

export type VerificationIssue = {
  severity: Severity;
  code: string;
  message: string;
  day?: number;
};

export type VerificationReport = {
  approved: boolean;
  score: number;
  issues: VerificationIssue[];
  checks: { name: string; passed: boolean }[];
  stats: {
    totalEntries: number;
    realPlaces: number;
    verifiedCosts: number;
    estimatedCosts: number;
  };
};

const PLACEHOLDER_PATTERNS = [
  /morning activity/i,
  /afternoon activity/i,
  /evening activity/i,
  /coordinated by supervisor/i,
  /^recommended$/i,
  /^local restaurant$/i,
  /\bTBD\b/i,
  /\bplaceholder\b/i,
  /\[.*\]/, // unresolved template markers like [REAL HOTEL]
];

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function verifyItinerary(
  days: PlannedDay[],
  breakdown: CostBreakdown,
  ctx: { startDate: string; expectedDays: number; travellers: number }
): VerificationReport {
  const issues: VerificationIssue[] = [];
  const checks: { name: string; passed: boolean }[] = [];

  const allEntries: ScheduleEntry[] = days.flatMap((d) => d.entries);
  const check = (name: string, passed: boolean) => {
    checks.push({ name, passed });
    return passed;
  };

  // 1. No placeholder text may survive into a saved itinerary.
  const placeholders = allEntries.filter((e) =>
    PLACEHOLDER_PATTERNS.some(
      (re) => re.test(e.title) || (e.placeName ? re.test(e.placeName) : false)
    )
  );
  for (const e of placeholders) {
    issues.push({
      severity: "error",
      code: "PLACEHOLDER_TEXT",
      message: `Placeholder content in the itinerary: "${e.title}"`,
    });
  }
  check("No placeholder text", placeholders.length === 0);

  // 2. Every non-travel entry must name a real, linkable place.
  const unreal = allEntries.filter(
    (e) => e.kind !== "travel" && e.kind !== "rest" && (!e.placeName || !e.osmUrl)
  );
  for (const e of unreal) {
    issues.push({
      severity: "error",
      code: "UNVERIFIED_PLACE",
      message: `"${e.title}" is not backed by a real mapped place`,
    });
  }
  check("All places are real and linkable", unreal.length === 0);

  // 3. Budget must be respected.
  if (!breakdown.withinBudget) {
    issues.push({
      severity: "error",
      code: "OVER_BUDGET",
      message:
        `Trip costs ₹${breakdown.total.toLocaleString("en-IN")} against a budget of ` +
        `₹${breakdown.budget.toLocaleString("en-IN")} (over by ₹${Math.abs(breakdown.remaining).toLocaleString("en-IN")})`,
    });
  }
  check("Within budget", breakdown.withinBudget);

  // 4. Day count and dates must line up.
  check("Correct number of days", days.length === ctx.expectedDays);
  if (days.length !== ctx.expectedDays) {
    issues.push({
      severity: "error",
      code: "DAY_COUNT",
      message: `Expected ${ctx.expectedDays} days, produced ${days.length}`,
    });
  }

  let datesOk = true;
  for (const [i, day] of days.entries()) {
    const expected = new Date(`${ctx.startDate}T00:00:00Z`);
    expected.setUTCDate(expected.getUTCDate() + i);
    if (day.date !== expected.toISOString().split("T")[0]) {
      datesOk = false;
      issues.push({
        severity: "error",
        code: "WRONG_DATE",
        day: day.day,
        message: `Day ${day.day} is dated ${day.date}, expected ${expected.toISOString().split("T")[0]}`,
      });
    }
  }
  check("Dates are sequential and correct", datesOk);

  // 5. No overlapping entries within a day.
  let overlapFree = true;
  for (const day of days) {
    const sorted = [...day.entries].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    for (let i = 1; i < sorted.length; i++) {
      if (toMinutes(sorted[i].time) < toMinutes(sorted[i - 1].endTime)) {
        overlapFree = false;
        issues.push({
          severity: "error",
          code: "OVERLAP",
          day: day.day,
          message: `Day ${day.day}: "${sorted[i].title}" starts before "${sorted[i - 1].title}" ends`,
        });
      }
    }
  }
  check("No overlapping activities", overlapFree);

  // 6. No duplicated places across the trip.
  const seen = new Map<string, number>();
  let duplicateFree = true;
  for (const day of days) {
    for (const e of day.entries) {
      if (e.kind !== "attraction" || !e.placeName) continue;
      if (seen.has(e.placeName)) {
        duplicateFree = false;
        issues.push({
          severity: "warning",
          code: "DUPLICATE_PLACE",
          day: day.day,
          message: `${e.placeName} appears on both day ${seen.get(e.placeName)} and day ${day.day}`,
        });
      } else {
        seen.set(e.placeName, day.day);
      }
    }
  }
  check("No duplicate attractions", duplicateFree);

  // 7. Travel load must be humane.
  let travelOk = true;
  for (const day of days) {
    // Only count hopping between stops. The long-haul arrival/return leg is
    // inherent to the trip, not a sign of an over-packed day.
    const travelMin = day.entries
      .filter((e) => e.kind !== "travel")
      .reduce((s, e) => s + (e.travelFromPrevious?.durationMin ?? 0), 0);
    if (travelMin > 300) {
      travelOk = false;
      issues.push({
        severity: "warning",
        code: "EXCESSIVE_TRAVEL",
        day: day.day,
        message: `Day ${day.day} involves about ${Math.round(travelMin / 60)}h of local travel`,
      });
    }
  }
  check("Travel time is reasonable", travelOk);

  // 8. Every major cost category must be accounted for.
  const required = ["stay", "food", "localTransport", "misc"] as const;
  const present = new Set(breakdown.lines.map((l) => l.key));
  const missing = required.filter((k) => !present.has(k));
  for (const key of missing) {
    issues.push({
      severity: "warning",
      code: "MISSING_COST",
      message: `No ${key} cost is included in the breakdown`,
    });
  }
  check("All major expenses costed", missing.length === 0);

  // 9. A day with nothing in it is a failure, not a rest day.
  const empty = days.filter((d) => d.entries.length === 0);
  for (const d of empty) {
    issues.push({
      severity: "error",
      code: "EMPTY_DAY",
      day: d.day,
      message: `Day ${d.day} has no activities`,
    });
  }
  check("No empty days", empty.length === 0);

  const costed = allEntries.map((e) => e.cost).filter(Boolean);
  const stats = {
    totalEntries: allEntries.length,
    realPlaces: allEntries.filter((e) => e.osmUrl).length,
    verifiedCosts: costed.filter((c) => c!.confidence === "VERIFIED").length,
    estimatedCosts: costed.filter((c) => c!.confidence === "ESTIMATED").length,
  };

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const score = Math.max(0, 100 - errors * 25 - warnings * 5);

  return { approved: errors === 0, score, issues, checks, stats };
}
