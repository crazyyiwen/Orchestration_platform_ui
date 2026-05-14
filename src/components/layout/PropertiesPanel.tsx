import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AlertCircle, Trash2, X } from "lucide-react";

import { nodeRegistry } from "@/workflow/nodeRegistry";
import {
  selectSelectedNode,
  useWorkflowStore,
} from "@/store/workflowStore";
import { Icon } from "@/components/ui/Icon";
import { ICON_BG_LARGE } from "@/components/ui/colorTokens";
import { DynamicFormRenderer } from "@/components/forms/DynamicFormRenderer";

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 388;
const STORAGE_KEY = "workflow-builder:properties-panel-width";

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_WIDTH;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

/**
 * Right-side properties panel.
 *
 * Never branches on node type. The header (icon + name + delete) and the
 * description input are node-agnostic because the spec calls them out
 * explicitly. Everything below the header is rendered by
 * `DynamicFormRenderer`, which walks `formSections` from the registry.
 *
 * Width is user-resizable via a drag handle on the left edge. The chosen
 * width is persisted to localStorage as a small UI preference (separate
 * from workflow data, which lives on the backend).
 */
export function PropertiesPanel() {
  const node = useWorkflowStore(selectSelectedNode);
  const allNodes = useWorkflowStore((s) => s.doc.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const selectNode = useWorkflowStore((s) => s.selectNode);

  const [width, setWidth] = useState<number>(readStoredWidth);
  const resizing = useRef(false);

  // Persist width to localStorage whenever it settles.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  // Global mouse listeners so the drag tracks even if the cursor leaves
  // the handle's 6px hit area.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const next = window.innerWidth - e.clientX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // Live duplicate-name check. Validation at save-time will refuse the save,
  // so this banner is just an early warning while the user is typing.
  const isDuplicateName = useMemo(() => {
    if (!node) return false;
    const trimmed = node.data.name.trim();
    if (!trimmed) return false;
    return allNodes.some(
      (n) => n.id !== node.id && n.data.name.trim() === trimmed
    );
  }, [allNodes, node]);

  // No node selected → hide the panel entirely so the canvas fills the space.
  // The user re-opens it by clicking a node on the canvas.
  if (!node) return null;

  const def = nodeRegistry[node.data.type];
  if (!def) {
    return (
      <aside
        style={{ width }}
        className="relative shrink-0 border-l border-ink-100 bg-white p-4 text-sm text-rose-700"
      >
        <ResizeHandle onMouseDown={startResize} />
        Unknown node type: {node.data.type}
      </aside>
    );
  }

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-l border-ink-100 bg-white"
    >
      <ResizeHandle onMouseDown={startResize} />

      {/* Header */}
      <div className="flex items-start gap-3 border-b border-ink-100 px-4 py-3.5">
        <span
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            ICON_BG_LARGE[def.color]
          )}
        >
          <Icon name={def.icon} size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={node.data.name}
            onChange={(e) =>
              updateNodeData(node.id, { name: e.target.value })
            }
            className={clsx(
              "w-full bg-transparent text-sm font-semibold outline-none focus:underline focus:underline-offset-2",
              isDuplicateName ? "text-rose-600" : "text-ink-900"
            )}
          />
          <div className="text-[11px] text-ink-500">{def.label}</div>
          {isDuplicateName && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-rose-600">
              <AlertCircle size={11} />
              Another node already uses this name.
            </div>
          )}
        </div>
        {node.data.type !== "start" && (
          <button
            onClick={() => removeNode(node.id)}
            className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60 hover:text-rose-600"
            aria-label="Delete node"
            title="Delete node"
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={() => selectNode(null)}
          className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60"
          aria-label="Close panel"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Description */}
      <div className="border-b border-ink-100 px-4 py-3">
        <label className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
          Description
        </label>
        <textarea
          value={node.data.description}
          onChange={(e) =>
            updateNodeData(node.id, { description: e.target.value })
          }
          rows={2}
          placeholder={def.description}
          className="mt-1 w-full resize-y rounded-md border border-ink-100 bg-canvas px-2 py-1.5 text-xs text-ink-900 outline-none placeholder:text-ink-500 focus:border-brand-500 focus:bg-white"
        />
      </div>

      {/* Schema-driven body */}
      <div className="scrollbar-soft flex-1 overflow-y-auto">
        <DynamicFormRenderer nodeId={node.id} sections={def.formSections} />
      </div>
    </aside>
  );
}

/**
 * 6 px vertical strip on the left edge that catches mousedown for the
 * resize gesture. Subtle by default, brand-tinted on hover so users
 * discover the affordance.
 */
function ResizeHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize properties panel"
      className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-brand-500/40 active:bg-brand-500/60"
    />
  );
}
