import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";

import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import {
  inputBase,
  selectBase,
  subtleButton,
  iconButton,
} from "@/components/forms/inputs";
import { ExpressionInput } from "@/components/forms/ExpressionInput";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

type Operator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "exists"
  | "empty";

type Joiner = "AND" | "OR";

interface Condition {
  id: string;
  field: string;
  operator: Operator;
  value: string;
  /** How this condition combines with the previous one. Ignored on row 0. */
  joiner?: Joiner;
}

interface RuleBlock {
  id: string;
  /** "if" → first IF block; "elseIf" → middle branches; "else" → catch-all. */
  kind: "if" | "elseIf" | "else";
  /** Optional human label shown next to the handle on the canvas. */
  label?: string;
  conditions: Condition[];
}

const OPERATORS: { value: Operator; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "exists", label: "exists" },
  { value: "empty", label: "is empty" },
];

/* ------------------------------------------------------------------ */
/* Single condition row (shared)                                       */
/* ------------------------------------------------------------------ */

function ConditionRow({
  condition,
  index,
  onChange,
  onRemove,
}: {
  condition: Condition;
  index: number;
  onChange: (patch: Partial<Condition>) => void;
  onRemove: () => void;
}) {
  const opNeedsValue =
    condition.operator !== "exists" && condition.operator !== "empty";

  return (
    <div className="flex flex-col gap-1.5">
      {index > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={condition.joiner ?? "AND"}
            onChange={(e) =>
              onChange({ joiner: e.target.value as Joiner })
            }
            className={`${selectBase} w-20`}
          >
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
          <div className="h-px flex-1 bg-ink-100" />
        </div>
      )}
      <div className="flex items-start gap-1.5">
        <div className="flex-1">
          <ExpressionInput
            value={condition.field}
            onChange={(next) => onChange({ field: next })}
            placeholder="field or {{variable}}"
            hidePreview
          />
        </div>
        <select
          value={condition.operator}
          onChange={(e) =>
            onChange({ operator: e.target.value as Operator })
          }
          className={selectBase}
          style={{ width: 130 }}
        >
          {OPERATORS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {opNeedsValue && (
          <div className="flex-1">
            <ExpressionInput
              value={condition.value}
              onChange={(next) => onChange({ value: next })}
              placeholder="value"
              hidePreview
            />
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          className={`${iconButton} mt-1`}
          aria-label="Remove condition"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flat shape (used by Guardrail rules)                                */
/* ------------------------------------------------------------------ */

function FlatConditionList({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const conditions = useFieldValue<Condition[]>(nodeId, fieldKey) ?? [];
  const set = useFieldSetter(nodeId, fieldKey);

  const update = (id: string, patch: Partial<Condition>) =>
    set(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => set(conditions.filter((c) => c.id !== id));
  const add = () =>
    set([
      ...conditions,
      {
        id: `cnd_${nanoid(6)}`,
        field: "",
        operator: "equals",
        value: "",
        joiner: conditions.length > 0 ? "AND" : undefined,
      },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {conditions.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No conditions.</p>
      )}
      {conditions.map((c, i) => (
        <ConditionRow
          key={c.id}
          condition={c}
          index={i}
          onChange={(patch) => update(c.id, patch)}
          onRemove={() => remove(c.id)}
        />
      ))}
      <button type="button" onClick={add} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add condition
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Block shape (used by Rule node — drives dynamic output handles)     */
/* ------------------------------------------------------------------ */

function RuleBlocks({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const blocks = useFieldValue<RuleBlock[]>(nodeId, fieldKey) ?? [];
  const set = useFieldSetter(nodeId, fieldKey);

  const updateBlock = (id: string, patch: Partial<RuleBlock>) =>
    set(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const removeBlock = (id: string) =>
    set(blocks.filter((b) => b.id !== id));

  const addElseIf = () => {
    // Insert before the trailing else block if present.
    const elseIdx = blocks.findIndex((b) => b.kind === "else");
    const newBlock: RuleBlock = {
      id: `case_${nanoid(6)}`,
      kind: "elseIf",
      label: `case_${blocks.filter((b) => b.kind !== "else").length + 1}`,
      conditions: [],
    };
    if (elseIdx === -1) {
      set([...blocks, newBlock]);
    } else {
      const next = [...blocks];
      next.splice(elseIdx, 0, newBlock);
      set(next);
    }
  };

  const updateConditions = (
    blockId: string,
    next: Condition[]
  ) => updateBlock(blockId, { conditions: next });

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block) => (
        <div
          key={block.id}
          className="rounded-md border border-ink-100 bg-white p-2"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              {block.kind === "if"
                ? "IF"
                : block.kind === "elseIf"
                ? "ELSE IF"
                : "ELSE"}
            </span>
            <input
              value={block.label ?? block.id}
              onChange={(e) => updateBlock(block.id, { label: e.target.value })}
              className={`${inputBase} h-7`}
            />
            {block.kind !== "if" && block.kind !== "else" && (
              <button
                type="button"
                onClick={() => removeBlock(block.id)}
                className={iconButton}
                aria-label="Remove block"
                title="Remove block"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {block.kind === "else" ? (
            <p className="text-[11px] italic text-ink-500">
              Runs when no other branch matches.
            </p>
          ) : (
            <BlockConditions
              conditions={block.conditions}
              onChange={(next) => updateConditions(block.id, next)}
            />
          )}
        </div>
      ))}
      <button type="button" onClick={addElseIf} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add ELSE IF
      </button>
    </div>
  );
}

function BlockConditions({
  conditions,
  onChange,
}: {
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
}) {
  const update = (id: string, patch: Partial<Condition>) =>
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) =>
    onChange(conditions.filter((c) => c.id !== id));
  const add = () =>
    onChange([
      ...conditions,
      {
        id: `cnd_${nanoid(6)}`,
        field: "",
        operator: "equals",
        value: "",
        joiner: conditions.length > 0 ? "AND" : undefined,
      },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {conditions.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No conditions yet.</p>
      )}
      {conditions.map((c, i) => (
        <ConditionRow
          key={c.id}
          condition={c}
          index={i}
          onChange={(patch) => update(c.id, patch)}
          onRemove={() => remove(c.id)}
        />
      ))}
      <button type="button" onClick={add} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add condition
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Public dispatcher                                                   */
/* ------------------------------------------------------------------ */

/**
 * Switches between the rule-block view (with IF / ELSE IF / ELSE branches
 * that drive dynamic output handles on the canvas) and a flat condition
 * list. The shape is selected by `meta.shape` on the FieldSchema.
 */
export function ConditionBuilder({
  nodeId,
  fieldKey,
  meta,
}: {
  nodeId: string;
  fieldKey: string;
  meta?: Record<string, unknown>;
}) {
  const shape = (meta?.shape as "blocks" | "flat" | undefined) ?? "blocks";
  return shape === "flat" ? (
    <FlatConditionList nodeId={nodeId} fieldKey={fieldKey} />
  ) : (
    <RuleBlocks nodeId={nodeId} fieldKey={fieldKey} />
  );
}
