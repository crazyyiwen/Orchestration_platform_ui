import { Plus, Trash2, X } from "lucide-react";
import { nanoid } from "nanoid";

import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import {
  iconButton,
  inputBase,
  selectBase,
  subtleButton,
} from "@/components/forms/inputs";
import { ExpressionInput } from "@/components/forms/ExpressionInput";

type Role = "user" | "assistant" | "system";

interface MessageField {
  id: string;
  label: string;
  /** Stored as a string so `{{system.x}}` / `{{flow.x}}` references work. */
  value: string;
}

interface Message {
  id: string;
  role: Role;
  /** Free-form body used by assistant / system roles. */
  content: string;
  /** Labeled variable bindings used by the user role. Each entry shows
   *  `Label: <value-with-variable-chips>` and is referenced by templating
   *  conventions at runtime. */
  fields: MessageField[];
}

const ROLE_OPTIONS: Role[] = ["system", "user", "assistant"];

/**
 * Messages list with role-aware bodies.
 *
 *  - `user` messages render a labeled-fields editor (matches the
 *    "User Query / Conversation so far / Item Name" pattern in the spec).
 *    Each row is `[label input] [ExpressionInput with variable picker]`,
 *    and a "+ Add input" button at the bottom appends a new row.
 *
 *  - `assistant` / `system` messages render the original multi-line
 *    ExpressionInput so they stay free-form (place for prompts, example
 *    responses, etc.).
 *
 * Older saved data without `fields` is tolerated — it's coerced to `[]`
 * on read so the editor doesn't blow up iterating undefined.
 */
export function MessageListField({
  nodeId,
  fieldKey,
}: {
  nodeId: string;
  fieldKey: string;
}) {
  const messages = useFieldValue<Message[]>(nodeId, fieldKey) ?? [];
  const setMessages = useFieldSetter(nodeId, fieldKey);

  const update = (id: string, patch: Partial<Message>) =>
    setMessages(
      messages.map((m) => {
        if (m.id !== id) return m;
        const next: Message = { ...m, ...patch };
        // Tolerate older entries that lack `fields`.
        if (!Array.isArray(next.fields)) next.fields = [];
        return next;
      })
    );
  const remove = (id: string) =>
    setMessages(messages.filter((m) => m.id !== id));
  const add = () =>
    setMessages([
      ...messages,
      {
        id: `msg_${nanoid(6)}`,
        role: "user",
        content: "",
        fields: [],
      },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {messages.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No messages.</p>
      )}
      {messages.map((m) => (
        <MessageCard
          key={m.id}
          message={m}
          onUpdate={(patch) => update(m.id, patch)}
          onRemove={() => remove(m.id)}
        />
      ))}
      <button type="button" onClick={add} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add Message
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-message card                                                    */
/* ------------------------------------------------------------------ */

function MessageCard({
  message,
  onUpdate,
  onRemove,
}: {
  message: Message;
  onUpdate: (patch: Partial<Message>) => void;
  onRemove: () => void;
}) {
  const fields = Array.isArray(message.fields) ? message.fields : [];
  const isUserRole = message.role === "user";

  return (
    <div className="rounded-md border border-ink-100 bg-white">
      <div className="flex items-center gap-2 border-b border-ink-100 px-2 py-1.5">
        <select
          value={message.role}
          onChange={(e) => onUpdate({ role: e.target.value as Role })}
          className={`${selectBase} h-6 w-28`}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className={`${iconButton} ml-auto`}
          aria-label="Remove message"
          title="Remove message"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="p-2">
        {isUserRole ? (
          <UserFieldsEditor
            fields={fields}
            onChange={(next) => onUpdate({ fields: next })}
          />
        ) : (
          <ExpressionInput
            value={message.content}
            onChange={(v) => onUpdate({ content: v })}
            placeholder="Message content. Use the {x} button to insert variables."
            multiline
            rows={3}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fields editor (user role)                                           */
/* ------------------------------------------------------------------ */

function UserFieldsEditor({
  fields,
  onChange,
}: {
  fields: MessageField[];
  onChange: (next: MessageField[]) => void;
}) {
  const update = (id: string, patch: Partial<MessageField>) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id));
  const add = () =>
    onChange([
      ...fields,
      { id: `inp_${nanoid(6)}`, label: "", value: "" },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {fields.length === 0 && (
        <p className="text-[11px] italic text-ink-500">
          No inputs yet — add a labeled binding below.
        </p>
      )}
      {fields.map((f) => (
        <div key={f.id} className="flex items-start gap-1.5">
          <input
            value={f.label}
            onChange={(e) => update(f.id, { label: e.target.value })}
            placeholder="Label"
            className={`${inputBase} h-7 w-32 shrink-0`}
            spellCheck={false}
          />
          <div className="min-w-0 flex-1">
            <ExpressionInput
              value={f.value}
              onChange={(v) => update(f.id, { value: v })}
              placeholder="{{system.userQuery}}"
              monospace
              hidePreview={false}
            />
          </div>
          <button
            type="button"
            onClick={() => remove(f.id)}
            className={`${iconButton} mt-0.5`}
            aria-label="Remove input"
            title="Remove input"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className={`${subtleButton} self-start`}
      >
        <Plus size={11} /> Add input
      </button>
    </div>
  );
}
