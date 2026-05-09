/**
 * Persistence — localStorage + file import/export.
 *
 * All four entry points go through `serializeWorkflow` so the on-disk
 * representation never contains React-Flow runtime fields, and through
 * `workflowDocSchema` on read so corrupt or stale JSON is rejected loudly.
 */

import type { WorkflowDoc } from "./types";
import { serializeWorkflow, deserializeWorkflow } from "./serialize";
import { workflowDocSchema } from "./validation";

const STORAGE_KEY = "workflow-builder:doc";

export function saveToLocalStorage(doc: WorkflowDoc): void {
  const json = JSON.stringify(serializeWorkflow(doc));
  localStorage.setItem(STORAGE_KEY, json);
}

/** Read the saved doc. Returns null when nothing's saved or it can't parse. */
export function loadFromLocalStorage(): WorkflowDoc | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
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
    console.warn("[workflow] could not parse saved doc, ignoring", e);
    return null;
  }
}

export function clearLocalStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Trigger a browser download of the workflow JSON. */
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

export interface ImportResult {
  ok: boolean;
  doc?: WorkflowDoc;
  error?: string;
}

export async function importWorkflowFromFile(file: File): Promise<ImportResult> {
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
