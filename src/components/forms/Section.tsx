import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

interface SectionProps {
  title: string;
  defaultCollapsed?: boolean;
  /** Visual variant: "panel" matches the right-drawer; "nested" is smaller. */
  variant?: "panel" | "nested";
  children: ReactNode;
}

/**
 * Collapsible section used by both the top-level properties panel and
 * by nested accordion fields. Single source of truth for the chevron +
 * spacing animation.
 */
export function Section({
  title,
  defaultCollapsed = false,
  variant = "panel",
  children,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (variant === "nested") {
    return (
      <section className="rounded-md border border-ink-100 bg-white">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[11px] font-semibold text-ink-700 transition-colors hover:bg-ink-100/40"
        >
          <span>{title}</span>
          <ChevronDown
            size={14}
            className={clsx(
              "text-ink-500 transition-transform duration-150",
              collapsed && "-rotate-90"
            )}
          />
        </button>
        {!collapsed && <div className="border-t border-ink-100 px-3 py-2">{children}</div>}
      </section>
    );
  }

  return (
    <section className="border-b border-ink-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-700 transition-colors hover:bg-ink-100/40"
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          className={clsx(
            "text-ink-500 transition-transform duration-150",
            collapsed && "-rotate-90"
          )}
        />
      </button>
      {!collapsed && <div className="px-4 pb-3.5 pt-0.5">{children}</div>}
    </section>
  );
}
