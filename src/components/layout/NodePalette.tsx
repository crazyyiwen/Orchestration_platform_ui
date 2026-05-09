import { useMemo, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";

import { nodeRegistry, paletteOrder } from "@/workflow/nodeRegistry";
import type { NodeTypeDefinition } from "@/workflow/types";
import { Icon } from "@/components/ui/Icon";
import { ICON_BG } from "@/components/ui/colorTokens";

/** MIME type used to carry the registry key during palette → canvas drag. */
export const PALETTE_DND_TYPE = "application/x-workflow-node-type";

type Tab = "nodes" | "tools";

/**
 * Left-side palette. Entirely registry-driven: the list comes from
 * `paletteOrder` × `nodeRegistry`, and the search filter operates on the
 * registry definitions, not on hard-coded entries.
 */
export function NodePalette() {
  const [tab, setTab] = useState<Tab>("nodes");
  const [query, setQuery] = useState("");

  const items: NodeTypeDefinition[] = useMemo(() => {
    const all = paletteOrder
      .map((key) => nodeRegistry[key])
      .filter((d): d is NodeTypeDefinition => Boolean(d));
    if (!query.trim()) return all;
    const q = query.trim().toLowerCase();
    return all.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [query]);

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    typeKey: string
  ) => {
    e.dataTransfer.setData(PALETTE_DND_TYPE, typeKey);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="flex w-[224px] shrink-0 flex-col border-r border-ink-100 bg-white">
      {/* Tabs */}
      <div className="flex shrink-0 gap-1 px-3 pt-3">
        {(["nodes", "tools"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors",
              tab === t
                ? "bg-ink-100 text-ink-900"
                : "text-ink-500 hover:bg-ink-100/60"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 pt-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-ink-100 bg-canvas px-2 transition-colors focus-within:border-brand-500 focus-within:bg-white">
          <Search size={14} className="text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-full w-full bg-transparent text-xs outline-none placeholder:text-ink-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="scrollbar-soft mt-2 flex-1 overflow-y-auto px-2 pb-3">
        {tab === "tools" ? (
          <div className="px-2 py-6 text-center text-xs text-ink-500">
            Tools view — coming soon.
          </div>
        ) : items.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-ink-500">
            No nodes match “{query}”.
          </div>
        ) : (
          <PaletteGroups items={items} onDragStart={handleDragStart} />
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Grouped list with subtle category separators                        */
/* ------------------------------------------------------------------ */

function PaletteGroups({
  items,
  onDragStart,
}: {
  items: NodeTypeDefinition[];
  onDragStart: (e: React.DragEvent<HTMLDivElement>, typeKey: string) => void;
}) {
  // Group consecutive items by category. The registry already lists them in a
  // sensible order, so this just inserts a separator when the category flips.
  const groups = useMemo(() => {
    const out: Array<{ category: string; items: NodeTypeDefinition[] }> = [];
    for (const def of items) {
      const last = out[out.length - 1];
      if (last && last.category === def.category) last.items.push(def);
      else out.push({ category: def.category, items: [def] });
    }
    return out;
  }, [items]);

  return (
    <div className="flex flex-col">
      {groups.map((group, gi) => (
        <div key={`${group.category}-${gi}`} className="flex flex-col">
          {gi > 0 && <div className="my-1.5 h-px bg-ink-100" />}
          {group.items.map((def) => (
            <div
              key={def.type}
              draggable
              onDragStart={(e) => onDragStart(e, def.type)}
              title={def.description}
              className="group flex cursor-grab items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-100/60 active:cursor-grabbing"
            >
              <span
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-transform group-hover:scale-105",
                  ICON_BG[def.color]
                )}
              >
                <Icon name={def.icon} size={14} strokeWidth={2.25} />
              </span>
              <span className="text-xs font-medium text-ink-900">
                {def.label}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
