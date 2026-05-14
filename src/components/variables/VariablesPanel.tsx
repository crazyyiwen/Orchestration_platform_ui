import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  AlertCircle,
  Plus,
  Search,
  Trash2,
  Variable as VarIcon,
  X,
} from "lucide-react";

import { useWorkflowStore } from "@/store/workflowStore";
import type { FlowVariable, FlowVariableType } from "@/workflow/types";
import { Button } from "@/components/ui/Button";
import { inputBase, selectBase } from "@/components/forms/inputs";

const MIN_WIDTH = 340;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;
const WIDTH_KEY = "workflow-builder:variables-panel-width";

function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(WIDTH_KEY);
  if (!raw) return DEFAULT_WIDTH;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

type Tab = "all" | "flow" | "system";

const TYPE_OPTIONS: FlowVariableType[] = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
];

/* Built-in references shown read-only on the "System" / "All" tabs. */
const SYSTEM_REFS: ReadonlyArray<{
  path: string;
  description: string;
  valueType: string;
}> = [
  {
    path: "system.userQuery",
    description: "Free-form query supplied at run start.",
    valueType: "string",
  },
  {
    path: "system.attachments",
    description: "List of attachment objects.",
    valueType: "array",
  },
  {
    path: "system.files",
    description: "List of file references.",
    valueType: "array",
  },
  {
    path: "system.humanInput",
    description: "Most recent Human Input response.",
    valueType: "string",
  },
  {
    path: "system.conversationHistory",
    description:
      "Running conversation history. Append to it from agent/LLM nodes via State Update.",
    valueType: "array",
  },
  {
    path: "runtime.workflowMetaData.workflowId",
    description: "This workflow's id.",
    valueType: "string",
  },
  {
    path: "runtime.workflowMetaData.agentName",
    description: "This workflow's display name.",
    valueType: "string",
  },
];

/**
 * Side drawer for managing flow-scoped state variables.
 *
 * Reads/writes `doc.flowVariables` via the workflow store; the variable
 * picker, executor seeding, and Variable Update nodes all key off the
 * same list, so adding a flow variable here makes it immediately
 * referenceable as `{{flow.<name>}}` from any field that uses
 * ExpressionInput.
 */
