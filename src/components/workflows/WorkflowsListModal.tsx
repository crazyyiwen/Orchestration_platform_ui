import { useEffect } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  Check,
  FilePlus,
  FolderOpen,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { useWorkflowStore } from "@/store/workflowStore";
import { Button } from "@/components/ui/Button";
import { useState, useMemo } from "react";

/**
 * Workflows list — modal triggered from the header "Open" button.
 *
 * Lists every workflow saved in localStorage. Click a row to switch the
 * editor to that workflow. The trash button removes a workflow (with a
 * confirm); deleting the active workflow falls through to another saved
 * workflow or a fresh empty one (the store handles the fallback).
 *
 * The "Create new workflow" inline action is the same as the header's
 * `FilePlus` button, included here as a convenient first option when the
 * list is empty.
 */
export function WorkflowsListModal() {
  const open = useWorkflowStore((s) => s.workflowsListOpen);
  const close = useWorkflowStore((s) => s.closeWorkflowsList);
  const list = useWorkflowStore((s) => s.workflowsIndex);
  const currentId = useWorkflowStore((s) => s.doc.id);
  const switchTo = useWorkflowStore((s) => s.switchWorkflow);
  const remove = useWorkflowStore((s) => s.deleteWorkflowFromIndex);
  const createNew = useWorkflowStore((s) => s.createNewWorkflow);

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => w.name.toLowerCase().includes(q));
  }, [list, query]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/40 p-4 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex max-h-[70vh] w-[560px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-ink-100 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
            <FolderOpen size={15} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink-900">Workflows</div>
            <div className="text-[11px] text-ink-500">
              {list.length} saved · click to open
            </div>
          </div>
          <button
            onClick={close}
            className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="flex h-8 items-center gap-2 rounded-md border border-ink-100 bg-canvas px-2 transition-colors focus-within:border-brand-500 focus-within:bg-white">
            <Search size={14} className="text-ink-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workflows…"
              className="h-full w-full bg-transparent text-xs outline-none placeholder:text-ink-500"
            />
          </div>
        </div>

        {/* Body */}
        <div className="scrollbar-soft flex-1 overflow-y-auto px-4 py-3">
          <button
            type="button"
            onClick={async () => {
              const result = await createNew();
              if (!result.ok && result.error) window.alert(result.error);
            }}
            className="mb-3 flex w-full items-center gap-2.5 rounded-md border border-dashed border-ink-300 bg-canvas px-3 py-2.5 text-left text-xs text-ink-700 transition-colors hover:border-brand-500 hover:bg-brand-500/5 hover:text-brand-600"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-brand-600 ring-1 ring-ink-100">
              <FilePlus size={14} />
            </span>
            <span className="flex-1">
              <span className="font-medium">Create new workflow</span>
              <span className="ml-1 text-ink-500">— start from a blank canvas</span>
            </span>
          </button>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-ink-300 bg-canvas px-3 py-8 text-center text-xs text-ink-500">
              {query.trim()
                ? `No workflows match "${query.trim()}".`
                : "No saved workflows yet. Hit Save in a workflow to keep it."}
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {filtered.map((w) => (
                <li key={w.id}>
                  <WorkflowRow
                    name={w.name}
                    updatedAt={w.updatedAt}
                    isActive={w.id === currentId}
                    onOpen={() => switchTo(w.id)}
                    onDelete={() => {
                      const ok = window.confirm(
                        `Delete workflow "${w.name}"? This can't be undone.`
                      );
                      if (ok) remove(w.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-ink-100 bg-canvas px-4 py-3">
          <Button variant="secondary" size="sm" onClick={close}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                 */
/* ------------------------------------------------------------------ */

function WorkflowRow({
  name,
  updatedAt,
  isActive,
  onOpen,
  onDelete,
}: {
  name: string;
  updatedAt: number;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={clsx(
        "group relative flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors",
        isActive
          ? "border-brand-500 bg-brand-500/5"
          : "border-ink-100 bg-white hover:border-ink-300 hover:bg-ink-100/40"
      )}
      onClick={onOpen}
    >
      <span
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-md",
          isActive
            ? "bg-brand-500/10 text-brand-600 ring-1 ring-brand-500/30"
            : "bg-ink-100 text-ink-700"
        )}
      >
        <FolderOpen size={13} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-ink-900">
            {name}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-brand-600">
              <Check size={9} />
              Active
            </span>
          )}
        </div>
        <div className="text-[11px] text-ink-500">
          Updated {formatRelative(updatedAt)}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="flex h-7 w-7 items-center justify-center rounded text-ink-500 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        aria-label={`Delete ${name}`}
        title="Delete workflow"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleString();
}
