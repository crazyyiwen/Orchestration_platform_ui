import { useRef, useState } from "react";
import { Braces } from "lucide-react";
import clsx from "clsx";

import { useWorkflowStore } from "@/store/workflowStore";
import { VariableChipsPreview } from "./VariableChip";
import { VariablePicker } from "./VariablePicker";

interface ExpressionInputProps {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  monospace?: boolean;
  /** Hide chips preview below the input (for compact list rows). */
  hidePreview?: boolean;
  /** Override the height of the inline `<input>` variant. */
  className?: string;
}

/**
 * Text/textarea input that supports inserting variable references via a
 * popover picker. Pressing the `{ x }` button opens the
 * portal-rendered VariablePicker, which inserts `{{path}}` at the caret.
 *
 * Below the input, any `{{...}}` segments in the value are rendered as
 * VariableChips — quick visual confirmation of which references the user
 * has wired up.
 */
export function ExpressionInput({
  value,
  onChange,
  multiline = false,
  rows = 2,
  placeholder,
  monospace = false,
  hidePreview = false,
  className,
}: ExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);

  const openPicker = () => {
    setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setPickerOpen(true);
  };

  const insertAtCaret = (path: string) => {
    const ref = `{{${path}}}`;
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + ref + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const node = inputRef.current;
        if (!node) return;
        const pos = start + ref.length;
        node.focus();
        node.setSelectionRange(pos, pos);
      });
    } else {
      onChange(value + ref);
    }
    setPickerOpen(false);
  };

  const baseClasses = clsx(
    "w-full rounded-md border border-ink-100 bg-white text-xs text-ink-900 outline-none placeholder:text-ink-500 focus:border-brand-500",
    monospace && "font-mono",
    multiline ? "px-2 py-1.5 leading-relaxed" : "h-8 px-2",
    className
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {multiline ? (
          <textarea
            ref={(el) => {
              inputRef.current = el;
            }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className={`${baseClasses} resize-y pr-8`}
          />
        ) : (
          <input
            ref={(el) => {
              inputRef.current = el;
            }}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${baseClasses} pr-8`}
          />
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={openPicker}
          className={clsx(
            "absolute right-1 flex h-6 w-6 items-center justify-center rounded text-ink-500 hover:bg-blue-50 hover:text-blue-600",
            multiline ? "top-1.5" : "top-1"
          )}
          aria-label="Insert variable"
          title="Insert variable"
        >
          <Braces size={13} />
        </button>
      </div>
      {!hidePreview && <VariableChipsPreview value={value} />}
      {pickerOpen && (
        <VariablePicker
          anchorRect={anchorRect}
          onSelect={insertAtCaret}
          onClose={() => setPickerOpen(false)}
          excludeNodeId={selectedNodeId}
        />
      )}
    </div>
  );
}
