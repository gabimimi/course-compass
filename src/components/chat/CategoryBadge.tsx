import { cn } from "@/lib/utils/cn";
import {
  BookOpen,
  HeartHandshake,
  MessageSquareWarning,
  Slash,
} from "lucide-react";
import type { QuestionCategory } from "@/lib/llm/classifier";

const META: Record<
  QuestionCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    classes: string;
  }
> = {
  factual: {
    label: "Grounded answer",
    icon: BookOpen,
    classes:
      "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700",
  },
  opinion: {
    label: "Subjective — see evaluations",
    icon: MessageSquareWarning,
    classes:
      "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700",
  },
  personal_high_stakes: {
    label: "Talk to your advisor",
    icon: HeartHandshake,
    classes:
      "bg-violet-50 text-violet-900 border-violet-200 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-700",
  },
  off_topic: {
    label: "Outside scope",
    icon: Slash,
    classes:
      "bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700",
  },
};

export function CategoryBadge({
  category,
  rationale,
}: {
  category: QuestionCategory;
  rationale?: string;
}) {
  const meta = META[category];
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "inline-flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-snug",
        meta.classes,
      )}
      title={rationale}
    >
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="flex flex-col">
        <span className="font-medium">{meta.label}</span>
        {rationale && (
          <span className="opacity-80 mt-0.5">{rationale}</span>
        )}
      </div>
    </div>
  );
}
