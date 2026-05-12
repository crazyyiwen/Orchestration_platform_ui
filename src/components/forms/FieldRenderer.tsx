/**
 * Single dispatcher for every `FieldSchema.type`. Adding a new field type:
 *   1. Append to `FieldType` in workflow/types.ts.
 *   2. Add a case below.
 *
 * The simple primitive controls (text/textarea/select/etc.) live inline
 * because each is a handful of lines. Complex controls (lists, builders)
 * are imported from `./fields/*`.
 */

import { Plus, X } from "lucide-react";

import type { FieldOption, FieldSchema } from "@/workflow/types";
import { resolveOptionsSource } from "@/workflow/optionSources";
import { useFieldSetter, useFieldValue } from "./useField";
import {
  inputBase,
  codeBase,
  selectBase,
  chipBase,
  subtleButton,
  iconButton,
} from "./inputs";
import { ExpressionInput } from "./ExpressionInput";

import { KeyValueListField } from "./fields/KeyValueListField";
import { MessageListField } from "./fields/MessageListField";
import { MappingListField } from "./fields/MappingListField";
import { SchemaBuilder } from "./fields/SchemaBuilder";
import { ConditionBuilder } from "./fields/ConditionBuilder";
import { AccordionField } from "./fields/AccordionField";
import { ScriptRunner } from "./fields/ScriptRunner";
import { HandoffListField } from "./fields/HandoffListField";
import { UiViewPreview } from "./fields/UiViewPreview";

/* ------------------------------------------------------------------ */
/* Field frame: label + body                                           */
/* ------------------------------------------------------------------ */

