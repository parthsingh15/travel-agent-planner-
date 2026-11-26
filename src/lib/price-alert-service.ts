import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { checkComparableQuote, QuoteError, type Quote } from "@/lib/services/live-quotes";

export async function checkPriceAlerts(filter: { userId?: string; id?: string } = {}) {
  const alerts = await prisma.priceAlert.findMany({
    where: { ...filter, status: "ACTIVE" },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: 10,
    include: { user: { select: { email: true } } },
  });

  return Promise.all(alerts.map(async (alert) => {
    const metadata = alert.metadata as { quote?: Quote } | null;
    const original = metadata?.quote;
    const now = new Date();
    let state = "untracked";
    let detail = "Create a new alert from a live search result.";
    let freshQuote: Quote | undefined;
    const travelDate = original?.type === "FLIGHT" ? original.query.departDate : original?.query.checkIn;
    const expired = (alert.expiresAt && alert.expiresAt <= now) ||
      (travelDate && travelDate < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now));

    if (expired) {
      state = "expired";
      detail = "Travel date or alert has expired.";
    } else if (original) {
      try {
        freshQuote = await checkComparableQuote(original);
        state = freshQuote ? "quoted" : "unavailable";
        detail = freshQuote ? "Comparable quote found." : "No comparable quote was available.";
      } catch (error) {
        state = "error";
        detail = error instanceof QuoteError ? error.message : "Could not check the provider.";
      }
    }

    const triggered = !!freshQuote && freshQuote.price <= alert.targetPrice;
    const latestCheck = {
      state, detail, at: freshQuote?.checkedAt ?? new Date().toISOString(),
      price: freshQuote?.price, source: freshQuote?.source,
    };
    const nextMetadata = { ...metadata, latestCheck };
    const result = await prisma.priceAlert.updateMany({
      where: { id: alert.id, status: "ACTIVE", updatedAt: alert.updatedAt },
      data: {
        metadata: { ...nextMetadata, ...(triggered ? { emailStatus: "pending" } : {}) } as Prisma.InputJsonValue,
        currentPrice: freshQuote?.price,
        status: triggered ? "TRIGGERED" : expired ? "EXPIRED" : "ACTIVE",
        triggeredAt: triggered ? new Date() : undefined,
      },
    });

    if (result.count && triggered && freshQuote) {
      const sent = !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL) && await sendEmail({
        to: alert.user.email,
        subject: "Travel Planner price target reached",
        htmlContent: `<p>Your tracked offer reached ${freshQuote.currency} ${freshQuote.price.toFixed(2)}.</p><p>Open Price Alerts in Travel Planner for the quote details.</p>`,
      });
      await prisma.priceAlert.update({
        where: { id: alert.id },
        data: { metadata: { ...nextMetadata, emailStatus: sent ? "sent" : "failed" } as Prisma.InputJsonValue },
      });
    }
    return { id: alert.id, triggered: !!result.count && triggered };
  }));
}
