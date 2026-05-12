/**
 * Workflow CRUD against the agent_builder_metadata_api FastAPI backend.
 *
 * The backend mounts routes at `/api/workflows` and is configured to allow
 * CORS from Vite's dev server (5173). The WorkflowDoc shape is sent as-is —
 * the backend has been updated to preserve UI-only fields like `variables`,
 * `flowVariables`, and per-node `description/inputs/outputs/advanced`.
 */

import { serializeWorkflow } from "@/workflow/serialize";
import type { WorkflowDoc } from "@/workflow/types";

const API_BASE_URL = "http://localhost:8000";

export interface WorkflowMeta {
  workflow_id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  current_version: number;
  owner_id: string | null;
  tags: string[];
  category: string | null;
  node_types: string[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowResponse {
  meta: WorkflowMeta;
  doc: WorkflowDoc;
}

export class WorkflowApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly issues: unknown[] | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
    issues: unknown[] | null
  ) {
    super(message);
    this.name = "WorkflowApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

async function parseError(res: Response): Promise<WorkflowApiError> {
  let detail = `HTTP ${res.status}`;
  let code: string | null = null;
  let issues: unknown[] | null = null;
  try {
    const body = (await res.json()) as {
      detail?: string;
      code?: string;
      issues?: unknown[];
    };
    if (typeof body.detail === "string") detail = body.detail;
    if (typeof body.code === "string") code = body.code;
    if (Array.isArray(body.issues)) issues = body.issues;
  } catch {
    // Non-JSON body — keep the HTTP status as the message.
  }
  return new WorkflowApiError(detail, res.status, code, issues);
}

/** POST /api/workflows — create a new workflow record from a UI doc. */
export async function apiCreateWorkflow(doc: WorkflowDoc): Promise<WorkflowResponse> {
  const res = await fetch(`${API_BASE_URL}/api/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: doc.name,
      doc: serializeWorkflow(doc),
    }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowResponse;
}

/** PUT /api/workflows/{id} — replace the stored doc and bump the version. */
export async function apiUpdateWorkflow(
  workflowId: string,
  doc: WorkflowDoc,
  expectedVersion?: number
): Promise<WorkflowResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (expectedVersion != null) headers["If-Match"] = String(expectedVersion);

  const res = await fetch(
    `${API_BASE_URL}/api/workflows/${encodeURIComponent(workflowId)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ doc: serializeWorkflow(doc) }),
    }
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowResponse;
}
