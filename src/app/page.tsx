"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { CategoryBadge } from "@/components/chat/CategoryBadge";
import { HydrantScheduleFrame } from "@/components/chat/HydrantScheduleFrame";
import { Citations } from "@/components/chat/Citations";
import { MajorPicker } from "@/components/chat/MajorPicker";
import { useChatSession } from "@/components/chat/ChatSessionProvider";
import { useUserState } from "@/lib/userState";
import { cn } from "@/lib/utils/cn";
import type { QuestionCategory } from "@/lib/llm/classifier";
import type { ChatTurnPersistable } from "@/lib/chatSessionStorage";

type ChatTurn = ChatTurnPersistable;

const SUGGESTED: { label: string; question: string }[] = [
  {
    label: "What are the foundation classes for 6-3?",
    question: "What are the foundation classes for the 6-3 major?",
  },
  {
    label: "Which classes can satisfy CI-M for Course 6?",
    question: "Which Course 6 classes can satisfy the CI-M requirement?",
  },
  {
    label: "What classes teach distributed systems?",
    question:
      "Which Course 6 classes cover distributed systems and consensus algorithms?",
  },
  {
    label: "What courses are similar to 6.1010?",
    question: "What classes are similar to 6.1010 in scope or topic?",
  },
];

export default function ChatPage() {
  const { turns, input, setInput, busy, submit, handleSubmit } = useChatSession();
  const { state, hydrated, update } = useUserState();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth [overflow-wrap:anywhere]">
        <div
          className="mx-auto flex w-full max-w-3xl flex-col gap-2 py-4 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:py-6 sm:pl-4 sm:pr-4"
        >
          {turns.length === 0 ? (
            <Welcome
              majorId={state.majorId}
              hydrated={hydrated}
              onMajorChange={(id) => update({ majorId: id })}
              onPick={(q) => submit(q)}
            />
          ) : (
            <div className="flex flex-col gap-3 sm:gap-4">
              {turns.map((t, i) => (
                <Turn
                  key={t.id}
                  turn={t}
                  isLatest={i === turns.length - 1}
                />
              ))}
            </div>
          )}
          <div ref={endRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--background)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <form
          onSubmit={handleSubmit}
          className="mx-auto w-full max-w-3xl pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] py-3 sm:px-4 sm:py-4"
        >
          <div
            className="flex min-w-0 items-end gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--card)] py-2 pl-3 pr-2 sm:rounded-[28px] sm:pl-4 sm:pr-2.5 focus-within:border-[color-mix(in_srgb,var(--eecs-cyan)_50%,var(--border))] focus-within:ring-2 focus-within:ring-[var(--ring)]"
            style={{ boxShadow: "var(--composer-shadow)" }}
          >
            <div className="min-w-0 flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
                rows={1}
                placeholder="Message Course Compass…"
                className="w-full resize-none border-0 bg-transparent px-0 py-2.5 text-[16px] leading-relaxed text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none max-h-48 sm:text-[15px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/60 pt-2 text-xs text-[var(--muted)]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0">Major</span>
                  <MajorPicker
                    value={state.majorId}
                    onChange={(id) => update({ majorId: id })}
                    optionStyle="short"
                    className="min-w-0 max-w-[6.5rem] flex-1 sm:max-w-[10rem] sm:flex-initial"
                  />
                </div>
                <span className="hidden sm:inline text-[11px]">
                  Enter to send · Shift+Enter for new line
                </span>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy || input.trim().length === 0}
              className={cn(
                "mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9",
                "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm",
                "transition enabled:hover:opacity-90 disabled:opacity-40",
                "active:scale-95",
              )}
              aria-label="Send"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Welcome({
  majorId,
  hydrated,
  onMajorChange,
  onPick,
}: {
  majorId: string | null;
  hydrated: boolean;
  onMajorChange: (id: string) => void;
  onPick: (q: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-0 py-6 text-center sm:py-12">
      <p className="text-sm font-medium text-[var(--eecs-purple)]">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-[var(--eecs-cyan)]" />
          Grounded in official MIT sources
        </span>
      </p>
      <h1 className="mt-4 text-2xl font-medium leading-tight text-[var(--foreground)] sm:text-3xl">
        Plan your Course 6 path with sources you can verify
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-[var(--muted)]">
        Ask about requirements, what counts for what, or what to take next. I
        cite the catalog; I&apos;ll point you to an advisor when it matters.
      </p>

      <div className="mt-6 flex w-full max-w-sm flex-col items-center gap-2 self-center text-sm text-[var(--muted)] sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
        <span className="shrink-0">I&apos;m exploring</span>
        <MajorPicker
          value={hydrated ? majorId : "6-3"}
          onChange={onMajorChange}
          optionStyle="short"
          className="w-full max-w-[8.5rem] sm:w-auto sm:max-w-none"
        />
      </div>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
        {SUGGESTED.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.question)}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-sm transition hover:border-[color-mix(in_srgb,var(--eecs-cyan)_45%,var(--border))] hover:shadow-md"
          >
            <div className="text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--eecs-purple)]">
              {s.label}
            </div>
            <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
              {s.question}
            </div>
          </button>
        ))}
      </div>

      <p className="mt-10 max-w-lg text-center text-xs leading-relaxed text-[var(--muted)]">
        Course Compass is an MVP. It does not replace your MIT advisor. Always
        verify with the official degree chart and your audit.
      </p>
    </div>
  );
}

function Turn({
  turn,
  isLatest,
}: {
  turn: ChatTurn;
  isLatest: boolean;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[min(92vw,720px)] rounded-[26px] px-3 py-2.5 text-[15px] leading-relaxed break-words sm:px-4 sm:py-2.5",
            "bg-[var(--user-bubble)] text-[var(--user-bubble-text)]",
            isLatest && "ring-1 ring-[color-mix(in_srgb,var(--eecs-cyan)_45%,transparent)]",
          )}
        >
          {turn.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[min(100%,36rem)] w-full min-w-0">
        {turn.classification && !turn.scheduleHydrantUrl && (
          <div className="mb-2">
            <CategoryBadge
              category={turn.classification.category as QuestionCategory}
              rationale={turn.classification.rationale}
            />
          </div>
        )}
        <div
          className={cn(
            "rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-[15px] leading-relaxed break-words sm:rounded-[20px] sm:px-4",
            "shadow-sm transition-[box-shadow,border-color] duration-200",
            isLatest &&
              "border-[color-mix(in_srgb,var(--eecs-cyan)_35%,var(--border))] shadow-md",
          )}
        >
          {turn.pending ? (
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Consulting the catalog…</span>
            </div>
          ) : turn.error ? (
            <div className="text-sm text-red-700 dark:text-red-400">
              <strong>Something went wrong.</strong> {turn.error}
            </div>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {turn.content}
              </ReactMarkdown>
              {turn.scheduleHydrantUrl && (
                <div className="mt-3">
                  <HydrantScheduleFrame url={turn.scheduleHydrantUrl} />
                </div>
              )}
              {turn.scheduleImageUrl && !turn.scheduleHydrantUrl && (
                <div className="mt-3 rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--card)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={turn.scheduleImageUrl}
                    alt="Weekly schedule preview"
                    className="w-full max-h-[520px] object-contain object-top bg-white"
                  />
                </div>
              )}
              {turn.citations && !turn.scheduleHydrantUrl && (
                <Citations items={turn.citations} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
