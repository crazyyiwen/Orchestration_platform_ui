import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ChevronDown, FolderOpen, Search } from "lucide-react";

import { useWorkflowStore } from "@/store/workflowStore";
import type { WorkflowSummary } from "@/workflow/api/workflowApi";

const POPOVER_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 320;

/**
 * Compact autocomplete sitting next to the workflow name in the header.
 * Typing filters `workflowsIndex` by name; picking an entry calls
 * `switchWorkflow(id)` which fetches the doc via `GET /api/workflows/{id}`
 * and replaces the editor's canvas.
 *
 * The current workflow's name is shown elsewhere (top-left), so this input
 * stays as a "search to open" field — empty placeholder, cleared after a
 * pick. Opens on focus, closes on blur with a small grace period so the
 * mouse click on a suggestion lands first.
 */
export function WorkflowSwitcher() {
  const list = useWorkflowStore((s) => s.workflowsIndex);
  const switchTo = useWorkflowStore((s) => s.switchWorkflow);
  const refresh = useWorkflowStore((s) => s.refreshWorkflowsIndex);
  const currentId = useWorkflowStore((s) => s.doc.id);

  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => w.name.toLowerCase().includes(q));
  }, [list, query]);

  const openDropdown = () => {
    setAnchorRect(inputRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
    // Refresh on each open so the list reflects the latest backend state.
    void refresh();
  };

  const closeWithDelay = () => {
    window.setTimeout(() => setOpen(false), 150);
  };

  const handlePick = async (id: string) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    await switchTo(id);
  };

  return (
    <div className="relative">
      <div className="flex h-8 w-[260px] items-center gap-2 rounded-md border border-ink-100 bg-canvas px-2 transition-colors focus-within:border-brand-500 focus-within:bg-white">
        <Search size={13} className="shrink-0 text-ink-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) openDropdown();
          }}
          onFocus={openDropdown}
          onBlur={closeWithDelay}
          placeholder="Open workflow…"
          className="h-full w-full bg-transparent text-xs outline-none placeholder:text-ink-500"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        <ChevronDown
          size={12}
          className={clsx(
            "shrink-0 text-ink-500 transition-transform",
            open && "rotate-180"
          )}
        />
      </div>
      {open && (
        <SuggestionsPopover
          anchorRect={anchorRect}
          options={filtered}
          currentId={currentId}
          query={query}
          onPick={handlePick}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Popover                                                             */
/* ------------------------------------------------------------------ */

function SuggestionsPopover({
  anchorRect,
  options,
  currentId,
  query,
  onPick,
}: {
  anchorRect: DOMRect | null;
  options: WorkflowSummary[];
  currentId: string;
  query: string;
  onPick: (id: string) => void;
}) {
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const margin = 4;
    let left = anchorRect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - margin) {
      left = window.innerWidth - POPOVER_WIDTH - margin;
    }
    setCoords({ top: anchorRect.bottom + 2, left });
  }, [anchorRect]);

  return createPortal(
    <div
      role="listbox"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        zIndex: 1000,
      }}
      className="overflow-y-auto rounded-md border border-ink-100 bg-white shadow-lg"
    >
      {options.length === 0 ? (
        <div className="px-3 py-4 text-center text-[11px] italic text-ink-500">
          {query.trim()
            ? `No workflows match "${query.trim()}".`
            : "No saved workflows yet. Hit Save in a workflow to keep it."}
        </div>
      ) : (
        options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            // mousedown so the pick fires before the input loses focus and
            // the blur-delay closes the popover.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(opt.id);
            }}
            className={clsx(
              "block w-full border-b border-ink-100 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-ink-100/60",
              currentId === opt.id && "bg-brand-500/5"
            )}
            role="option"
            aria-selected={currentId === opt.id}
          >
            <div className="flex items-center gap-2">
              <FolderOpen
                size={12}
                className={clsx(
                  "shrink-0",
                  currentId === opt.id ? "text-brand-600" : "text-ink-500"
                )}
              />
              <span className="truncate text-[12px] font-medium text-ink-900">
                {opt.name}
              </span>
              {currentId === opt.id && (
                <span className="ml-auto rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-600">
                  Current
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[10px] text-ink-500">
              Updated {formatRelative(opt.updatedAt)}
            </div>
          </button>
        ))
      )}
    </div>,
    document.body
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleString();
}
