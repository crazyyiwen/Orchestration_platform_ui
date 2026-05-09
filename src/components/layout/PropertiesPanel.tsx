import { useMemo } from "react";
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

/**
 * Right-side properties panel.
 *
 * The panel itself never branches on node type. Two pieces of node-agnostic
 * UI live here — the header (icon + name + delete) and the description input —
 * because the spec calls them out explicitly. Everything below the header is
 * rendered by `DynamicFormRenderer`, which walks `formSections` from the
 * registry. Adding a node type or a field requires zero changes in this file.
 */
export function PropertiesPanel() {
  const node = useWorkflowStore(selectSelectedNode);
  const allNodes = useWorkflowStore((s) => s.doc.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const selectNode = useWorkflowStore((s) => s.selectNode);

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
      <aside className="w-[380px] shrink-0 border-l border-ink-100 bg-white p-4 text-sm text-rose-700">
        Unknown node type: {node.data.type}
      </aside>
    );
  }

  return (
    <aside className="flex w-[388px] shrink-0 flex-col border-l border-ink-100 bg-white">
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
