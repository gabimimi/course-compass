"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ExternalLink,
  LayoutDashboard,
  Link2,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react";
import { useChatSession } from "@/components/chat/ChatSessionProvider";
import { RESOURCE_LINKS } from "@/lib/resourceLinks";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/", label: "Chat", shortLabel: "Chat", icon: MessageSquare },
  {
    href: "/progress",
    label: "Degree Progress",
    shortLabel: "Progress",
    icon: LayoutDashboard,
  },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { busy } = useChatSession();
  const [linksOpen, setLinksOpen] = useState(false);

  useEffect(() => {
    if (!linksOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [linksOpen]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--background)] lg:flex-row">
      <aside className="hidden min-h-0 w-[272px] shrink-0 flex-col border-r border-white/10 bg-[var(--sidebar-bg)] text-white lg:flex">
        <div className="shrink-0 border-b border-white/10 px-4 py-4">
          <Link
            href="/"
            className="block rounded-xl bg-white p-4 shadow-md ring-1 ring-black/5 transition hover:ring-[var(--eecs-cyan)]/40"
          >
            <span className="font-compass-brand block text-[1.65rem] font-semibold leading-[1.15] tracking-tight">
              <span className="bg-gradient-to-r from-[#5b2d83] via-[#b23a8c] to-[#2a7f9a] bg-clip-text text-transparent">
                Course Compass
              </span>
            </span>
            <span className="mt-2 block text-[13px] leading-snug text-[var(--muted)]">
              Planning assistant for MIT Course 6 — grounded in the catalog.
            </span>
          </Link>
        </div>

        <nav className="shrink-0 flex flex-col gap-0.5 p-2">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/80 hover:bg-white/8 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                {item.label}
                {item.href === "/" && busy ? (
                  <Loader2
                    className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin opacity-80"
                    aria-label="Reply loading"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 px-2 py-3">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Helpful links
          </p>
          <ul className="flex flex-col gap-0.5">
            {RESOURCE_LINKS.map((r) => (
              <li key={r.href}>
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs leading-snug text-white/78 transition-colors hover:bg-white/8 hover:text-white"
                >
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
                  <span>{r.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <p className="shrink-0 border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/45">
          Not official MIT/EECS advice — confirm with the UG office and your
          audit.
        </p>

        <div className="shrink-0 w-full border-t border-white/10">
          <a
            href="https://www.eecs.mit.edu/"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full leading-none outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar-bg)]"
          >
            <Image
              src="/mit-eecs-sidebar-banner.png"
              alt="MIT EECS"
              width={1200}
              height={200}
              sizes="272px"
              className="h-auto w-full"
            />
            <span className="sr-only">MIT EECS (opens in new tab)</span>
          </a>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-[var(--border)] bg-[var(--header-bg)] lg:hidden">
          <div className="pt-[env(safe-area-inset-top,0px)]">
            <div
              className="flex h-11 items-center justify-between gap-1.5 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:gap-2"
            >
              <Link href="/" className="min-w-0 flex-1">
                <span className="font-compass-brand block truncate text-base font-semibold leading-tight sm:text-lg">
                  <span className="bg-gradient-to-r from-[#5b2d83] via-[#b23a8c] to-[#2a7f9a] bg-clip-text text-transparent">
                    Course Compass
                  </span>
                </span>
              </Link>

              <button
                type="button"
                onClick={() => setLinksOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--accent)] hover:text-foreground sm:px-2.5"
                aria-expanded={linksOpen}
                aria-haspopup="dialog"
              >
                <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                <span className="hidden sm:inline">Links</span>
              </button>

              <nav className="flex shrink-0 items-center gap-0.5 text-sm sm:gap-1">
                {NAV.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-md px-2 py-1.5 font-medium sm:px-2.5",
                        active
                          ? "bg-[var(--accent)] text-foreground"
                          : "text-[var(--muted)]",
                      )}
                    >
                      <span className="sm:hidden">{item.shortLabel}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                      {item.href === "/" && busy ? (
                        <Loader2 className="ml-0.5 inline h-3 w-3 animate-spin" />
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </header>
        {children}
      </div>

      {/* Mobile / tablet: same helpful links as desktop sidebar */}
      {linksOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-links-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="Close links"
            onClick={() => setLinksOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[min(88dvh,560px)] min-h-0 flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl ring-1 ring-black/5">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 id="mobile-links-title" className="text-sm font-semibold">
                Helpful links
              </h2>
              <button
                type="button"
                onClick={() => setLinksOpen(false)}
                className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--accent)] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {RESOURCE_LINKS.map((r) => (
                <li key={r.href}>
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 rounded-xl px-3 py-3 text-sm leading-snug text-foreground hover:bg-[var(--accent)]"
                    onClick={() => setLinksOpen(false)}
                  >
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[var(--eecs-cyan)]" />
                    <span>{r.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
