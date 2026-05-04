/**
 * Behavioral classifier: every user question is first classified into a
 * category that determines how (and whether) the system should answer.
 *
 * In addition to the four-way category, the classifier extracts intent flags
 * and structured filters that the answer step uses to decide how much extra
 * context to inject (requirement tree, progress report, joint-listing
 * expansion, list-style retrieval, etc.).
 */

import "server-only";
import { CHAT_THREAD_MAX_MESSAGES } from "@/lib/chat/threadMemory";
import { completeJson, MODEL_FAST } from "@/lib/llm/anthropic";
import type { ChatMessage } from "@/lib/llm/anthropic";

export type QuestionCategory =
  | "factual"
  | "opinion"
  | "personal_high_stakes"
  | "off_topic";

export interface ClassifierFilters {
  /** Department to restrict retrieval to (e.g., "6", "18"). */
  department?: string;
  hass?: "HASS-A" | "HASS-S" | "HASS-H" | "HASS-E";
  ci?: "CI-H" | "CI-HW" | "CI-M";
  offered?: "fall" | "spring" | "iap" | "summer";
  gir?: string;
}

export interface ClassifierIntents {
  /**
   * The question is about the user's degree progress / what they have left to
   * take / which requirement node would a class satisfy. When true, the
   * answer step injects the full requirement tree + progress report.
   */
  needsProgress: boolean;
  /**
   * The question explicitly references cross-listings or "joint" subjects.
   * When true, the course context is enriched with all known joint /
   * meets-with subject IDs.
   */
  mentionsJointListings: boolean;
  /**
   * The question is about a specific track / thread / concentration within
   * a major. The answer step injects TRACKS_CONTEXT.
   */
  mentionsTrack: boolean;
  /**
   * The question is asking for an exhaustive list ("all CI-M classes",
   * "every advanced subject in 6"). We bypass the top-k retrieval cap.
   */
  isListQuery: boolean;
  /**
   * The question is about the *structure of a major* (e.g. "what are the
   * requirements for 6-14", "tell me everything about 6-3"). When true the
   * answer step dumps the full requirement tree into MAJOR_CONTEXT.
   */
  wantsMajorRequirements: boolean;
  /**
   * The question asks for courses that are similar to / replacements for /
   * alternatives to a specific course ("what's similar to 6.3260?", "if I
   * can't take X what should I take instead?"). When true and a course id is
   * mentioned, retrieval uses that course's embedding as the query vector.
   */
  wantsSimilarCourses: boolean;
  /**
   * The user is asking whether specific subjects can be taken together without
   * time conflicts ("will 6.1820 fit if I'm taking 6.1220 and 6.1020?").
   */
  wantsScheduleFit: boolean;
}

export interface ClassificationResult {
  category: QuestionCategory;
  rationale: string;
  /** A retrieval query rewritten for the corpus. Only set for factual. */
  searchQuery?: string;
  filters?: ClassifierFilters;
  intents: ClassifierIntents;
  /**
   * Canonical major IDs explicitly named or implied by the question (e.g.
   * ["6-3", "6-14"] for "compare 6-3 and 6-14"). Always an array — empty
   * if the user didn't reference a specific major. The answer step loads
   * every entry into MAJOR_CONTEXT so comparison questions work.
   */
  mentionedMajorIds: string[];
  /**
   * Course IDs explicitly mentioned in the question (e.g. ["6.3260",
   * "18.06"]). Pulled out by the classifier so that the answer step can
   * fetch the courses' details and use their embeddings as retrieval seeds.
   */
  mentionedCourseIds: string[];
}

