import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";

import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import {
  selectBase,
  subtleButton,
  iconButton,
} from "@/components/forms/inputs";
import { ExpressionInput } from "@/components/forms/ExpressionInput";

type ValueType = "string" | "number" | "boolean" | "array" | "object";

interface MappingRow {
  id: string;
  key: string;
  type: ValueType;
  value: string;
  /** When set by the operating registry (e.g. variable-update), the
   *  semantics row gets an extra "operation" column. */
  operation?: "set" | "append" | "merge" | "increment" | "remove";
}

const TYPE_OPTIONS: ValueType[] = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
];

const OPERATION_OPTIONS: NonNullable<MappingRow["operation"]>[] = [
  "set",
  "append",
  "merge",
  "increment",
  "remove",
];

/**
 * Generic mapping list. Used for output mapping, sub-flow inputs, variable
 * updates (with `meta.withOperation`), etc. Each row stores a key, a value
 * (which may be a variable reference like `{{system.userQuery}}`), and a
 * type tag.
 */
export function MappingListField({
  nodeId,
  fieldKey,
  meta,
}: {
  nodeId: string;
  fieldKey: string;
  meta?: Record<string, unknown>;
}) {
  const rows = useFieldValue<MappingRow[]>(nodeId, fieldKey) ?? [];
  const setRows = useFieldSetter(nodeId, fieldKey);

  const withOperation = Boolean(meta?.withOperation);

  const update = (id: string, patch: Partial<MappingRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows(rows.filter((r) => r.id !== id));
  const add = () =>
    setRows([
      ...rows,
      {
        id: `map_${nanoid(6)}`,
        key: "",
        type: "string",
        value: "",
        ...(withOperation ? { operation: "set" } : {}),
      },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No mappings.</p>
      )}
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-md border border-ink-100 bg-white p-2"
        >
          {/* Source value (read FROM) on top — supports {{variable}}. */}
          <ExpressionInput
            value={row.value}
            onChange={(next) => update(row.id, { value: next })}
            placeholder="value or {{variable.path}}"
            hidePreview
          />
          {/* Target path (write TO) on the bottom, alongside the per-row
              operation / type / delete controls. `asPath` makes picking from
              the variable picker insert just `flow.foo` (no `{{}}`), matching
              what `setByPath` consumes. */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <ExpressionInput
                value={row.key}
                onChange={(v) => update(row.id, { key: v })}
                placeholder="target path (e.g. flow.foo)"
                asPath
                hidePreview
              />
            </div>
            {withOperation && (
              <select
                value={row.operation ?? "set"}
                onChange={(e) =>
                  update(row.id, {
                    operation: e.target.value as MappingRow["operation"],
                  })
                }
                className={selectBase}
                style={{ width: 110 }}
              >
                {OPERATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            <select
              value={row.type}
              onChange={(e) =>
                update(row.id, { type: e.target.value as ValueType })
              }
              className={selectBase}
              style={{ width: 100 }}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(row.id)}
              className={iconButton}
              aria-label="Remove mapping"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add mapping
      </button>
    </div>
  );
}
