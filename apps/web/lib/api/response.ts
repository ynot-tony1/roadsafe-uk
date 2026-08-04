import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function zodErrorResponse(error: ZodError) {
  return jsonError(400, "Invalid query parameters", error.flatten());
}
