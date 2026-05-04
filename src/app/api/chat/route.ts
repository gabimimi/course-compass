import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyQuestion } from "@/lib/llm/classifier";
import { generateAnswer } from "@/lib/llm/answer";
import type { ChatMessage } from "@/lib/llm/anthropic";
import { CHAT_THREAD_MAX_MESSAGES } from "@/lib/chat/threadMemory";

export const runtime = "nodejs";
// The transformers.js model load + Anthropic round-trips can exceed the
// default 10s edge limit; allow longer.
export const maxDuration = 60;

const Body = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        scheduleCourseIds: z.array(z.string()).optional(),
      }),
    )
    .optional()
    .default([]),
  majorId: z.string().optional(),
  catalogYear: z.string().optional().default("2026-2027"),
  graduationYear: z.number().nullable().optional(),
  completedCourseIds: z.array(z.string()).optional().default([]),
});

export async function POST(req: Request) {
  let body;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Bad request", details: String(err) },
      { status: 400 },
    );
  }

  try {
    const history: ChatMessage[] = body.history.slice(-CHAT_THREAD_MAX_MESSAGES);
    const classification = await classifyQuestion(body.message, history);
    const answer = await generateAnswer({
      question: body.message,
      classification,
      history,
      majorId: body.majorId,
      catalogYear: body.catalogYear,
      graduationYear: body.graduationYear ?? null,
      completedCourseIds: body.completedCourseIds,
    });
    return NextResponse.json(answer);
  } catch (err) {
    console.error("[/api/chat] error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Chat failed", message: msg },
      { status: 500 },
    );
  }
}