export function FieldRenderer({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  // Layout-only field types render their own frame.
  if (field.type === "accordion-section") {
    return (
      <AccordionField nodeId={nodeId} field={field} />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-ink-700">
          {field.label}
          {field.required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      </div>
      {field.description && (
        <p className="text-[11px] text-ink-500">{field.description}</p>
      )}
      <FieldBody nodeId={nodeId} field={field} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

function FieldBody({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  switch (field.type) {
    case "text":
      return <TextField nodeId={nodeId} field={field} />;
    case "textarea":
      return <TextareaField nodeId={nodeId} field={field} />;
    case "number":
      return <NumberField nodeId={nodeId} field={field} />;
    case "switch":
      return <SwitchField nodeId={nodeId} field={field} />;
    case "select":
      return <SelectField nodeId={nodeId} field={field} />;
    case "multi-select":
      return <MultiSelectField nodeId={nodeId} field={field} />;
    case "code":
      return <CodeField nodeId={nodeId} field={field} />;
    case "json":
      return <JsonField nodeId={nodeId} field={field} />;
    case "variable-reference":
      return <VariableReferenceField nodeId={nodeId} field={field} />;
    case "variable-reference-list":
      return <VariableReferenceListField nodeId={nodeId} field={field} />;
    case "key-value-list":
      return <KeyValueListField nodeId={nodeId} fieldKey={field.key} />;
    case "message-list":
      return <MessageListField nodeId={nodeId} fieldKey={field.key} />;
    case "mapping-list":
      return (
        <MappingListField
          nodeId={nodeId}
          fieldKey={field.key}
          meta={field.meta}
        />
      );
    case "schema-builder":
      return <SchemaBuilder nodeId={nodeId} fieldKey={field.key} />;
    case "condition-builder":
      return (
        <ConditionBuilder
          nodeId={nodeId}
          fieldKey={field.key}
          meta={field.meta}
        />
      );
    case "script-runner":
      return <ScriptRunner nodeId={nodeId} field={field} />;
    case "handoff-list":
      return <HandoffListField nodeId={nodeId} fieldKey={field.key} />;
    case "ui-view-preview":
      return <UiViewPreview nodeId={nodeId} />;
    case "accordion-section":
      // Handled in `FieldRenderer`, never reached.
      return null;
    default: {
      const _exhaustive: never = field.type;
      void _exhaustive;
      return (
        <div className="rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
          Unknown field type: {String(field.type)}
        </div>
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Simple field components                                             */
/* ------------------------------------------------------------------ */

function TextField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const value = useFieldValue<string>(nodeId, field.key) ?? "";
  const set = useFieldSetter(nodeId, field.key);
  return (
    <ExpressionInput
      value={value}
      onChange={set}
      placeholder={field.placeholder}
    />
  );
}

function TextareaField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const value = useFieldValue<string>(nodeId, field.key) ?? "";
  const set = useFieldSetter(nodeId, field.key);
  const rows = (field.meta?.rows as number | undefined) ?? 3;
  return (
    <ExpressionInput
      value={value}
      onChange={set}
      placeholder={field.placeholder}
      multiline
      rows={rows}
    />
  );
}

function NumberField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const value = useFieldValue<number>(nodeId, field.key);
  const set = useFieldSetter(nodeId, field.key);
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) =>
        set(e.target.value === "" ? null : Number(e.target.value))
      }
      placeholder={field.placeholder}
      className={inputBase}
    />
  );
}

function SwitchField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const value =
    useFieldValue<boolean>(nodeId, field.key) ??
    (field.defaultValue as boolean | undefined) ??
    false;
  const set = useFieldSetter(nodeId, field.key);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => set(!value)}
      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
        value ? "bg-brand-500" : "bg-ink-100"
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          value ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function getOptions(field: FieldSchema): FieldOption[] {
  if (field.options && field.options.length > 0) return field.options;
  if (field.optionsSource) return resolveOptionsSource(field.optionsSource);
  return [];
}

function SelectField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const value =
    useFieldValue<string>(nodeId, field.key) ??
    (field.defaultValue as string | undefined) ??
    "";
  const set = useFieldSetter(nodeId, field.key);
  const options = getOptions(field);
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        className={selectBase}
      >
        <option value="" disabled>
          {field.placeholder ?? "Select…"}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiSelectField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const selected = useFieldValue<string[]>(nodeId, field.key) ?? [];
  const set = useFieldSetter(nodeId, field.key);
  const options = getOptions(field);
  const remaining = options.filter((o) => !selected.includes(o.value));

  const add = (val: string) => set([...selected, val]);
  const remove = (val: string) => set(selected.filter((v) => v !== val));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 && (
          <span className="text-[11px] italic text-ink-500">None selected.</span>
        )}
        {selected.map((val) => {
          const opt = options.find((o) => o.value === val);
          return (
            <span key={val} className={chipBase}>
              {opt?.label ?? val}
              <button
                type="button"
                onClick={() => remove(val)}
                className="ml-0.5 text-blue-700/70 hover:text-blue-900"
                aria-label={`Remove ${val}`}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
      </div>
      {remaining.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              add(e.target.value);
              e.currentTarget.value = "";
            }
          }}
          className={selectBase}
        >
          <option value="">{`Add ${field.label.toLowerCase()}…`}</option>
          {remaining.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CodeField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const value = useFieldValue<string>(nodeId, field.key) ?? "";
  const set = useFieldSetter(nodeId, field.key);
  const language = (field.meta?.language as string | undefined) ?? "text";
  const rows = (field.meta?.rows as number | undefined) ?? 8;
  return (
    <div className="overflow-hidden rounded-md border border-ink-100 bg-canvas">
      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-100/40 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-500">
        <span>{language}</span>
        <span className="text-[10px] text-ink-500">demo editor</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        rows={rows}
        spellCheck={false}
        className={`${codeBase} border-0 focus:border-0`}
      />
    </div>
  );
}

function JsonField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  // We store the raw text so partial edits don't blow up. The store sees
  // a string; downstream serialization can JSON.parse when needed.
  const raw = useFieldValue<string>(nodeId, field.key) ?? "";
  const set = useFieldSetter(nodeId, field.key);
  const ok = isValidJson(raw);
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={raw}
        onChange={(e) => set(e.target.value)}
        rows={(field.meta?.rows as number | undefined) ?? 6}
        spellCheck={false}
        className={codeBase}
      />
      {!ok && raw.trim() !== "" && (
        <span className="text-[11px] text-rose-600">Invalid JSON.</span>
      )}
    </div>
  );
}

function isValidJson(s: string): boolean {
  if (s.trim() === "") return true;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Variable reference fields                                           */
/* ------------------------------------------------------------------ */

function VariableReferenceField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const value = useFieldValue<string>(nodeId, field.key) ?? "";
  const set = useFieldSetter(nodeId, field.key);
  return (
    <ExpressionInput
      value={value}
      onChange={set}
      placeholder={field.placeholder ?? "{{system.userQuery}}"}
      monospace
    />
  );
}

function VariableReferenceListField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const list = useFieldValue<string[]>(nodeId, field.key) ?? [];
  const set = useFieldSetter(nodeId, field.key);

  const update = (i: number, v: string) =>
    set(list.map((x, idx) => (idx === i ? v : x)));
  const remove = (i: number) => set(list.filter((_, idx) => idx !== i));
  const add = () => set([...list, ""]);

  return (
    <div className="flex flex-col gap-1.5">
      {list.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No references.</p>
      )}
      {list.map((v, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="flex-1">
            <ExpressionInput
              value={v}
              onChange={(next) => update(i, next)}
              placeholder="{{system.userQuery}}"
              monospace
              hidePreview
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className={`${iconButton} mt-1`}
            aria-label="Remove reference"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add reference
      </button>
    </div>
  );
}
