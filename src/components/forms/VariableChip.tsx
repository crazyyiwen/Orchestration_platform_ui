import clsx from "clsx";
import { X } from "lucide-react";

interface VariableChipProps {
  path: string;
  onRemove?: () => void;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Small blue badge representing a `{{path}}` reference. Used both inside
 * the chips preview below an input and as standalone tokens (e.g. in the
 * future variable-reference-list field).
 */
export function VariableChip({
  path,
  onRemove,
  className,
  size = "sm",
}: VariableChipProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full bg-blue-50 font-medium text-blue-700 ring-1 ring-blue-100",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className
      )}
      title={`{{${path}}}`}
    >
      <span className="truncate" style={{ maxWidth: 220 }}>
        {path}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-blue-700/70 hover:text-blue-900"
          aria-label="Remove variable"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Inline preview                                                      */
/* ------------------------------------------------------------------ */

const VAR_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

interface ChipsPreviewProps {
  value: string;
  /** When true, also renders surrounding plain-text fragments (default). */
  showText?: boolean;
}

/**
 * Splits a string on `{{...}}` segments and renders each ref as a chip.
 * Returns null when the string contains no references — callers can
 * conditionally show a "no variables in this field" hint if needed.
 */
export function VariableChipsPreview({
  value,
  showText = true,
}: ChipsPreviewProps) {
  if (!value) return null;
  type Part = { kind: "text" | "ref"; text: string };
  const parts: Part[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  VAR_PATTERN.lastIndex = 0;
  while ((m = VAR_PATTERN.exec(value)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ kind: "text", text: value.slice(lastIndex, m.index) });
    }
    parts.push({ kind: "ref", text: m[1].trim() });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < value.length) {
    parts.push({ kind: "text", text: value.slice(lastIndex) });
  }
  if (!parts.some((p) => p.kind === "ref")) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-ink-700">
      {parts.map((p, i) =>
        p.kind === "ref" ? (
          <VariableChip key={i} path={p.text} />
        ) : showText ? (
          <span key={i} className="text-ink-500">
            {p.text}
          </span>
        ) : null
      )}
    </div>
  );
}
