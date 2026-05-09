import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";

import { useFieldSetter, useFieldValue } from "@/components/forms/useField";
import {
  inputBase,
  subtleButton,
  iconButton,
  selectBase,
} from "@/components/forms/inputs";
import { ExpressionInput } from "@/components/forms/ExpressionInput";

type Role = "system" | "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
}

const ROLE_OPTIONS: Role[] = ["system", "user", "assistant"];

/**
 * List of LLM/Agent messages with role + content. Used by the LLM and Agent
 * node schemas. The data shape is fixed but the field stays generic — any
 * node that wants this UI just declares `type: "message-list"` in its schema.
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
    setMessages(messages.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id: string) =>
    setMessages(messages.filter((m) => m.id !== id));
  const add = () =>
    setMessages([
      ...messages,
      { id: `msg_${nanoid(6)}`, role: "user", content: "" },
    ]);

  return (
    <div className="flex flex-col gap-2">
      {messages.length === 0 && (
        <p className="text-[11px] italic text-ink-500">No messages.</p>
      )}
      {messages.map((m) => (
        <div
          key={m.id}
          className="rounded-md border border-ink-100 bg-white p-2"
        >
          <div className="flex items-center gap-2">
            <select
              value={m.role}
              onChange={(e) =>
                update(m.id, { role: e.target.value as Role })
              }
              className={selectBase}
              style={{ width: 110 }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              value={`message_${m.id.slice(-4)}`}
              readOnly
              className={`${inputBase} bg-canvas text-ink-500`}
            />
            <button
              type="button"
              onClick={() => remove(m.id)}
              className={iconButton}
              aria-label="Remove message"
            >
              <X size={13} />
            </button>
          </div>
          <div className="mt-2">
            <ExpressionInput
              value={m.content}
              onChange={(next) => update(m.id, { content: next })}
              placeholder="Message content. Use {{variable.path}} to reference variables."
              multiline
              rows={2}
            />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className={`${subtleButton} self-start`}>
        <Plus size={12} /> Add Message
      </button>
    </div>
  );
}
