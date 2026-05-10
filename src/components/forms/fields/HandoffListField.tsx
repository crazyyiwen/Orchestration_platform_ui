import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Plus,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";

import { useWorkflowStore } from "@/store/workflowStore";
import { nodeRegistry } from "@/workflow/nodeRegistry";
import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import {
  inputBase,
  textareaBase,
  subtleButton,
  iconButton,
} from "@/components/forms/inputs";
import { Icon } from "@/components/ui/Icon";
import { ICON_BG } from "@/components/ui/colorTokens";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Handoff {
  id: string;
  name: string;
  description?: string;
}

interface NodeOption {
  id: string;
  name: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/* Field                                                               */
/* ------------------------------------------------------------------ */

/**
 * Manages the agent's handoff configurations.
 *
 * Each handoff item becomes a labeled output handle on the canvas card.
 * The name field is an autocomplete combobox that suggests workflow nodes
 * that aren't already a handoff target on this same agent — picking one
 * sets the name AND auto-creates the edge from the handoff handle to that
 * node. Users can still type a free-form name, and dragging on the canvas
 * still works.
 *
 * Conceptually this maps onto LangGraph's `add_node` + conditional-edge
 * pattern: when the agent calls a handoff tool, the workflow continues
 * along the corresponding edge.
 */
export function HandoffListField({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const handoffs = useFieldValue<Handoff[]>(nodeId, fieldKey) ?? [];
  const setHandoffs = useFieldSetter(nodeId, fieldKey);

  const edges = useWorkflowStore((s) => s.doc.edges);
  const nodes = useWorkflowStore((s) => s.doc.nodes);
  const removeEdge = useWorkflowStore((s) => s.removeEdge);
  const connect = useWorkflowStore((s) => s.connect);

  const update = (id: string, patch: Partial<Handoff>) =>
    setHandoffs(handoffs.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  const remove = (id: string) => {
    setHandoffs(handoffs.filter((h) => h.id !== id));
    const orphan = edges.find(
      (e) => e.source === nodeId && e.sourceHandle === id
    );
    if (orphan) removeEdge(orphan.id);
  };

  const add = () => {
    setHandoffs([
      ...handoffs,
      { id: `ho_${nanoid(6)}`, name: "", description: "" },
    ]);
  };

  const targetIdFor = (handoffId: string): string | null =>
    edges.find((e) => e.source === nodeId && e.sourceHandle === handoffId)
      ?.target ?? null;

  const targetNameFor = (handoffId: string): string | null => {
    const tid = targetIdFor(handoffId);
    if (!tid) return null;
    return nodes.find((n) => n.id === tid)?.data.name ?? null;
  };

  /** Available target nodes for a specific handoff: exclude self, Start, and
   *  any node already targeted by ANOTHER handoff on this same agent. */
  const availableForHandoff = (handoffId: string): NodeOption[] => {
    const usedByOthers = new Set<string>();
    for (const h of handoffs) {
      if (h.id === handoffId) continue;
      const tid = targetIdFor(h.id);
      if (tid) usedByOthers.add(tid);
    }
    return nodes
      .filter((n) => n.id !== nodeId)
      .filter((n) => n.data.type !== "start")
      .filter((n) => !usedByOthers.has(n.id))
      .map((n) => ({ id: n.id, name: n.data.name, type: n.data.type }));
  };

  /** Pick a target node — set the handoff name + replace the edge. */
  const pick = (handoffId: string, option: NodeOption) => {
    update(handoffId, { name: option.name });

    const existing = edges.find(
      (e) => e.source === nodeId && e.sourceHandle === handoffId
    );
    if (existing) {
      // Same target → no need to recreate (avoids a flash on the canvas).
      if (existing.target === option.id) return;
      removeEdge(existing.id);
    }
    connect({
      source: nodeId,
      sourceHandle: handoffId,
      target: option.id,
      targetHandle: "in",
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {handoffs.length === 0 && (
        <p className="text-[11px] italic text-ink-500">
          No handoffs. Adding one creates an output handle on the canvas card —
          pick a target node from the suggestions or drag from the handle.
        </p>
      )}
      {handoffs.map((h) => {
        const targetName = targetNameFor(h.id);
        const targetId = targetIdFor(h.id);
        const available = availableForHandoff(h.id);
        return (
          <div
            key={h.id}
            className="rounded-md border border-ink-100 bg-white p-2"
          >
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-orange-700 ring-1 ring-orange-100">
                Handoff
              </span>
              <HandoffNameCombo
                value={h.name}
                onChange={(v) => update(h.id, { name: v })}
                options={available}
                currentTargetId={targetId}
                onPick={(opt) => pick(h.id, opt)}
              />
              <button
                type="button"
                onClick={() => remove(h.id)}
                className={iconButton}
                aria-label="Remove handoff"
                title="Remove handoff"
              >
                <X size={13} />
              </button>
            </div>
            <textarea
              value={h.description ?? ""}
              onChange={(e) => update(h.id, { description: e.target.value })}
              placeholder="When should the agent take this handoff?"
              rows={2}
              className={`${textareaBase} mt-1.5`}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              {targetName ? (
                <>
                  <ArrowRight size={11} className="text-emerald-600" />
                  <span className="text-emerald-700">
                    Connected to <strong>{targetName}</strong>
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={11} className="text-amber-600" />
                  <span className="text-amber-700">
                    Not connected — pick a node above or drag from the canvas
                    handle.
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className={`${subtleButton} self-start`}
      >
        <Plus size={12} /> Add handoff
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Autocomplete combobox                                               */
/* ------------------------------------------------------------------ */

function HandoffNameCombo({
  value,
  onChange,
  options,
  currentTargetId,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  options: NodeOption[];
  currentTargetId: string | null;
  onPick: (option: NodeOption) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.type.toLowerCase().includes(q)
    );
  }, [value, options]);

  const openDropdown = () => {
    setAnchorRect(inputRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          openDropdown();
        }}
        onFocus={openDropdown}
        onBlur={() => {
          // Delay close so click on a suggestion (mousedown) fires first.
          window.setTimeout(() => setOpen(false), 150);
        }}
        onClick={openDropdown}
        placeholder="Pick or type a name…"
        className={`${inputBase} h-7 pr-6`}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          // Don't take focus from the input — we use focus state to drive the
          // dropdown. mousedown.preventDefault keeps focus on the input.
          e.preventDefault();
          if (open) {
            setOpen(false);
          } else {
            inputRef.current?.focus();
            openDropdown();
          }
        }}
        className="absolute right-0.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-500 hover:text-ink-900"
        aria-label="Show node suggestions"
        tabIndex={-1}
      >
        <ChevronDown
          size={11}
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <SuggestionsPopover
          anchorRect={anchorRect}
          options={filtered}
          currentTargetId={currentTargetId}
          onPick={(opt) => {
            onPick(opt);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portal-rendered suggestions popover                                 */
/* ------------------------------------------------------------------ */

const POPOVER_MAX_HEIGHT = 240;

function SuggestionsPopover({
  anchorRect,
  options,
  currentTargetId,
  onPick,
}: {
  anchorRect: DOMRect | null;
  options: NodeOption[];
  currentTargetId: string | null;
  onPick: (option: NodeOption) => void;
}) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const margin = 4;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    const top =
      spaceBelow >= POPOVER_MAX_HEIGHT + margin || spaceBelow >= spaceAbove
        ? anchorRect.bottom + 2
        : Math.max(margin, anchorRect.top - POPOVER_MAX_HEIGHT - 2);
    let left = anchorRect.left;
    const width = Math.max(anchorRect.width, 220);
    if (left + width > window.innerWidth - margin) {
      left = window.innerWidth - width - margin;
    }
    if (left < margin) left = margin;
    setCoords({ top, left, width });
  }, [anchorRect]);

  // Close on Escape (mousedown.preventDefault on items handles outside-click).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Find the active input and blur it to close via the parent's onBlur.
        const el = document.activeElement;
        if (el instanceof HTMLElement) el.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return createPortal(
    <div
      role="listbox"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: coords.width,
        maxHeight: POPOVER_MAX_HEIGHT,
        zIndex: 1000,
      }}
      className="overflow-y-auto rounded-md border border-ink-100 bg-white shadow-lg"
    >
      {options.length === 0 ? (
        <div className="px-3 py-3 text-[11px] italic text-ink-500">
          No available nodes — every other node is already wired to a handoff
          on this agent. Add a node to the canvas first, or remove an existing
          handoff.
        </div>
      ) : (
        <ul className="py-1">
          {options.map((opt) => {
            const def = nodeRegistry[opt.type];
            const isCurrent = currentTargetId === opt.id;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  // mousedown so insertion fires before the input loses focus.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(opt);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors",
                    isCurrent ? "bg-blue-50" : "hover:bg-ink-100/60"
                  )}
                >
                  {def && (
                    <span
                      className={clsx(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded",
                        ICON_BG[def.color]
                      )}
                    >
                      <Icon name={def.icon} size={11} strokeWidth={2.25} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] font-medium text-ink-900">
                        {opt.name || <em className="text-ink-500">(unnamed)</em>}
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-semibold text-blue-700">
                          CURRENT
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-ink-500">
                      {def?.label ?? opt.type}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    document.body
  );
}
