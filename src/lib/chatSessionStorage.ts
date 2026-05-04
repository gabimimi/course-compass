/**
 * Chat turn types for the in-memory session (not persisted — chat resets on full page refresh).
 */

import type { ClassificationResult } from "@/lib/llm/classifier";
import type { AnswerCitation } from "@/lib/llm/answer";

const SESSION_KEY = "course-compass:chatSession:v1";

export interface PersistedChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  classification?: ClassificationResult;
  citations?: AnswerCitation[];
  /** Live Hydrant iframe URL when the answer included a schedule embed. */
  scheduleHydrantUrl?: string;
  /** Canonical subject IDs from the last Hydrant embed (server round-trip). */
  scheduleCourseIds?: string[];
  /** @deprecated Old SVG preview; kept so older sessionStorage rows still render. */
  scheduleImageUrl?: string;
  error?: string;
}

/** UI-only flag for in-memory turns. */
export type ChatTurnPersistable = PersistedChatTurn & { pending?: boolean };

export function clearPersistedChatSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
