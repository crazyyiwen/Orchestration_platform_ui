import { useState } from "react";
import clsx from "clsx";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";

import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import { ExpressionInput } from "@/components/forms/ExpressionInput";
import {
  codeBase,
  iconButton,
  inputBase,
  selectBase,
  subtleButton,
} from "@/components/forms/inputs";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ParamType = "string" | "number" | "boolean" | "object" | "array";

interface TypedParam {
  id: string;
  name: string;
  type: ParamType;
  description?: string;
  required?: boolean;
  /** Primitive value (string/number/boolean) — stored as a string so
   *  variable references like `{{flow.x}}` work. For object/array params
   *  WITHOUT nested `fields`, this holds the raw JSON typed by the user. */
  value?: string;
  /** Nested fields. Present only on object params that the user has
   *  decomposed into structured sub-params via the schema editor. */
  fields?: TypedParam[];
}

const TYPE_OPTIONS: ParamType[] = ["string", "number", "boolean", "object", "array"];

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

function patchById(
  fields: TypedParam[],
  id: string,
  patch: Partial<TypedParam>
): TypedParam[] {
  return fields.map((f) => {
    if (f.id === id) {
      const next: TypedParam = { ...f, ...patch };
      // Clear nested fields when the type changes away from object — they
      // wouldn't make sense on a primitive or array param.
      if (patch.type && patch.type !== "object" && next.fields) {
        delete next.fields;
      }
      return next;
    }
    if (f.fields) return { ...f, fields: patchById(f.fields, id, patch) };
    return f;
  });
}

function removeById(fields: TypedParam[], id: string): TypedParam[] {
  return fields
    .filter((f) => f.id !== id)
    .map((f) =>
      f.fields ? { ...f, fields: removeById(f.fields, id) } : f
    );
}

function addUnder(
  fields: TypedParam[],
  parentId: string | null,
  newField: TypedParam
): TypedParam[] {
  if (parentId === null) return [...fields, newField];
  return fields.map((f) => {
    if (f.id === parentId) {
      return { ...f, fields: [...(f.fields ?? []), newField] };
    }
    if (f.fields) {
      return { ...f, fields: addUnder(f.fields, parentId, newField) };
    }
    return f;
  });
}

function makeNewParam(siblingCount: number): TypedParam {
  return {
    id: `param_${nanoid(6)}`,
    name: `param_${siblingCount + 1}`,
    type: "string",
    description: "",
    required: false,
    value: "",
  };
}

/* ------------------------------------------------------------------ */
/* Top-level field                                                     */
/* ------------------------------------------------------------------ */

/**
 * Typed parameter list — supports nested object types.
 *
 * Two modes toggled by the "Edit params" / "Done" button at the top right:
 *
 *  - **Values** (default): the schema is locked. Each declared param
 *    renders a value editor that adapts to its type:
 *      - primitives → ExpressionInput (literal or `{{variable}}`)
 *      - object WITH `fields` → nested cards recursing into the same
 *        renderer
 *      - object WITHOUT `fields` / array → JSON code editor (free-form,
 *        same as the screenshot's `data` example)
 *
 *  - **Schema**: rows for editing param metadata — name, type, required,
 *    description, and per-object "+ Add field" / trash. Adding a field
 *    under an object recurses the same row component.
 *
 * Storage shape under the bound dot-path is `TypedParam[]`. Object-typed
 * params with `fields` ignore their primitive `value` (the runtime
 * composes the object from the nested fields' values); object-typed
 * params without `fields` use `value` as raw JSON.
 */
