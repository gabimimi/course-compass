import { ExternalLink } from "lucide-react";
import type { AnswerCitation } from "@/lib/llm/answer";

export function Citations({ items }: { items: AnswerCitation[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">
        Sources
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
        {items.map((c) => (
          <li key={c.courseId}>
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1.5 hover:underline"
            >
              <span className="font-mono text-[var(--primary)]">
                {c.courseId}
              </span>
              <span className="text-[var(--muted)]">·</span>
              <span className="text-[var(--muted)]">{c.title}</span>
              <ExternalLink className="h-3 w-3 mt-0.5 text-[var(--muted)]" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
