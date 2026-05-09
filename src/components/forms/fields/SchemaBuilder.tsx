import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";

import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import {
  inputBase,
  selectBase,
  subtleButton,
  iconButton,
} from "@/components/forms/inputs";

type SchemaType = "string" | "number" | "boolean" | "array" | "object";

interface SchemaRow {
  id: string;
  name: string;
  type: SchemaType;
  description?: string;
  required?: boolean;
}

const TYPES: SchemaType[] = ["string", "number", "boolean", "array", "object"];

/**
 * Used for Script node input params and output schema. Produces a list of
 * `{ name, type, description, required }`.
 */
export function SchemaBuilder({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const rows = useFieldValue<SchemaRow[]>(nodeId, fieldKey) ?? [];
  const setRows = useFieldSetter(nodeId, fieldKey);

  const update = (id: string, patch: Partial<SchemaRow>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows(rows.filter((r) => r.id !== id));
  const add = () =>
    setRows([
      ...rows,
      { id: `sch_${nanoid(6)}`, name: "", type: "string", required: false },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No fields.</p>
      )}
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-md border border-ink-100 bg-white p-2"
        >
          <div className="flex items-center gap-1.5">
            <input
              value={row.name}
              onChange={(e) => update(row.id, { name: e.target.value })}
              placeholder="field_name"
              className={inputBase}
            />
            <select
              value={row.type}
              onChange={(e) =>
                update(row.id, { type: e.target.value as SchemaType })
              }
              className={selectBase}
              style={{ width: 110 }}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-ink-500">
              <input
                type="checkbox"
                checked={!!row.required}
                onChange={(e) =>
                  update(row.id, { required: e.target.checked })
                }
              />
              required
            </label>
            <button
              type="button"
              onClick={() => remove(row.id)}
              className={iconButton}
              aria-label="Remove field"
            >
              <X size={13} />
            </button>
          </div>
          <input
            value={row.description ?? ""}
            onChange={(e) => update(row.id, { description: e.target.value })}
            placeholder="description (optional)"
            className={`${inputBase} mt-1.5`}
          />
        </div>
      ))}
      <button type="button" onClick={add} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add field
      </button>
    </div>
  );
}