const SYSTEM = `You are the *intent classifier* for Course Compass, a grounded MIT academic-planning assistant.

Classify each student question into exactly one of:

- "factual" — answer can be looked up in official MIT course/requirement/schedule data
  OR computed from the user's own input + that data. Most questions go here. Examples:
    "what classes satisfy CI-M for 6-3"
    "what does 6.1010 teach"
    "show me HASS-A classes offered in spring"
    "is 6.1010 a prerequisite for 6.1210"
    "what classes are joint-listed with Course 7 but count for my 6-3 major"
    "what do I have left to take for 6-3?"
    "compare the requirements of 6-3 and 6-14"
    "if I switch from 6-3 to 6-14 and I've finished all 6-3, how many extra units?"
    "if I take 6.3900, what would still be left for 6-4?"
    "what classes overlap between 6-3 and 6-7?"
    "if I'm taking 6.1220 and 6.1020, will 6.1820 fit my schedule?"
    "show my schedule for 6.1010 and 6.1210 in Fall 2026"
    "hydrant schedule with 6.1020, 6.1210"
    "do 6.1010 and 6.1210 conflict?"
  When the student says schedule / Hydrant schedule / my schedule here, they usually mean the weekly Hydrant grid preview we embed — classify as factual unless obviously unrelated (e.g. only off-campus work shifts).
  When the student says **HASS-A** (or a HASS area) and **fit / this schedule / this week** in the
  same message, they want HASS options that plausibly fit the **current thread’s course grid** —
  factual; extract course IDs from prior turns if the message only references “this schedule”.
  Comparison and "what-if" math questions about requirements ARE factual — even when
  the user uses words like "switch" or "change majors". You have the requirement trees
  for every Course 6 major and can do the unit/subject diff.

- "opinion" — subjective taste judgments about a class or a professor ("is this
   professor good?", "which class is easiest?", "do people like 6.1010?", "is the
   workload manageable?", "is the Mol Bio track better than the AI track?"). System
   WILL NOT answer; we link to evaluation resources.

- "personal_high_stakes" — requires personal life/career judgement that genuinely
   needs a human in the loop, NOT just math we could compute from the catalog.
   Examples: "should I take a gap year?", "am I cut out for CS?", "how do I deal
   with failing a class?", "I'm depressed and falling behind, what do I do?",
   "should I switch majors because I'm not enjoying my current one?".
   IMPORTANT: a question about *how* to switch majors, or what units it would cost,
   or which requirements overlap, is NOT this category — it's factual math. Only
   classify as personal_high_stakes when the question asks the system to make a
   value judgment about the student's life choices.
   IMPORTANT: asking to **preview / update / swap subjects** in **Hydrant** or a
   **weekly schedule grid** (including “replace 6.1020 with 6.5110 in the Hydrant
   you showed”) is **factual tooling**, NOT advising — we only rebuild a preview URL.

- "off_topic" — not about MIT academics at all.
   IMPORTANT: “Add this class to **Hydrant** / **show the schedule again** / **same
   calendar with a swap**” stays **factual**. Only “write to my Google/Outlook/phone
   calendar app” without MIT academic context trends off-topic when it’s purely a
   personal-app integration request.

You also extract structured filters and four boolean intent flags so the answer step
knows how much extra context to load:

- needsProgress: true if the user is asking about their own degree progress, what they
  have left, what would still need to be done, whether a course they took satisfies
  a particular requirement node, OR they ask which requirement slots / nodes a named
  course can satisfy for a major (including for a hypothetical student: "what could
  6.C395 count for on 6-3?").
- mentionsJointListings: true if the user mentions "joint", "cross-listed", "also
  numbered", "same class as", or asks about courses with multiple subject IDs.
- mentionsTrack: true if the user mentions "track", "thread", "concentration",
  "specialization", OR names a specific Course 6 thread (AI thread, theory thread,
  systems thread, ML thread, etc), OR asks whether a course counts toward / satisfies
  / fulfills / can be used for a track or concentration (even if they never say the
  word "track").
- isListQuery: true if the user is asking for an exhaustive list ("all", "every",
  "what are all the", "list all"). False if they're asking for a recommendation or
  just one example.
- wantsMajorRequirements: true if the user is asking about the structure of a major
  ("what are the requirements for 6-14?", "tell me about 6-3", "what classes do I need
  for AI and Decision Making?", "what's in 6-9?"). True even if the user already has
  a major selected — they may be exploring a different one.
- wantsSimilarCourses: true if the user is asking for courses that are similar to /
  alternatives for / replacements for a specific course they mention. Triggers on
  phrases like "similar to", "like 6.3260", "alternatives to", "instead of", "replace",
  "swap", "doesn't fit my schedule what else", "if I can't take X". When true, ALSO
  populate mentionedCourseIds with the referenced course(s).
  NOTE: "doesn't fit my schedule" here means *topic/workload substitution* — not timetable overlap.
- wantsScheduleFit: true when the user asks whether named subjects **overlap in clock time**
  on a weekly schedule, or whether another class "fits" alongside classes they list
  ("will 6.1820 fit my schedule if I'm taking 6.1220 and 6.1020?", "do these conflict?",
  "same time as", "double-booked", "can I take A and B together"). When true, extract
  **every** subject number they name into mentionedCourseIds (two or more when comparing conflicts;
  one subject is ok when they only want a Hydrant week preview for a single class).
  If they name a **calendar term** (e.g. "Fall 2027", "Spring 2026", or Hydrant-style "f26"/"s27"), keep that wording in the question so the server can load the matching Hydrant JSON.

Also extract every Course 6 major the user names — return an ARRAY in
\`mentionedMajorIds\`. Canonical IDs: "6-3", "6-4", "6-5", "6-7", "6-9", "6-14".
Match by ID OR by name:
- "Computer Science and Engineering" / "CS and Engineering" / "CSE" → "6-3"
- "Artificial Intelligence and Decision Making" / "AI and Decision Making" / "AI+D" → "6-4"
- "Electrical Engineering with Computing" / "EE with Computing" → "6-5"
- "Computer Science and Molecular Biology" / "CS and Bio" / "CSMB" → "6-7"
- "Computation and Cognition" / "C&C" → "6-9"
- "Computer Science, Economics, and Data Science" / "CS Econ Data" → "6-14"
For comparison questions ("if I switched from 6-3 to 6-14 ...") return BOTH IDs in
order of mention. Empty array if no major is named.

OUTPUT STRICT JSON ONLY (no markdown fences, no commentary, no leading/trailing text):

{
  "category": "factual" | "opinion" | "personal_high_stakes" | "off_topic",
  "rationale": "<1-2 sentences explaining the classification, addressed to the student>",
  "searchQuery": "<rewritten retrieval query or null>",
  "filters": {
    "department": "<e.g. '6', '18' or null>",
    "hass": "<HASS-A | HASS-S | HASS-H | HASS-E or null>",
    "ci": "<CI-H | CI-HW | CI-M or null>",
    "offered": "<fall | spring | iap | summer or null>",
    "gir": "<LAB | REST | PHY1 | PHY2 | CAL1 | CAL2 | CHEM | BIOL or null>"
  },
  "intents": {
    "needsProgress": <bool>,
    "mentionsJointListings": <bool>,
    "mentionsTrack": <bool>,
    "isListQuery": <bool>,
    "wantsMajorRequirements": <bool>,
    "wantsSimilarCourses": <bool>,
    "wantsScheduleFit": <bool>
  },
  "mentionedMajorIds": ["<canonical major IDs in order of mention, e.g. ['6-3','6-14']; empty array if none>"],
  "mentionedCourseIds": ["<each course ID like '6.3260', '18.06', '6.C395' that the user mentions; empty array if none>"]
}

If a filter doesn't apply, use null. Always include all seven intent flags.
Always include mentionedCourseIds as an array (possibly empty).
Never wrap in code fences. Never write text before or after the JSON object.`;

