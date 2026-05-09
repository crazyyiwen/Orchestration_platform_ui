import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";

import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import { inputBase, subtleButton, iconButton } from "@/components/forms/inputs";

interface Row {
  id: string;
  key: string;
  value: string;
}

/** Used for HTTP headers, query params, etc. — flat list of {key, value}. */
export function KeyValueListField({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const rows = useFieldValue<Row[]>(nodeId, fieldKey) ?? [];
  const setRows = useFieldSetter(nodeId, fieldKey);

  const update = (id: string, patch: Partial<Row>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows(rows.filter((r) => r.id !== id));
  const add = () =>
    setRows([...rows, { id: `kv_${nanoid(6)}`, key: "", value: "" }]);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No entries.</p>
      )}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <input
            value={row.key}
            placeholder="key"
            onChange={(e) => update(row.id, { key: e.target.value })}
            className={inputBase}
          />
          <input
            value={row.value}
            placeholder="value"
            onChange={(e) => update(row.id, { value: e.target.value })}
            className={inputBase}
          />
          <button
            type="button"
            onClick={() => remove(row.id)}
            className={iconButton}
            aria-label="Remove entry"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className={`${subtleButton} mt-1 self-start`}>
        <Plus size={12} /> Add entry
      </button>
    </div>
  );
}
