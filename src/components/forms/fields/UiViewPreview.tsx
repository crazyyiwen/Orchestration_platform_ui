import { useMemo } from "react";

import { useFieldValue } from "@/components/forms/useField";
import { sanitizeHtml } from "@/utils/sanitizeHtml";

/**
 * Read-only preview of a UI View node's HTML template.
 *
 * Renders inside a `sandbox=""` iframe so leftover scripts can't execute
 * even if the user has disabled the sanitizer toggle. Variables like
 * `{{system.userQuery}}` are intentionally left as-is in the preview —
 * resolving them happens at runtime in the Run panel.
 */
export function UiViewPreview({ nodeId }: { nodeId: string }) {
  const html = useFieldValue<string>(nodeId, "config.html") ?? "";
  const sanitizeOn =
    useFieldValue<boolean>(nodeId, "config.sanitize") ?? true;

  const srcDoc = useMemo(
    () => (sanitizeOn ? sanitizeHtml(html) : html),
    [html, sanitizeOn]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="overflow-hidden rounded-md border border-ink-100 bg-white">
        <div className="flex items-center justify-between border-b border-ink-100 bg-ink-100/40 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-500">
          <span>Preview</span>
          <span>{sanitizeOn ? "sanitized" : "raw"} · sandboxed</span>
        </div>
        <iframe
          title="UI View preview"
          srcDoc={srcDoc}
          sandbox=""
          className="block h-64 w-full bg-white"
        />
      </div>
      <p className="text-[10px] italic text-ink-500">
        {`Variables like {{system.userQuery}} render as-is here — they resolve at runtime.`}
      </p>
    </div>
  );
}
