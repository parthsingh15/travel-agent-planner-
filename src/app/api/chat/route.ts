import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireVerifiedAuth } from "@/lib/auth";
import { generateText, aiStatus, AIError } from "@/lib/ai";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { apiSuccess, apiError, handleApiError } from "@/lib/api-response";
import { chatMessageSchema } from "@/lib/validators";
import { loadTripFacts, renderTripContext, type TripFacts } from "@/lib/chat/trip-context";
import { answerOffline } from "@/lib/chat/offline-assistant";
import { AuditAction } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const body = await request.json();
    const data = chatMessageSchema.parse(body);

    let sessionId = data.sessionId;
    let tripContext = "";
    let facts: TripFacts | null = null;

    if (data.tripId) {
      facts = await loadTripFacts(data.tripId, session.id);
      if (!facts) {
        return apiError("Trip not found", 404);
      }
      tripContext = renderTripContext(facts);
    }

    if (!sessionId) {
      const chatSession = await prisma.chatSession.create({
        data: {
          userId: session.id,
          tripId: data.tripId,
        },
      });
      sessionId = chatSession.id;
    } else {
      const existing = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId: session.id },
      });
      if (!existing) {
        return apiError("Chat session not found", 404);
      }
    }

    await prisma.chatMessage.create({
      data: {
        sessionId,
        role: "user",
        content: data.message,
      },
    });

    const history = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    let assistantContent: string;

    const status = aiStatus();
    const systemPrompt = `You are a travel assistant for an India trip planner. All money is in ${facts?.currency ?? "INR"}.

Answer ONLY from the trip data below. It comes from real research: places are from OpenStreetMap, distances and durations from a routing engine, and costs from a documented model.

Rules:
- Never invent a hotel, restaurant, attraction, price or opening time. If the data does not contain something, say so plainly.
- Costs marked (est) are estimates, not live prices. Say so when you quote them.
- When suggesting a change, name the actual places already in the itinerary.
- You cannot modify the trip yourself. Describe the change and tell the user to apply it in the planner.
- Be concise and practical. Use ₹ for rupee amounts.

${tripContext || "The user has not selected a trip, so you have no trip data. Ask them to open one."}`;

    if (!status.configured) {
      // No key for the selected provider: answer from stored trip data rather
      // than pretending to be a conversational model.
      assistantContent = answerOffline(data.message, facts);
    } else {
      try {
        const result = await generateText({
          system: systemPrompt,
          messages: history.map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          })),
          temperature: 0.4,
          maxOutputTokens: 900,
        });
        assistantContent = result.text;
      } catch (error) {
        const aiError =
          error instanceof AIError
            ? error
            : new AIError("bad_request", String(error));

        console.error(
          `[chat] ${aiError.provider} ${aiError.kind}` +
            (aiError.status ? ` (${aiError.status})` : "") +
            `: ${aiError.message}`
        );

        // Degrade to the data-grounded answer, but say why.
        assistantContent = `${aiError.userMessage}\n\n${answerOffline(data.message, facts)}`;
      }
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: assistantContent,
      },
    });

    await createAuditLog({
      userId: session.id,
      action: AuditAction.CHAT_MESSAGE,
      entity: "ChatSession",
      entityId: sessionId,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({
      sessionId,
      message: assistantMessage,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireVerifiedAuth();
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");

    const sessions = await prisma.chatSession.findMany({
      where: {
        userId: session.id,
        ...(tripId && { tripId }),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
        trip: { select: { id: true, title: true, destination: true } },
      },
    });

    return apiSuccess({ sessions });
  } catch (error) {
    return handleApiError(error);
  }
}
