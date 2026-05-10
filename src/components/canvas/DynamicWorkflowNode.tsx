import { memo } from "react";
import clsx from "clsx";
import { CornerDownRight } from "lucide-react";
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
 *  - The card has at most one input handle on the left edge of the header.
 *  - "Header outputs" pin to the right edge of the header (compact card).
 *  - "Row outputs" render below the header, one per row, each with its own
 *    handle. Rule branches and Agent handoffs become row outputs; Approval
 *    (approved/rejected) and Guardrail (allow/block) also use rows because
 *    they carry more than one branch from the registry.
 *
 *  Example combinations:
 *   - LLM:                      header out
 *   - Approval:                 row outputs (approved, rejected)
 *   - Rule (3 blocks):          row outputs (case_1, case_2, else)
 *   - Agent (no handoffs):      header out
 *   - Agent (2 handoffs):       header out + 2 handoff rows below
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
  const { headerOutputs, rowOutputs } = splitOutputs(def.type, data);
  const sublabel = pickSublabel(data);

  const multiInput = inputHandles.length > 1;

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
        {headerOutputs.map((h) => (
          <Handle
            key={`out-${h.id}`}
            id={h.id}
            type="source"
            position={Position.Right}
          />
        ))}
      </div>

      {/* Row outputs: rule branches, agent handoffs, multi-output gates. */}
      {rowOutputs.length > 0 && (
        <ul className="border-t border-ink-100 py-1">
          {rowOutputs.map((h) => {
            const isHandoff = h.kind === "handoff";
            return (
              <li
                key={`out-row-${h.id}`}
                className={clsx(
                  "relative flex items-center justify-end gap-1.5 py-1.5 pl-3 pr-4 text-[11px]",
                  isHandoff ? "text-orange-700" : "text-ink-700"
                )}
              >
                {isHandoff && (
                  <CornerDownRight
                    size={11}
                    className="shrink-0 text-orange-500"
                  />
                )}
                <span
                  className={clsx(
                    "truncate text-right",
                    isHandoff && "font-medium"
                  )}
                  title={h.label ?? h.id}
                >
                  {h.label ?? h.id}
                </span>
                <Handle id={h.id} type="source" position={Position.Right} />
              </li>
            );
          })}
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

interface OutputLayout {
  headerOutputs: HandleSpec[];
  rowOutputs: HandleSpec[];
}

/** Decide which output handles render in the header vs as rows below. */
function splitOutputs(type: string, data: WorkflowNodeData): OutputLayout {
  const def = nodeRegistry[type];
  const standard: HandleSpec[] = def?.handles.outputs ?? [];
  const dynamic = computeDynamicOutputs(type, data);

  if (dynamic.length === 0) {
    if (standard.length <= 1) {
      // 0 or 1 standard outputs → header.
      return { headerOutputs: standard, rowOutputs: [] };
    }
    // 2+ standard outputs (Approval, Guardrail) → rows.
    return { headerOutputs: [], rowOutputs: standard };
  }

  // Has dynamic outputs (rule blocks, agent handoffs).
  if (standard.length === 1) {
    // Default 'out' stays in header, dynamic outputs become rows below.
    return { headerOutputs: standard, rowOutputs: dynamic };
  }
  // No fixed default — dynamic + any standard all become rows.
  return { headerOutputs: [], rowOutputs: [...standard, ...dynamic] };
}

/** Per-type runtime-derived output handles. */
function computeDynamicOutputs(
  type: string,
  data: WorkflowNodeData
): HandleSpec[] {
  const cfg = data.config as Record<string, unknown> | undefined;

  if (type === "rule") {
    const blocks = (cfg?.blocks as
      | Array<{ id: string; label?: string }>
      | undefined) ?? [];
    return blocks.map((b) => ({
      id: b.id,
      label: b.label ?? b.id,
      kind: "branch",
    }));
  }

  if (type === "agent") {
    const handoffs = (cfg?.handoffs as
      | Array<{ id: string; name?: string }>
      | undefined) ?? [];
    return handoffs.map((h) => ({
      id: h.id,
      label: h.name?.trim() ? h.name : "handoff",
      kind: "handoff",
    }));
  }

  return [];
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
