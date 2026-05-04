/**
 * Anthropic Claude client wrapper. Reads ANTHROPIC_API_KEY from env.
 *
 * We intentionally keep this thin: callers pass system + messages and get the
 * raw text or a parsed JSON object back.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let clientInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (clientInstance) return clientInstance;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to use the chat.",
    );
  }
  clientInstance = new Anthropic({ apiKey });
  return clientInstance;
}

export const MODEL_FAST = "claude-haiku-4-5";
export const MODEL_SMART = "claude-sonnet-4-6";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /**
   * When the client replays a turn that included a Hydrant embed, the canonical
   * subject list from that embed (round-trip memory; not sent to the LLM).
   */
  scheduleCourseIds?: string[];
}

export interface CompleteOptions {
  system: string;
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  /**
   * Prefill the assistant's response. Useful for forcing JSON output: pass
   * "{" and Claude will continue from there.
   */
  prefill?: string;
}

/**
 * Send a chat completion to Claude. Returns the raw text. If `prefill` is
 * provided, the prefill is prepended so callers can append their open brace,
 * etc., and get back a continuous string.
 */
export async function complete(opts: CompleteOptions): Promise<string> {
  const client = getClient();

  const messages = opts.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (opts.prefill) {
    messages.push({ role: "assistant", content: opts.prefill });
  }

  const res = await client.messages.create({
    model: opts.model ?? MODEL_FAST,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages,
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");

  return opts.prefill ? `${opts.prefill}${text}` : text.trim();
}

/**
 * Send a chat completion expecting JSON output. Uses an assistant prefill of
 * `{` to force Claude into JSON mode, plus a defensive object-extraction
 * fallback if anything follows the JSON.
 */
export async function completeJson<T>(opts: CompleteOptions): Promise<T> {
  const raw = await complete({ ...opts, prefill: opts.prefill ?? "{" });
  const cleaned = extractJsonObject(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from Claude. Raw output:\n${raw}\n\nError: ${err}`,
    );
  }
}

/**
 * Robustly extract the first balanced JSON object from a string. Handles:
 *   - Plain `{...}` output
 *   - Code-fenced blocks: ```json ... ``` or ``` ... ```
 *   - JSON followed by extra commentary (we stop at the matching closing brace)
 */
function extractJsonObject(s: string): string {
  let text = s.trim();

  // Strip a leading code fence if present.
  const fenceStart = text.match(/^```(?:json)?\s*/i);
  if (fenceStart) {
    text = text.slice(fenceStart[0].length);
    const fenceEnd = text.lastIndexOf("```");
    if (fenceEnd !== -1) text = text.slice(0, fenceEnd);
  }
  text = text.trim();

  // Walk to find the first balanced { ... } block.
  const start = text.indexOf("{");
  if (start === -1) return text; // let JSON.parse throw a sensible error

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  // No balanced close; return what we have for the parser to error on.
  return text.slice(start);
}
