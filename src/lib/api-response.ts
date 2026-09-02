import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiError = {
  error: string;
  details?: unknown;
};

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, details?: unknown) {
  const body: ApiError = { error: message };
  if (details !== undefined) {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError("Validation failed", 422, error.flatten().fieldErrors);
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return apiError("Unauthorized", 401);
    }
    if (error.message === "FORBIDDEN") {
      return apiError("Forbidden", 403);
    }
    if (error.message === "NOT_FOUND") {
      return apiError("Not found", 404);
    }
    console.error("API Error:", error.message);
    return apiError(error.message, 400);
  }

  console.error("Unknown API Error:", error);
  return apiError("Internal server error", 500);
}
