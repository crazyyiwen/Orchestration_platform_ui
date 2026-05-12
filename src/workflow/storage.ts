/**
 * Persistence — localStorage + file import/export with multi-workflow support.
 *
 * Storage layout:
 *   workflow-builder:index      → WorkflowSummary[]  (id, name, updatedAt)
 *   workflow-builder:doc:<id>   → serialized WorkflowDoc
 *   workflow-builder:active     → id of the workflow currently loaded in the editor
 *
 * Reads go through `workflowDocSchema` so corrupt or stale JSON is rejected
 * loudly; writes go through `serializeWorkflow` so the on-disk representation
 * never contains React-Flow runtime fields.
 *
 * A migration runs once on boot to fold the pre-multi-workflow
 * `workflow-builder:doc` blob into the new format.
 */

import type { WorkflowDoc } from "./types";
import { serializeWorkflow, deserializeWorkflow } from "./serialize";
import { workflowDocSchema } from "./validation";
import { createEmptyWorkflow } from "./defaultWorkflow";

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

const INDEX_KEY = "workflow-builder:index";
const ACTIVE_KEY = "workflow-builder:active";
const LEGACY_DOC_KEY = "workflow-builder:doc";
const docKey = (id: string) => `workflow-builder:doc:${id}`;

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export interface WorkflowSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export interface ImportResult {
  ok: boolean;
  doc?: WorkflowDoc;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Index helpers                                                       */
/* ------------------------------------------------------------------ */

function readIndex(): WorkflowSummary[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is WorkflowSummary =>
        x != null &&
        typeof x === "object" &&
        typeof x.id === "string" &&
        typeof x.name === "string" &&
        typeof x.updatedAt === "number"
    );
  } catch {
    return [];
  }
}

function writeIndex(index: WorkflowSummary[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function listSavedWorkflows(): WorkflowSummary[] {
  // Most-recent first.
  return [...readIndex()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveWorkflowId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveWorkflowId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

/* ------------------------------------------------------------------ */
/* Doc reads / writes                                                  */
/* ------------------------------------------------------------------ */

function parseDoc(raw: string | null): WorkflowDoc | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = workflowDocSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(
        "[workflow] saved doc failed schema validation, ignoring",
        result.error.issues
      );
      return null;
    }
    return deserializeWorkflow(result.data as WorkflowDoc);
  } catch (e) {
    console.warn("[workflow] could not parse saved doc", e);
    return null;
  }
}

export function loadSavedWorkflow(id: string): WorkflowDoc | null {
  if (typeof window === "undefined") return null;
  return parseDoc(localStorage.getItem(docKey(id)));
}

export function saveWorkflow(doc: WorkflowDoc): WorkflowSummary {
  const json = JSON.stringify(serializeWorkflow(doc));
  localStorage.setItem(docKey(doc.id), json);

  const summary: WorkflowSummary = {
    id: doc.id,
    name: doc.name,
    updatedAt: Date.now(),
  };
  const index = readIndex();
  const i = index.findIndex((w) => w.id === doc.id);
  if (i === -1) index.push(summary);
  else index[i] = summary;
  writeIndex(index);
  return summary;
}

export function deleteSavedWorkflow(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(docKey(id));
  writeIndex(readIndex().filter((w) => w.id !== id));
  if (getActiveWorkflowId() === id) setActiveWorkflowId(null);
}

/* ------------------------------------------------------------------ */
/* Boot + legacy migration                                             */
/* ------------------------------------------------------------------ */

/**
 * One-shot migration: the pre-multi-workflow code wrote to
 * `workflow-builder:doc`. If that key exists and the index doesn't have
 * the workflow yet, move it across. Old key is removed either way.
 */
function migrateLegacy(): void {
  if (typeof window === "undefined") return;
  const legacy = localStorage.getItem(LEGACY_DOC_KEY);
  if (!legacy) return;
  const doc = parseDoc(legacy);
  if (doc && !readIndex().some((w) => w.id === doc.id)) {
    saveWorkflow(doc);
    setActiveWorkflowId(doc.id);
  }
  localStorage.removeItem(LEGACY_DOC_KEY);
}

/** Resolve the initial doc for the editor. Used once at store construction. */
export function bootstrapInitialDoc(): WorkflowDoc {
  if (typeof window === "undefined") return createEmptyWorkflow();
  migrateLegacy();

  const activeId = getActiveWorkflowId();
  if (activeId) {
    const doc = loadSavedWorkflow(activeId);
    if (doc) return doc;
    // Active id pointed at something that no longer exists.
    setActiveWorkflowId(null);
  }

  // Otherwise, fall back to the most recently saved workflow.
  const summaries = listSavedWorkflows();
  for (const s of summaries) {
    const doc = loadSavedWorkflow(s.id);
    if (doc) {
      setActiveWorkflowId(s.id);
      return doc;
    }
  }

  // No saved workflows at all — start fresh.
  return createEmptyWorkflow();
}

/* ------------------------------------------------------------------ */
/* File import / export                                                */
/* ------------------------------------------------------------------ */

export function exportWorkflowToFile(doc: WorkflowDoc): void {
  const json = JSON.stringify(serializeWorkflow(doc), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(doc.name) || "workflow"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importWorkflowFromFile(
  file: File
): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    return {
      ok: false,
      error: `Could not read file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const result = workflowDocSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      ok: false,
      error: first
        ? `Invalid workflow JSON at "${first.path.join(".")}": ${first.message}`
        : "Invalid workflow JSON.",
    };
  }
  return { ok: true, doc: deserializeWorkflow(result.data as WorkflowDoc) };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
