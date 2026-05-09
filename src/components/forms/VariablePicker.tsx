import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

import { useWorkflowStore } from "@/store/workflowStore";
import {
  getAvailableVariables,
  type VariableGroup,
} from "@/workflow/variableContext";

interface VariablePickerProps {
  /** Anchor whose bottom-left/top-left we attach to. */
  anchorRect: DOMRect | null;
  onSelect: (path: string) => void;
  onClose: () => void;
  /** Excluded from "Node Results" — usually the node currently being edited. */
  excludeNodeId?: string | null;
}

const PICKER_WIDTH = 288;
const PICKER_MAX_HEIGHT = 360;

/**
 * Variable picker rendered into a portal so it can escape the right
 * panel's `overflow-y-auto`. Positions itself viewport-aware: prefers
 * below the anchor, flips above when there's no room.
 */
export function VariablePicker({
  anchorRect,
  onSelect,
  onClose,
  excludeNodeId,
}: VariablePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const doc = useWorkflowStore((s) => s.doc);
  const groups = useMemo(
    () => getAvailableVariables(doc, excludeNodeId),
    [doc, excludeNodeId]
  );

  const filtered = useMemo<VariableGroup[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        variables: g.variables.filter(
          (v) =>
            v.path.toLowerCase().includes(q) ||
            v.label.toLowerCase().includes(q) ||
            (v.description ?? "").toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.variables.length > 0);
  }, [groups, query]);

  // Position the panel relative to the anchor + viewport.
  useLayoutEffect(() => {
    if (!anchorRect) return;
    const margin = 4;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const top =
      spaceBelow >= PICKER_MAX_HEIGHT + margin || spaceBelow >= spaceAbove
        ? anchorRect.bottom + margin
        : Math.max(margin, anchorRect.top - PICKER_MAX_HEIGHT - margin);

    let left = anchorRect.right - PICKER_WIDTH;
    if (left < margin) left = margin;
    if (left + PICKER_WIDTH > window.innerWidth - margin) {
      left = window.innerWidth - PICKER_WIDTH - margin;
    }
    setCoords({ top, left });
  }, [anchorRect]);

  // Close on outside click / Escape.
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
      role="dialog"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: PICKER_WIDTH,
        maxHeight: PICKER_MAX_HEIGHT,
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
            placeholder="Search variables…"
            className="h-full w-full bg-transparent text-xs outline-none placeholder:text-ink-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-ink-500">
            No variables match.
          </p>
        )}
        {filtered.map((group) => (
          <Group key={group.id} title={group.title} count={group.variables.length}>
            {group.variables.length === 0 ? (
              <p className="px-3 py-2 text-[11px] italic text-ink-500">
                None.
              </p>
            ) : (
              group.variables.map((v) => (
                <button
                  key={v.path}
                  type="button"
                  // mousedown so insertion fires before the input loses focus
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(v.path);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-ink-100/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-blue-700">
                      {v.label}
                    </span>
                    {v.valueType && (
                      <span className="rounded bg-ink-100 px-1 py-0.5 text-[9px] font-medium text-ink-500">
                        {v.valueType}
                      </span>
                    )}
                  </div>
                  {v.description && (
                    <p className="mt-0.5 truncate text-[10px] text-ink-500">
                      {v.description}
                    </p>
                  )}
                </button>
              ))
            )}
          </Group>
        ))}
      </div>
    </div>,
    document.body
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="border-b border-ink-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-500 hover:text-ink-700"
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
        <span>{title}</span>
        <span className="ml-auto rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-medium text-ink-500">
          {count}
        </span>
      </button>
      {!collapsed && <div className="pb-1">{children}</div>}
    </div>
  );
}