export async function classifyQuestion(
  question: string,
  history: ChatMessage[] = [],
): Promise<ClassificationResult> {
  const recent = history.slice(-CHAT_THREAD_MAX_MESSAGES);
  const result = await completeJson<RawClassification>({
    system: SYSTEM,
    model: MODEL_FAST,
    maxTokens: 500,
    messages: [
      ...recent.slice(-10),
      { role: "user", content: question },
    ],
  });

  const category: QuestionCategory =
    result.category === "factual" ||
    result.category === "opinion" ||
    result.category === "personal_high_stakes" ||
    result.category === "off_topic"
      ? result.category
      : "factual";

  // Extract major IDs from BOTH the LLM output and the literal question
  // text (defense-in-depth so "6-14" never gets dropped).
  const majorsFromModel = Array.isArray(result.mentionedMajorIds)
    ? result.mentionedMajorIds.filter(
        (s): s is string => typeof s === "string" && KNOWN_MAJOR_IDS.has(s),
      )
    : [];
  const majorsFromText = extractMajorIdsFromText(question);
  const mentionedMajorIds = [...new Set([...majorsFromModel, ...majorsFromText])];

  // Extract course IDs from the LLM's structured output AND from the literal
  // text of the user's question. The latter acts as a safety net in case the
  // LLM forgets to populate the array.
  const fromModel = Array.isArray(result.mentionedCourseIds)
    ? result.mentionedCourseIds.filter(
        (s): s is string => typeof s === "string" && /^\d{1,2}\.[0-9A-Za-z]+$/i.test(s),
      )
    : [];
  const fromText = extractCourseIdsFromText(question);
  const mentionedCourseIds = [...new Set([...fromModel, ...fromText])];

  return {
    category,
    rationale: typeof result.rationale === "string" ? result.rationale : "",
    searchQuery:
      typeof result.searchQuery === "string" && result.searchQuery.trim()
        ? result.searchQuery
        : undefined,
    filters: cleanFilters(result.filters),
    intents: {
      needsProgress: !!result.intents?.needsProgress,
      mentionsJointListings: !!result.intents?.mentionsJointListings,
      mentionsTrack: !!result.intents?.mentionsTrack,
      isListQuery: !!result.intents?.isListQuery,
      wantsMajorRequirements: !!result.intents?.wantsMajorRequirements,
      wantsSimilarCourses: !!result.intents?.wantsSimilarCourses,
      wantsScheduleFit: !!result.intents?.wantsScheduleFit,
    },
    mentionedMajorIds,
    mentionedCourseIds,
  };
}

