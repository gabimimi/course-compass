"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ClassificationResult } from "@/lib/llm/classifier";
import type { AnswerCitation, ScheduleHydrantEmbedPayload } from "@/lib/llm/answer";
import { clearPersistedChatSession, type ChatTurnPersistable } from "@/lib/chatSessionStorage";
import { readPersistedUserState } from "@/lib/userState";
import { CHAT_THREAD_MAX_MESSAGES } from "@/lib/chat/threadMemory";

type ChatTurn = ChatTurnPersistable;

interface ChatSessionContextValue {
  turns: ChatTurn[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  submit: (text: string) => void;
  handleSubmit: (e: FormEvent) => void;
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export function useChatSession() {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) {
    throw new Error("useChatSession must be used within ChatSessionProvider");
  }
  return ctx;
}

export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const busyRef = useRef(false);

  useEffect(() => {
    clearPersistedChatSession();
  }, []);

  const submit = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;

    const prior = turnsRef.current;
    const history = prior
      .filter((t) => !t.pending && !t.error)
      .map((t) => ({
        role: t.role,
        content: t.content,
        ...(t.role === "assistant" &&
        t.scheduleCourseIds &&
        t.scheduleCourseIds.length > 0
          ? { scheduleCourseIds: t.scheduleCourseIds }
          : {}),
      }))
      .slice(-CHAT_THREAD_MAX_MESSAGES);

    const userTurn: ChatTurn = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const pendingTurn: ChatTurn = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      pending: true,
    };

    busyRef.current = true;
    setBusy(true);
    setTurns([...prior, userTurn, pendingTurn]);
    setInput("");

    void (async () => {
      try {
        const user = readPersistedUserState();
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history,
            majorId: user.majorId,
            catalogYear: user.catalogYear,
            graduationYear: user.graduationYear,
            completedCourseIds: user.completedCourseIds,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Request failed (${res.status})`);
        }
        const data = (await res.json()) as {
          text: string;
          citations: AnswerCitation[];
          classification: ClassificationResult;
          scheduleHydrant?: ScheduleHydrantEmbedPayload;
          scheduleCourseIds?: string[];
        };
        setTurns((prev) =>
          prev.map((t) =>
            t.id === pendingTurn.id
              ? {
                  ...t,
                  content: data.text,
                  classification: data.classification,
                  citations: data.citations,
                  scheduleHydrantUrl: data.scheduleHydrant?.url,
                  scheduleCourseIds: data.scheduleCourseIds,
                  scheduleImageUrl: undefined,
                  pending: false,
                }
              : t,
          ),
        );
      } catch (err) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === pendingTurn.id
              ? {
                  ...t,
                  pending: false,
                  error: err instanceof Error ? err.message : "Unknown error",
                }
              : t,
          ),
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      submit(input);
    },
    [submit, input],
  );

  const value = useMemo(
    () => ({
      turns,
      input,
      setInput,
      busy,
      submit,
      handleSubmit,
    }),
    [turns, input, busy, submit, handleSubmit],
  );

  return (
    <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
  );
}
