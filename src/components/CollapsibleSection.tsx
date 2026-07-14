import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  tone?: "default" | "muted" | "active";
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  tone = "default",
  className = "",
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;

  const handleToggle = () => {
    const nextOpen = !resolvedOpen;
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  return (
    <section className={className}>
      <button
        type="button"
        onClick={handleToggle}
        className={[
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-bold transition",
          tone === "active"
            ? "border-teal-200 bg-teal-50 text-teal-800"
            : tone === "muted"
              ? "border-slate-200 bg-slate-50 text-slate-500"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
        ].join(" ")}
      >
        <span className="min-w-0 truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {count !== undefined && (
            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
              {count}
            </span>
          )}
          {resolvedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>
      <div
        className={[
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-150 ease-out",
          resolvedOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
