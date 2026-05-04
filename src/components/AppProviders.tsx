"use client";

import { ChatSessionProvider } from "@/components/chat/ChatSessionProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ChatSessionProvider>{children}</ChatSessionProvider>;
}
