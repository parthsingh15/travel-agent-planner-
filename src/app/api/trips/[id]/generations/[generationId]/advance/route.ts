import { NextRequest } from "next/server";
import { requireVerifiedAuth } from "@/lib/auth";
import { apiSuccess, handleApiError } from "@/lib/api-response";
import { advanceGeneration } from "@/lib/agents/stages";

type Params = { params: Promise<{ id: string; generationId: string }> };

/**
 * Advance the generation by exactly one stage.
 *
 * The client calls this while a generation is in progress. Keeping each request
 * to a single stage means no request approaches a serverless time limit, and an
 * interrupted run resumes from the last completed stage.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const session = await requireVerifiedAuth();
    const { id, generationId } = await params;

    const result = await advanceGeneration(generationId, id, session.id);
    return apiSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/** Allow serverless platforms to give this route the longest slice they permit. */
export const maxDuration = 60;