export function VariablesPanel() {
  const open = useWorkflowStore((s) => s.variablesOpen);
  const close = useWorkflowStore((s) => s.closeVariables);
  // Older backend records may not include `flowVariables` yet; fall back to
  // an empty array so iteration/filtering never blows up.
  const variables = useWorkflowStore((s) => s.doc.flowVariables ?? []);
  const add = useWorkflowStore((s) => s.addFlowVariable);
  const update = useWorkflowStore((s) => s.updateFlowVariable);
  const remove = useWorkflowStore((s) => s.removeFlowVariable);

  const [tab, setTab] = useState<Tab>("flow");
  const [query, setQuery] = useState("");

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const dupNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of variables) {
      counts.set(v.name, (counts.get(v.name) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([n]) => n)
    );
  }, [variables]);

  const filteredFlow = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return variables;
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.description ?? "").toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q)
    );
  }, [variables, query]);

  const filteredSystem = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SYSTEM_REFS;
    return SYSTEM_REFS.filter(
      (v) =>
        v.path.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
    );
  }, [query]);

  // Resizable width, persisted to localStorage (UI preference, not workflow data).
  const [width, setWidth] = useState<number>(readStoredWidth);
  const resizing = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const next = window.innerWidth - e.clientX;
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  if (!open) return null;

  const showFlow = tab === "all" || tab === "flow";
  const showSystem = tab === "all" || tab === "system";

  return createPortal(
    <aside
      style={{ width }}
      className="fixed right-0 top-14 z-30 flex h-[calc(100vh-3.5rem)] flex-col border-l border-ink-100 bg-white shadow-2xl"
    >
      {/* Resize handle on the left edge */}
      <div
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize variables panel"
        className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-brand-500/40 active:bg-brand-500/60"
      />

      {/* Header */}
      <div className="flex items-start gap-3 border-b border-ink-100 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <VarIcon size={16} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-900">Variables</div>
          <p className="text-[11px] text-ink-500">
            Define state variables shared across the orchestration.
          </p>
        </div>
        <button
          onClick={close}
          className="flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60"
          aria-label="Close variables panel"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3">
        <div className="flex h-8 items-center gap-2 rounded-md border border-ink-100 bg-canvas px-2 transition-colors focus-within:border-brand-500 focus-within:bg-white">
          <Search size={14} className="text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search variables…"
            className="h-full w-full bg-transparent text-xs outline-none placeholder:text-ink-500"
          />
        </div>
      </div>

      {/* Tabs + Add */}
      <div className="flex items-center gap-1 px-4 pt-3">
        {(["all", "flow", "system"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
              tab === t
                ? "bg-ink-100 text-ink-900"
                : "text-ink-500 hover:bg-ink-100/60"
            )}
          >
            {t}
          </button>
        ))}
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={12} />}
          onClick={add}
          className="ml-auto"
        >
          Add Variable
        </Button>
      </div>

      {/* List */}
      <div className="scrollbar-soft flex-1 overflow-y-auto px-4 py-3">
        {showFlow && (
          <Section title="Flow" count={filteredFlow.length}>
            {filteredFlow.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              filteredFlow.map((v) => (
                <FlowVariableCard
                  key={v.id}
                  variable={v}
                  duplicate={dupNames.has(v.name)}
                  onChange={(patch) => update(v.id, patch)}
                  onRemove={() => remove(v.id)}
                />
              ))
            )}
          </Section>
        )}
        {showSystem && (
          <Section title="System" count={filteredSystem.length}>
            {filteredSystem.length === 0 ? (
              <p className="px-1 py-2 text-[11px] italic text-ink-500">
                No matches.
              </p>
            ) : (
              filteredSystem.map((v) => (
                <SystemVariableCard
                  key={v.path}
                  path={v.path}
                  description={v.description}
                  valueType={v.valueType}
                />
              ))
            )}
          </Section>
        )}
      </div>
    </aside>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">
        <span>{title}</span>
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-medium text-ink-700">
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-300 bg-canvas px-3 py-4 text-center text-[11px] text-ink-500">
      {query.trim()
        ? `No flow variables match "${query.trim()}".`
        : "No flow variables yet. Click + Add Variable to create one."}
    </div>
  );
}

function FlowVariableCard({
  variable,
  duplicate,
  onChange,
  onRemove,
}: {
  variable: FlowVariable;
  duplicate: boolean;
  onChange: (patch: Partial<FlowVariable>) => void;
  onRemove: () => void;
}) {
  // Two-row layout so the name input always gets full width even at the
  // narrowest panel size. `min-w-0` on the flex child is what lets the input
  // shrink past its intrinsic ~150px and grow back when there's room.
  return (
    <div className="rounded-md border border-ink-100 bg-white p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <VarIcon size={12} strokeWidth={2.25} />
        </span>
        <input
          value={variable.name}
          onChange={(e) =>
            onChange({ name: e.target.value.replace(/\s+/g, "_") })
          }
          placeholder="variable_name"
          className={clsx(
            `${inputBase} h-7 min-w-0 flex-1 font-mono`,
            duplicate && "border-rose-300 text-rose-700"
          )}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-rose-50 hover:text-rose-600"
          aria-label="Delete variable"
          title="Delete variable"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <select
          value={variable.type}
          onChange={(e) =>
            onChange({ type: e.target.value as FlowVariableType })
          }
          className={`${selectBase} h-7 w-28 shrink-0`}
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="truncate font-mono text-[10px] text-blue-700">
          {`{{flow.${variable.name || "…"}}}`}
        </span>
        <span className="ml-auto rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-medium text-ink-700">
          flow
        </span>
      </div>
      <textarea
        value={variable.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Optional description"
        rows={1}
        className={`${inputBase} mt-1.5 h-7 resize-y py-1.5`}
      />
      {duplicate && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-rose-600">
          <AlertCircle size={10} />
          Another variable already uses this name.
        </div>
      )}
    </div>
  );
}

function SystemVariableCard({
  path,
  description,
  valueType,
}: {
  path: string;
  description: string;
  valueType: string;
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-canvas px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-blue-700">{path}</span>
        <span className="ml-auto rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-medium text-ink-500">
          {valueType}
        </span>
      </div>
      {description && (
        <p className="mt-0.5 text-[10px] text-ink-500">{description}</p>
      )}
    </div>
  );
}
