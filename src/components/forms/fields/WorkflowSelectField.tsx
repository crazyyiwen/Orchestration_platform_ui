import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ChevronDown, FolderOpen, Search, X } from "lucide-react";

import { useWorkflowStore } from "@/store/workflowStore";
import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import { inputBase } from "@/components/forms/inputs";
import type { WorkflowSummary } from "@/workflow/api/workflowApi";

const POPOVER_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 320;

/**
 * Selects an existing saved workflow as the target of a Sub Flow node.
 *
 * Backed by the same `workflowsIndex` the header's "Open workflow…"
 * autosuggest uses, so any workflow you've saved shows up here. The
 * bound field stores the workflow id; the trigger displays the
 * resolved name (falling back to the raw stored value if the workflow
 * was renamed/deleted). The currently-open workflow is excluded so a
 * Sub Flow can't recurse into itself.
 */
export function WorkflowSelectField({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const value = useFieldValue<string>(nodeId, fieldKey) ?? "";
  const setValue = useFieldSetter(nodeId, fieldKey);

  const list = useWorkflowStore((s) => s.workflowsIndex);
  const currentId = useWorkflowStore((s) => s.doc.id);
  const refresh = useWorkflowStore((s) => s.refreshWorkflowsIndex);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => list.find((w) => w.id === value),
    [list, value]
  );

  const openDropdown = () => {
    setAnchorRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setQuery("");
    setOpen(true);
    void refresh();
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className={clsx(
          inputBase,
          "flex items-center justify-between gap-2 text-left"
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <FolderOpen size={12} className="shrink-0 text-ink-500" />
          <span
            className={clsx(
              "truncate",
              !selected && !value && "text-ink-500"
            )}
          >
            {selected ? selected.name : value || "Select a workflow…"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                setValue("");
              }}
              className="flex h-4 w-4 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60 hover:text-ink-900"
            >
              <X size={11} />
            </span>
          )}
          <ChevronDown size={13} className="text-ink-500" />
        </span>
      </button>

      {open && (
        <WorkflowSelectPopover
          anchorRect={anchorRect}
          options={list}
          excludeId={currentId}
          selectedId={value}
          query={query}
          setQuery={setQuery}
          onPick={(id) => {
            setValue(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function WorkflowSelectPopover({
  anchorRect,
  options,
  excludeId,
  selectedId,
  query,
  setQuery,
  onPick,
  onClose,
}: {
  anchorRect: DOMRect | null;
  options: WorkflowSummary[];
  excludeId: string;
  selectedId: string;
  query: string;
  setQuery: (q: string) => void;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = options.filter((w) => w.id !== excludeId);
    if (!q) return base;
    return base.filter((w) => w.name.toLowerCase().includes(q));
  }, [options, excludeId, query]);

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const margin = 4;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const top =
      spaceBelow >= POPOVER_MAX_HEIGHT + margin
        ? anchorRect.bottom + margin
        : Math.max(margin, anchorRect.top - POPOVER_MAX_HEIGHT - margin);
    let left = anchorRect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - margin) {
      left = window.innerWidth - POPOVER_WIDTH - margin;
    }
    setCoords({ top, left });
  }, [anchorRect]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="listbox"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        zIndex: 1000,
      }}
      className="flex flex-col overflow-hidden rounded-md border border-ink-100 bg-white shadow-lg"
    >
      <div className="border-b border-ink-100 p-2">
        <div className="flex h-7 items-center gap-1.5 rounded border border-ink-100 bg-canvas px-2">
          <Search size={12} className="text-ink-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows…"
            className="h-full w-full bg-transparent text-xs outline-none placeholder:text-ink-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] italic text-ink-500">
            {query.trim()
              ? `No workflows match "${query.trim()}".`
              : "No other saved workflows. Save one first."}
          </p>
        ) : (
          filtered.map((w) => (
            <button
              key={w.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(w.id);
              }}
              className={clsx(
                "block w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-ink-100/60",
                selectedId === w.id && "bg-brand-500/5"
              )}
            >
              <div className="flex items-center gap-1.5">
                <FolderOpen
                  size={12}
                  className={clsx(
                    "shrink-0",
                    selectedId === w.id ? "text-brand-600" : "text-ink-500"
                  )}
                />
                <span className="truncate text-[12px] font-medium text-ink-900">
                  {w.name}
                </span>
                {selectedId === w.id && (
                  <span className="ml-auto rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-600">
                    Selected
                  </span>
                )}
              </div>
              <div className="text-[10px] text-ink-500">
                Updated {formatRelative(w.updatedAt)}
              </div>
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
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
