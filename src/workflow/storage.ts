/**
 * Workflow file IO — JSON import/export.
 *
 * All persistence to a backend goes through `workflow/api/workflowApi.ts`;
 * this module is now just the file-download / file-upload helpers used by
 * the header's Import and Export buttons.
 *
 * Serialization goes through `serializeWorkflow` so the on-disk
 * representation never contains React-Flow runtime fields, and parsed
 * imports go through `workflowDocSchema` so corrupt JSON is rejected loudly.
 */

import type { WorkflowDoc } from "./types";
import { serializeWorkflow, deserializeWorkflow } from "./serialize";
import { workflowDocSchema } from "./validation";

export interface ImportResult {
  ok: boolean;
  doc?: WorkflowDoc;
  error?: string;
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