export function TypedParamsField({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const params = useFieldValue<TypedParam[]>(nodeId, fieldKey) ?? [];
  const setParams = useFieldSetter(nodeId, fieldKey);

  const [editingSchema, setEditingSchema] = useState(false);

  const onPatch = (id: string, patch: Partial<TypedParam>) =>
    setParams(patchById(params, id, patch));

  const onRemove = (id: string) => setParams(removeById(params, id));

  const onAdd = (parentId: string | null) => {
    // Count siblings to pick a unique-ish default name.
    const siblings =
      parentId === null
        ? params
        : findFieldById(params, parentId)?.fields ?? [];
    setParams(addUnder(params, parentId, makeNewParam(siblings.length)));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-ink-500">
          {editingSchema
            ? "Add, remove, or modify parameters."
            : "Configure parameter values."}
        </p>
        <button
          type="button"
          onClick={() => setEditingSchema((v) => !v)}
          className={clsx(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            editingSchema
              ? "bg-brand-500 text-white hover:bg-brand-600"
              : "border border-ink-100 text-ink-700 hover:bg-ink-100/60"
          )}
        >
          <Pencil size={11} />
          {editingSchema ? "Configure values" : "Edit params"}
        </button>
      </div>

      {editingSchema ? (
        <SchemaView
          fields={params}
          onPatch={onPatch}
          onRemove={onRemove}
          onAdd={onAdd}
        />
      ) : (
        <ValuesView
          fields={params}
          onPatch={onPatch}
          onAdd={() => onAdd(null)}
        />
      )}
    </div>
  );
}

function findFieldById(
  fields: TypedParam[],
  id: string
): TypedParam | null {
  for (const f of fields) {
    if (f.id === id) return f;
    if (f.fields) {
      const found = findFieldById(f.fields, id);
      if (found) return found;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Values view                                                         */
/* ------------------------------------------------------------------ */

function ValuesView({
  fields,
  onPatch,
  onAdd,
}: {
  fields: TypedParam[];
  onPatch: (id: string, patch: Partial<TypedParam>) => void;
  onAdd: () => void;
}) {
  if (fields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-ink-300 bg-canvas px-3 py-4 text-center text-[11px] text-ink-500">
        No parameters defined.{" "}
        <button
          type="button"
          onClick={onAdd}
          className="font-medium text-brand-600 hover:underline"
        >
          Add the first one
        </button>{" "}
        to bind values to variables or other nodes.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {fields.map((p) => (
        <ValueCard key={p.id} field={p} onPatch={onPatch} />
      ))}
    </div>
  );
}

function ValueCard({
  field,
  onPatch,
}: {
  field: TypedParam;
  onPatch: (id: string, patch: Partial<TypedParam>) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isObjectWithFields = field.type === "object" && field.fields && field.fields.length > 0;
  const isObjectRaw = field.type === "object" && !isObjectWithFields;
  const isArray = field.type === "array";

  return (
    <div className="rounded-md border border-ink-100 bg-white p-2.5">
      <div className="flex items-center gap-1.5">
        {field.type === "object" && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-5 w-5 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        <span className="truncate text-[12px] font-semibold text-ink-900">
          {field.name || "(unnamed)"}
        </span>
        {field.required && (
          <span className="text-rose-500" aria-label="required">
            *
          </span>
        )}
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-medium text-ink-700">
          {field.type}
        </span>
      </div>
      {field.description && (
        <p className="mt-0.5 text-[11px] text-ink-500">{field.description}</p>
      )}
      {!collapsed && (
        <div className="mt-1.5">
          {isObjectWithFields ? (
            <div className="flex flex-col gap-2 border-l-2 border-ink-100 pl-3">
              {field.fields!.map((child) => (
                <ValueCard key={child.id} field={child} onPatch={onPatch} />
              ))}
            </div>
          ) : isObjectRaw || isArray ? (
            <textarea
              value={field.value ?? ""}
              onChange={(e) => onPatch(field.id, { value: e.target.value })}
              rows={4}
              spellCheck={false}
              placeholder={isArray ? "[]" : "{}"}
              className={codeBase}
            />
          ) : (
            <ExpressionInput
              value={field.value ?? ""}
              onChange={(v) => onPatch(field.id, { value: v })}
              placeholder="Enter value or use {{variable}}"
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schema view                                                         */
/* ------------------------------------------------------------------ */

function SchemaView({
  fields,
  onPatch,
  onRemove,
  onAdd,
}: {
  fields: TypedParam[];
  onPatch: (id: string, patch: Partial<TypedParam>) => void;
  onRemove: (id: string) => void;
  onAdd: (parentId: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {fields.length === 0 && (
        <p className="text-[11px] italic text-ink-500">
          No parameters yet — add one below.
        </p>
      )}
      {fields.map((p) => (
        <SchemaRow
          key={p.id}
          field={p}
          onPatch={onPatch}
          onRemove={onRemove}
          onAdd={onAdd}
        />
      ))}
      <button
        type="button"
        onClick={() => onAdd(null)}
        className={`${subtleButton} self-start`}
      >
        <Plus size={12} /> Add Field
      </button>
    </div>
  );
}

function SchemaRow({
  field,
  onPatch,
  onRemove,
  onAdd,
}: {
  field: TypedParam;
  onPatch: (id: string, patch: Partial<TypedParam>) => void;
  onRemove: (id: string) => void;
  onAdd: (parentId: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const showNested = field.type === "object";
  const nested = field.fields ?? [];

  // Row 1: chevron + name (full remaining width) + delete.
  // Row 2: type select + required toggle.
  // Row 3: description.
  // Splitting into three rows guarantees the name input stays usable even
  // when the row is rendered several levels deep inside a narrow panel.
  return (
    <div className="rounded-md border border-ink-100 bg-white p-2">
      <div className="flex items-center gap-1.5">
        {showNested && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        <input
          value={field.name}
          onChange={(e) =>
            onPatch(field.id, { name: e.target.value.replace(/\s+/g, "_") })
          }
          placeholder="param_name"
          className={`${inputBase} h-7 min-w-0 flex-1 font-mono`}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => onRemove(field.id)}
          className={`${iconButton} shrink-0`}
          aria-label="Remove field"
          title="Remove field"
        >
          <X size={13} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <select
          value={field.type}
          onChange={(e) =>
            onPatch(field.id, { type: e.target.value as ParamType })
          }
          className={`${selectBase} h-7 w-28 shrink-0`}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-ink-500">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) =>
              onPatch(field.id, { required: e.target.checked })
            }
          />
          required
        </label>
      </div>
      <input
        value={field.description ?? ""}
        onChange={(e) => onPatch(field.id, { description: e.target.value })}
        placeholder="Description (optional)"
        className={`${inputBase} mt-1.5 h-7`}
      />
      {showNested && !collapsed && (
        <div className="mt-2 flex flex-col gap-1.5 border-l-2 border-ink-100 pl-3">
          {nested.length === 0 && (
            <p className="text-[10px] italic text-ink-500">
              No nested fields yet — add one to define a structured shape.
            </p>
          )}
          {nested.map((child) => (
            <SchemaRow
              key={child.id}
              field={child}
              onPatch={onPatch}
              onRemove={onRemove}
              onAdd={onAdd}
            />
          ))}
          <button
            type="button"
            onClick={() => onAdd(field.id)}
            className={`${subtleButton} self-start`}
          >
            <Plus size={11} /> Add field
          </button>
        </div>
      )}
    </div>
  );
}
