import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  PauseCircle,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import clsx from "clsx";

import { useWorkflowStore } from "@/store/workflowStore";
import {
  resumeExecution,
  startExecution,
  type LogEntry,
  type RunStatus,
  type RuntimeState,
} from "@/workflow/execution/executor";
import { Button } from "@/components/ui/Button";
import { nodeRegistry } from "@/workflow/nodeRegistry";
import { Icon } from "@/components/ui/Icon";
import { ICON_BG_LARGE } from "@/components/ui/colorTokens";

type Phase = RunStatus | "idle";

/**
 * Modal that drives a workflow run. Holds local execution state — clicking
 * "Run" calls `startExecution`, the panel renders the unfolding log, and any
 * Human Input / Approval pause shows an inline prompt that funnels back into
 * `resumeExecution`.
 */
export function RunPanel() {
  const open = useWorkflowStore((s) => s.runOpen);
  const close = useWorkflowStore((s) => s.closeRun);
  const doc = useWorkflowStore((s) => s.doc);

  const [phase, setPhase] = useState<Phase>("idle");
  const [state, setState] = useState<RuntimeState | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [pendingResponse, setPendingResponse] = useState("");

  // Reset when the panel closes so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setState(null);
      setUserQuery("");
      setPendingResponse("");
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const start = () => {
    const tick = startExecution(doc, { userQuery });
    setState(tick.state);
    setPhase(tick.kind === "finished" ? "finished" : tick.kind);
  };

  const resume = () => {
    if (!state) return;
    const response = pendingResponse;
    setPendingResponse("");
    const tick = resumeExecution(doc, state, response);
    setState(tick.state);
    setPhase(tick.kind === "finished" ? "finished" : tick.kind);
  };

  const decideApproval = (decision: "approved" | "rejected") => {
    if (!state) return;
    const tick = resumeExecution(doc, state, decision);
    setState(tick.state);
    setPhase(tick.kind === "finished" ? "finished" : tick.kind);
  };

  const reset = () => {
    setPhase("idle");
    setState(null);
    setPendingResponse("");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex max-h-[85vh] w-[680px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Play size={15} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink-900">
              Run · {doc.name}
            </div>
            <div className="text-[11px] text-ink-500">
              Mock execution — no external services are called.
            </div>
          </div>
          <PhaseBadge phase={phase} />
          <button
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {phase === "idle" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-ink-500">
                Provide an initial value for{" "}
                <code className="rounded bg-ink-100 px-1">
                  system.userQuery
                </code>{" "}
                — variables across the workflow can reference it.
              </p>
              <textarea
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                rows={3}
                placeholder="What does the user want?"
                className="w-full resize-y rounded-md border border-ink-100 bg-white px-2 py-1.5 text-xs text-ink-900 outline-none placeholder:text-ink-500 focus:border-brand-500"
                autoFocus
              />
            </div>
          )}

          {state && state.log.length > 0 && (
            <div className="flex flex-col gap-2">
              {state.log.map((entry, i) => (
                <LogRow key={i} entry={entry} />
              ))}
            </div>
          )}

          {phase === "paused" && state?.awaiting && (
            <PausePrompt
              awaiting={state.awaiting}
              pendingResponse={pendingResponse}
              setPendingResponse={setPendingResponse}
              onResumeText={resume}
              onDecide={decideApproval}
            />
          )}

          {phase === "finished" && state && (
            <FinalOutput output={state.output} />
          )}

          {phase === "error" && state?.error && (
            <ErrorView error={state.error} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-ink-100 bg-canvas px-4 py-3">
          <div className="text-[11px] text-ink-500">
            {state ? `${state.log.length} step${state.log.length === 1 ? "" : "s"}` : ""}
          </div>
          <div className="flex items-center gap-2">
            {phase !== "idle" && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RotateCcw size={13} />}
                onClick={reset}
              >
                Reset
              </Button>
            )}
            {phase === "idle" && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Play size={13} />}
                onClick={start}
              >
                Run workflow
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={close}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function PhaseBadge({ phase }: { phase: Phase }) {
  const styles: Record<Phase, string> = {
    idle: "bg-ink-100 text-ink-700",
    running: "bg-blue-50 text-blue-700",
    paused: "bg-amber-50 text-amber-700",
    finished: "bg-emerald-50 text-emerald-700",
    error: "bg-rose-50 text-rose-700",
  };
  const label: Record<Phase, string> = {
    idle: "Ready",
    running: "Running",
    paused: "Paused",
    finished: "Finished",
    error: "Error",
  };
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        styles[phase]
      )}
    >
      {label[phase]}
    </span>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const def = nodeRegistry[entry.nodeType];
  return (
    <div className="rounded-md border border-ink-100 bg-white">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {def && (
          <span
            className={clsx(
              "flex h-6 w-6 items-center justify-center rounded",
              ICON_BG_LARGE[def.color]
            )}
          >
            <Icon name={def.icon} size={12} />
          </span>
        )}
        <span className="text-[11px] font-semibold text-ink-900">
          {entry.nodeName}
        </span>
        <span className="text-[10px] text-ink-500">{entry.nodeType}</span>
        {entry.nextHandle && (
          <span className="ml-auto inline-flex items-center gap-1 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-700">
            <ArrowRight size={10} />
            {entry.nextHandle}
          </span>
        )}
      </div>
      <div className="border-t border-ink-100 bg-canvas px-2.5 py-1.5">
        {entry.error ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-rose-700">
            {entry.error}
          </pre>
        ) : entry.pause ? (
          <span className="text-[10px] italic text-amber-700">
            Paused for {entry.pause}…
          </span>
        ) : (
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-ink-700">
            {safeStringify(entry.result)}
          </pre>
        )}
      </div>
    </div>
  );
}

function PausePrompt({
  awaiting,
  pendingResponse,
  setPendingResponse,
  onResumeText,
  onDecide,
}: {
  awaiting: NonNullable<RuntimeState["awaiting"]>;
  pendingResponse: string;
  setPendingResponse: (v: string) => void;
  onResumeText: () => void;
  onDecide: (decision: "approved" | "rejected") => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
        <PauseCircle size={13} />
        {awaiting.kind === "humanInput" ? "Human Input" : "Approval"} ·{" "}
        {awaiting.nodeName}
      </div>
      <p className="mb-2 whitespace-pre-wrap text-xs text-amber-900">
        {awaiting.prompt}
      </p>
      {awaiting.kind === "humanInput" ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={pendingResponse}
            onChange={(e) => setPendingResponse(e.target.value)}
            rows={2}
            placeholder="Your response…"
            className="w-full resize-y rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs text-ink-900 outline-none focus:border-amber-400"
            autoFocus
          />
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={onResumeText}>
              Submit & continue
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDecide("rejected")}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onDecide("approved")}
          >
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}

function FinalOutput({ output }: { output: unknown }) {
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
        <CheckCircle2 size={13} />
        Workflow output
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-mono text-[10px] text-ink-900">
        {safeStringify(output)}
      </pre>
    </div>
  );
}

function ErrorView({ error }: { error: string }) {
  return (
    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-rose-800">
        <AlertCircle size={13} />
        Execution failed
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-rose-700">
        {error}
      </pre>
    </div>
  );
}

function safeStringify(v: unknown): string {
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
