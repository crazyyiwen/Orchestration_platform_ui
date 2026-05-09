import { memo } from "react";
import clsx from "clsx";
import { Handle, Position, type NodeProps } from "reactflow";

import { nodeRegistry } from "@/workflow/nodeRegistry";
import type { HandleSpec, WorkflowNodeData } from "@/workflow/types";
import { Icon } from "@/components/ui/Icon";
import { ICON_BG_LARGE } from "@/components/ui/colorTokens";

/**
 * The *only* React Flow node type registered in the canvas. Every node on
 * screen — LLM, Agent, Rule, Output, etc. — renders through this component.
 *
 * Layout strategy:
 *  - With ≤1 input/output handles: handles pin to the header row's left/right
 *    edge (the classic compact card).
 *  - With >1 handles on a side: the card grows by rendering one row per
 *    branch, each row hosting its own handle. The handle pins to its row
 *    via React Flow's default `right:0; top:50%` CSS, since each row is the
 *    nearest positioned ancestor. This is what makes Rule / Approval /
 *    Guardrail nodes resize cleanly as branches are added.
 */
function DynamicWorkflowNodeBase({
  data,
  selected,
}: NodeProps<WorkflowNodeData>) {
  const def = nodeRegistry[data.type];

  if (!def) {
    return (
      <div className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs text-rose-700 shadow-node">
        Unknown node type: {data.type}
      </div>
    );
  }

  const inputHandles: HandleSpec[] = def.handles.inputs;
  const outputHandles: HandleSpec[] = computeOutputHandles(def.type, data);
  const sublabel = pickSublabel(data);

  const multiInput = inputHandles.length > 1;
  const multiOutput = outputHandles.length > 1;

  return (
    <div
      className={clsx(
        "relative w-[224px] rounded-xl border bg-white shadow-node transition-all duration-150",
        selected
          ? "border-brand-500 shadow-nodeSelected"
          : "border-ink-100 hover:-translate-y-px hover:border-ink-300 hover:shadow-md"
      )}
    >
      {/* Header row. Hosts the single-input / single-output handles. */}
      <div className="relative flex items-center gap-3 px-3 py-3">
        <span
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            ICON_BG_LARGE[def.color]
          )}
        >
          <Icon name={def.icon} size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight text-ink-900">
            {data.name || def.label}
          </div>
          {sublabel && (
            <div className="truncate text-[11px] text-ink-500">{sublabel}</div>
          )}
        </div>

        {!multiInput &&
          inputHandles.map((h) => (
            <Handle
              key={`in-${h.id}`}
              id={h.id}
              type="target"
              position={Position.Left}
            />
          ))}
        {!multiOutput &&
          outputHandles.map((h) => (
            <Handle
              key={`out-${h.id}`}
              id={h.id}
              type="source"
              position={Position.Right}
            />
          ))}
      </div>

      {/* Multi-output: one row per branch. Card grows with the list. */}
      {multiOutput && (
        <ul className="border-t border-ink-100 py-1">
          {outputHandles.map((h) => (
            <li
              key={`out-row-${h.id}`}
              className="relative flex items-center justify-end gap-2 py-1.5 pl-3 pr-4 text-[11px] text-ink-700"
            >
              <span className="truncate text-right" title={h.label ?? h.id}>
                {h.label ?? h.id}
              </span>
              <Handle id={h.id} type="source" position={Position.Right} />
            </li>
          ))}
        </ul>
      )}

      {/* Multi-input mirrors the same pattern on the left. */}
      {multiInput && (
        <ul className="border-t border-ink-100 py-1">
          {inputHandles.map((h) => (
            <li
              key={`in-row-${h.id}`}
              className="relative flex items-center gap-2 py-1.5 pl-4 pr-3 text-[11px] text-ink-700"
            >
              <Handle id={h.id} type="target" position={Position.Left} />
              <span className="truncate" title={h.label ?? h.id}>
                {h.label ?? h.id}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Compute output handles. Rule nodes generate one per block. */
function computeOutputHandles(
  type: string,
  data: WorkflowNodeData
): HandleSpec[] {
  if (type === "rule") {
    const blocks = (data.config?.blocks as Array<{
      id: string;
      label?: string;
    }> | undefined) ?? [];
    if (blocks.length > 0) {
      return blocks.map((b) => ({ id: b.id, label: b.label ?? b.id }));
    }
  }
  return nodeRegistry[type]?.handles.outputs ?? [];
}

function pickSublabel(data: WorkflowNodeData): string | null {
  const cfg = data.config as Record<string, unknown> | undefined;
  if (!cfg) return null;
  if (typeof cfg.model === "string" && cfg.model) return cfg.model;
  if (typeof cfg.url === "string" && cfg.url) return cfg.url;
  if (typeof cfg.method === "string" && cfg.method) return String(cfg.method);
  return null;
}

export const DynamicWorkflowNode = memo(DynamicWorkflowNodeBase);