/** Pull "6-3" / "6-14" / etc. style major IDs out of the literal question. */
function extractMajorIdsFromText(text: string): string[] {
  const re = /\b6-(3|4|5|7|9|14)\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(`6-${m[1]}`);
  }
  return [...out];
}

/** Pull X.YYYY-style IDs out of the literal user question (case-insensitive on the segment after the dot). */
export function extractCourseIdsFromText(text: string): string[] {
  const re = /\b(\d{1,2})\.([0-9A-Za-z]+)\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(`${m[1]}.${m[2]}`);
  }
  return [...out];
}

const KNOWN_MAJOR_IDS = new Set(["6-3", "6-4", "6-5", "6-7", "6-9", "6-14"]);

interface RawClassification {
  category?: string;
  rationale?: string;
  searchQuery?: string | null;
  filters?: Record<string, string | null | undefined>;
  intents?: Partial<ClassifierIntents>;
  mentionedMajorIds?: unknown;
  mentionedCourseIds?: unknown;
}

function cleanFilters(
  raw: Record<string, string | null | undefined> | undefined,
): ClassifierFilters | undefined {
  if (!raw) return undefined;
  const out: ClassifierFilters = {};
  if (typeof raw.department === "string") out.department = raw.department;
  if (
    raw.hass === "HASS-A" ||
    raw.hass === "HASS-S" ||
    raw.hass === "HASS-H" ||
    raw.hass === "HASS-E"
  )
    out.hass = raw.hass;
  if (raw.ci === "CI-H" || raw.ci === "CI-HW" || raw.ci === "CI-M") out.ci = raw.ci;
  if (
    raw.offered === "fall" ||
    raw.offered === "spring" ||
    raw.offered === "iap" ||
    raw.offered === "summer"
  )
    out.offered = raw.offered;
  if (typeof raw.gir === "string") out.gir = raw.gir;
  return Object.keys(out).length === 0 ? undefined : out;
}
