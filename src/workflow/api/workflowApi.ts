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

/**
 * Coerce a backend-returned doc into the shape the UI expects.
 *
 * The backend may omit newer optional fields (`flowVariables`, `edges[].data`
 * routing offsets, etc.) for records created before the corresponding feature
 * landed. Filling sensible defaults here keeps every consumer of `doc` —
 * VariablesPanel, AdjustableEdge, the executor — from having to guard for
 * `undefined` everywhere.
 */
function normalizeDoc(raw: unknown): WorkflowDoc {
  const doc = (raw ?? {}) as Partial<WorkflowDoc>;
  return {
    id: doc.id ?? `wf_${Date.now()}`,
    name: doc.name ?? "Untitled workflow",
    version: typeof doc.version === "number" ? doc.version : 1,
    nodes: Array.isArray(doc.nodes) ? doc.nodes : [],
    edges: Array.isArray(doc.edges) ? doc.edges : [],
    variables: doc.variables ?? {
      system: {
        userQuery: "",
        attachments: [],
        files: [],
        humanInput: "",
        conversationHistory: [],
      },
      runtime: {
        workflowMetaData: { workflowId: "", agentName: "" },
      },
    },
    flowVariables: Array.isArray(doc.flowVariables) ? doc.flowVariables : [],
  };
}

/**
 * Finalize a WorkflowResponse from the backend.
 *
 * Critical invariant: `doc.version === meta.current_version`. The backend
 * tracks the optimistic-concurrency version in `meta.current_version` and
 * doesn't necessarily mirror it inside the stored doc body — so a doc
 * loaded via GET could carry a stale `version` field, which would then
 * be sent back in the next PUT's `If-Match` header and CONFLICT against
 * the (already-advanced) backend version. Forcing the alignment here
 * means every save after a load uses the up-to-date version.
 */
function buildResponse(body: WorkflowResponse): WorkflowResponse {
  const normalized = normalizeDoc(body.doc);
  return {
    meta: body.meta,
    doc: { ...normalized, version: body.meta.current_version },
  };
}

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

/** UI-facing summary used by the Workflows list modal. */
export interface WorkflowSummary {
  id: string;
  name: string;
  /** Unix ms — derived from `meta.updated_at`. */
  updatedAt: number;
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

/**
 * Build a summary from a raw list item.
 *
 * The backend stores two name fields per record: a top-level meta `name`
 * and the full doc body under `latest_doc` (or `doc`). PUT only persists
 * the doc body — the backend does NOT mirror a rename into the meta
 * `name` — so `latest_doc.name` is the authoritative current name while
 * the top-level `name` lags. Prefer the doc-body name; fall back to meta.
 */
function listItemToSummary(raw: unknown): WorkflowSummary {
  const item = (raw ?? {}) as {
    workflow_id?: string;
    id?: string;
    name?: string;
    updated_at?: string;
    latest_doc?: { id?: string; name?: string };
    doc?: { id?: string; name?: string };
  };
  const id =
    item.workflow_id ??
    item.latest_doc?.id ??
    item.doc?.id ??
    item.id ??
    "";
  const name =
    item.latest_doc?.name ||
    item.doc?.name ||
    item.name ||
    "Untitled workflow";
  const updatedAt = item.updated_at ? Date.parse(item.updated_at) : Date.now();
  return { id, name, updatedAt: updatedAt || Date.now() };
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
  const body = (await res.json()) as WorkflowResponse;
  return buildResponse(body);
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
      // The backend's PUT body schema only accepts `{ doc }` (sending an
      // extra `name` field returns HTTP 422). The display name lives in
      // `doc.name`; the store rebuilds the workflows-index summary from the
      // saved doc so the UI stays consistent without a separate name field.
      body: JSON.stringify({ doc: serializeWorkflow(doc) }),
    }
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as WorkflowResponse;
  return buildResponse(body);
}

/** GET /api/workflows — list every saved workflow as a summary. */
export async function apiListWorkflows(): Promise<WorkflowSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/workflows`);
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as unknown;

  // Accept either a bare array of metas or a wrapper like `{ items: [...] }`
  // / `{ workflows: [...] }` so this stays resilient to small backend tweaks.
  const items: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown }).items)
    ? ((body as { items: unknown[] }).items)
    : Array.isArray((body as { workflows?: unknown }).workflows)
    ? ((body as { workflows: unknown[] }).workflows)
    : [];

  return items.map(listItemToSummary);
}

/** GET /api/workflows/{id} — load a single workflow's full doc + meta. */
export async function apiGetWorkflow(
  workflowId: string
): Promise<WorkflowResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/workflows/${encodeURIComponent(workflowId)}`
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as WorkflowResponse;
  return buildResponse(body);
}

/** DELETE /api/workflows/{id} — remove a workflow record. */
export async function apiDeleteWorkflow(workflowId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/workflows/${encodeURIComponent(workflowId)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw await parseError(res);
}
