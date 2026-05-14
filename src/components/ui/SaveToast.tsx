import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2 } from "lucide-react";

import { useWorkflowStore } from "@/store/workflowStore";

/**
 * Floating success toast that appears bottom-right after a save completes.
 *
 * Subscribes to ``lastSavedAt`` from the workflow store; when it updates with
 * a recent timestamp, shows the toast for ~2.5s and then fades out.
 *
 * Uses a recency check (≤5s) so loading a previously-saved workflow at boot
 * does not flash the toast on app mount.
 */
export function SaveToast() {
  const lastSavedAt = useWorkflowStore((s) => s.lastSavedAt);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (lastSavedAt == null) return;
    // Skip stale timestamps from bootstrap-loaded workflows.
    if (Date.now() - lastSavedAt > 5000) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 2500);
    return () => window.clearTimeout(t);
  }, [lastSavedAt]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={[
        "pointer-events-none fixed bottom-6 right-6 z-[1100]",
        "transition-all duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg ring-1 ring-emerald-700/50">
        <CheckCircle2 size={16} strokeWidth={2.5} />
        <span>Workflow saved</span>
      </div>
    </div>,
    document.body,
  );
}
