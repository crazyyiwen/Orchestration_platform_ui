/**
 * Zustand store holding the workflow document plus UI selection state.
 *
 * Two design choices worth highlighting:
 *
 * 1. The store is the single owner of nodes and edges — React Flow's local
 *    state hooks (`useNodesState`, `useEdgesState`) are NOT used. Instead the
 *    canvas calls `applyNodeChanges` / `applyEdgeChanges` against the store.
 *    This keeps the workflow JSON authoritative and serializable at all times.
 *
 * 2. `addNodeFromPalette` enforces unique node names by appending an index
 *    (`llm`, `llm_1`, `llm_2` …). Names are user-editable later but always
 *    deduped on creation.
 */

import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  updateEdge as rfUpdateEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "reactflow";
import { nanoid } from "nanoid";

import { nodeRegistry } from "@/workflow/nodeRegistry";
import { createEmptyWorkflow } from "@/workflow/defaultWorkflow";
import {
  exportWorkflowToFile,
  importWorkflowFromFile,
} from "@/workflow/storage";
import {
  apiCreateWorkflow,
  apiDeleteWorkflow,
  apiGetWorkflow,
  apiListWorkflows,
  apiUpdateWorkflow,
  WorkflowApiError,
  type WorkflowSummary,
} from "@/workflow/api/workflowApi";
import {
  validateWorkflow,
  type ValidationIssue,
} from "@/workflow/validation";
import type {
  FlowVariable,
  WorkflowDoc,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
} from "@/workflow/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Convert workflow doc nodes/edges to the shape React Flow expects.
 *  We forward width/height/positionAbsolute so React Flow's measurement
 *  loop converges — without these, every dimensions update from RF would
 *  be discarded and the new node would never finish measuring. */
function toRFNodes(nodes: WorkflowNode[]): Node<WorkflowNodeData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type, // always "dynamic"
    position: n.position,
    data: n.data,
    width: n.width ?? undefined,
    height: n.height ?? undefined,
    positionAbsolute: n.positionAbsolute,
    dragging: n.dragging,
  }));
}

function toRFEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? undefined,
    target: e.target,
    targetHandle: e.targetHandle ?? undefined,
    // The `adjustable` custom edge reads `data.routingOffset` to render its
    // user-controlled midpoint.
    type: "adjustable",
    data: e.data,
  }));
}

function fromRFNodes(nodes: Node<WorkflowNodeData>[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: "dynamic",
    position: n.position,
    data: n.data,
    width: n.width ?? null,
    height: n.height ?? null,
    positionAbsolute: n.positionAbsolute,
    dragging: n.dragging,
  }));
}

function fromRFEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? null,
    target: e.target,
    targetHandle: e.targetHandle ?? null,
    data: e.data as WorkflowEdge["data"],
  }));
}

/** Walk a dot-path on `obj` and set the value, mutating in place. */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (
      typeof cursor[key] !== "object" ||
      cursor[key] === null ||
      Array.isArray(cursor[key])
    ) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

/** Pick a unique node name like `llm`, `llm_1`, `llm_2` based on what exists. */
function uniqueName(prefix: string, existing: WorkflowNode[]): string {
  const taken = new Set(existing.map((n) => n.data.name));
  if (!taken.has(prefix)) return prefix;
  let i = 1;
  while (taken.has(`${prefix}_${i}`)) i++;
  return `${prefix}_${i}`;
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface WorkflowState {
  doc: WorkflowDoc;
  selectedNodeId: string | null;

  /** Persistence status. `null` until a save has happened in this session. */
  lastSavedAt: number | null;
  /** Most recent validation/import error, if any. Cleared on successful save. */
  saveError: string | null;

  /** Run panel visibility. */
  runOpen: boolean;
  openRun: () => void;
  closeRun: () => void;

  /** Variables panel visibility. */
  variablesOpen: boolean;
  openVariables: () => void;
  closeVariables: () => void;

  /** Multi-workflow management. All persistence flows through the backend
   *  workflow API — there is no localStorage layer. */
  workflowsListOpen: boolean;
  workflowsIndex: WorkflowSummary[];
  /** True while the initial list/get bootstrap is in flight. */
  bootstrapping: boolean;
  openWorkflowsList: () => void;
  closeWorkflowsList: () => void;
  /** GET /api/workflows — refresh the index from the backend. */
  refreshWorkflowsIndex: () => Promise<void>;
  /** One-shot init: fetch the list and load the most-recent workflow. */
  bootstrap: () => Promise<void>;
  /** Replace the current doc with a new empty workflow (auto-unique name).
   *  Persists the new workflow to the backend via POST /api/workflows. */
  createNewWorkflow: () => Promise<{ ok: boolean; error?: string }>;
  /** Replace the current doc with the workflow at `id` (GET /api/workflows/{id}). */
  switchWorkflow: (id: string) => Promise<{ ok: boolean; error?: string }>;
  /** Delete a workflow (DELETE /api/workflows/{id}). If it was the active
   *  one, falls through to another workflow or a fresh empty one. */
  deleteWorkflowFromIndex: (id: string) => Promise<{ ok: boolean; error?: string }>;

  /** Flow-variable mutations. */
  addFlowVariable: () => void;
  updateFlowVariable: (id: string, patch: Partial<FlowVariable>) => void;
  removeFlowVariable: (id: string) => void;

  /** React Flow integrations */
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  connect: (connection: Connection) => void;
  /** Reconnect an existing edge — used when a user drags an edge endpoint to
   *  a different handle. Preserves the edge id so listeners stay stable. */
  updateEdgeConnection: (oldEdge: Edge, newConnection: Connection) => void;
  /** Patch the `data` field of an edge — used by AdjustableEdge to persist
   *  the user's manual routing offset as they drag the wire's midpoint. */
  updateEdgeData: (
    edgeId: string,
    patch: NonNullable<WorkflowEdge["data"]>
  ) => void;

  /** Selection */
  selectNode: (id: string | null) => void;

  /** Mutations */
  addNodeFromPalette: (typeKey: string, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, patch: Partial<WorkflowNodeData>) => void;
  /** Patch a value on a node by dot-path within `data` (e.g. "config.model"). */
  setNodeFieldByPath: (id: string, path: string, value: unknown) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;

  /** Replace the whole document (for load/import). */
  replaceDoc: (doc: WorkflowDoc) => void;
  /** Update the document's display name. */
  setDocName: (name: string) => void;

  /** Persistence — sends PUT /api/workflows/{id} to the backend. */
  save: () => Promise<{ ok: boolean; issues: ValidationIssue[]; error?: string }>;
  exportToFile: () => void;
  importFromFile: (file: File) => Promise<{ ok: boolean; error?: string }>;
  resetToEmpty: () => void;

  /* React-Flow-shaped derived getters (computed in component for now). */
  getRFNodes: () => Node<WorkflowNodeData>[];
  getRFEdges: () => Edge[];
}

/** Pick a default name that doesn't collide with anything already on the
 *  index — used when minting a fresh workflow. */
function uniqueWorkflowName(taken: Set<string>): string {
  const base = "Untitled workflow";
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

function describeApiError(e: unknown, prefix: string): string {
  if (e instanceof WorkflowApiError) {
    if (e.code === "NOT_FOUND") return `${prefix} — workflow not found.`;
    if (e.code === "CONFLICT")
      return `${prefix} — the workflow was modified elsewhere. Reload and try again.`;
    return `${prefix}: ${e.message}`;
  }
  return `${prefix}: ${e instanceof Error ? e.message : String(e)}`;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Synchronous default — the editor opens with a blank canvas while
  // `bootstrap()` fetches the list and (optionally) loads the most recent
  // workflow from the backend.
  doc: createEmptyWorkflow(),
  selectedNodeId: null,
  lastSavedAt: null,
  saveError: null,
  runOpen: false,
  openRun: () => set({ runOpen: true }),
  closeRun: () => set({ runOpen: false }),

  variablesOpen: false,
  openVariables: () => set({ variablesOpen: true }),
  closeVariables: () => set({ variablesOpen: false }),

  workflowsListOpen: false,
  workflowsIndex: [],
  bootstrapping: false,

  openWorkflowsList: () => {
    set({ workflowsListOpen: true });
    // Fire-and-forget refresh so the modal shows the latest from the backend.
    void get().refreshWorkflowsIndex();
  },
  closeWorkflowsList: () => set({ workflowsListOpen: false }),

  refreshWorkflowsIndex: async () => {
    try {
      const summaries = await apiListWorkflows();
      // GET /api/workflows returns `meta.name`, which lags a rename — PUT
      // only persists the doc body, not metadata. Override the active
      // workflow's entry with the live `doc.name` so the autosuggest /
      // modal / CURRENT badge stay consistent with the header.
      const doc = get().doc;
      const patched = summaries.map((s) =>
        s.id === doc.id ? { ...s, name: doc.name } : s
      );
      set({ workflowsIndex: patched });
    } catch (e) {
      console.warn("[workflows] failed to refresh index", e);
    }
  },

  /** On app load we hydrate the workflows index so the Open modal works,
   *  but we don't auto-load anything — the editor stays on the freshly
   *  minted blank canvas from `createEmptyWorkflow()` until the user
   *  explicitly opens one. First Save POSTs; subsequent saves PUT. */
  bootstrap: async () => {
    if (get().bootstrapping) return;
    set({ bootstrapping: true });
    try {
      const summaries = await apiListWorkflows();
      set({ workflowsIndex: summaries });
    } catch (e) {
      console.warn("[workflows] bootstrap failed", e);
    } finally {
      set({ bootstrapping: false });
    }
  },

  /** Local-only — swap the canvas for a fresh empty workflow with a new
   *  id. Nothing is sent to the backend until the user clicks Save (which
   *  routes to POST for first-time saves). */
  createNewWorkflow: async () => {
    const taken = new Set(get().workflowsIndex.map((s) => s.name));
    const doc = createEmptyWorkflow();
    doc.name = uniqueWorkflowName(taken);
    set({
      doc,
      selectedNodeId: null,
      saveError: null,
      lastSavedAt: null,
      workflowsListOpen: false,
    });
    return { ok: true };
  },

  switchWorkflow: async (id) => {
    try {
      const response = await apiGetWorkflow(id);
      // The doc body is the source of truth for the display name —
      // `meta.name` can lag if a rename was saved via PUT and the backend
      // didn't mirror it into metadata.
      const summary: WorkflowSummary = {
        id: response.doc.id,
        name: response.doc.name,
        updatedAt: Date.parse(response.meta.updated_at) || Date.now(),
      };
      set((s) => ({
        doc: response.doc,
        selectedNodeId: null,
        saveError: null,
        lastSavedAt: Date.parse(response.meta.updated_at) || null,
        workflowsListOpen: false,
        workflowsIndex: s.workflowsIndex.some((w) => w.id === summary.id)
          ? s.workflowsIndex.map((w) => (w.id === summary.id ? summary : w))
          : [summary, ...s.workflowsIndex],
      }));
      return { ok: true };
    } catch (e) {
      const message = describeApiError(e, "Could not load workflow");
      set({ saveError: message });
      return { ok: false, error: message };
    }
  },

  deleteWorkflowFromIndex: async (id) => {
    try {
      await apiDeleteWorkflow(id);
    } catch (e) {
      const message = describeApiError(e, "Could not delete workflow");
      set({ saveError: message });
      return { ok: false, error: message };
    }

    const wasActive = get().doc.id === id;
    set((s) => ({
      workflowsIndex: s.workflowsIndex.filter((w) => w.id !== id),
    }));

    if (!wasActive) return { ok: true };
    const remaining = get().workflowsIndex;
    if (remaining.length > 0) {
      // Most recent → first since the index is sorted that way by the API.
      void get().switchWorkflow(remaining[0].id);
    } else {
      void get().createNewWorkflow();
    }
    return { ok: true };
  },

  addFlowVariable: () => {
    set((s) => {
      const existing = s.doc.flowVariables;
      // Generate a unique default name `flow_var`, `flow_var_2`, etc.
      const base = "flow_var";
      const taken = new Set(existing.map((v) => v.name));
      let name = base;
      let i = 2;
      while (taken.has(name)) {
        name = `${base}_${i}`;
        i++;
      }
      const next: FlowVariable = {
        id: `fv_${nanoid(8)}`,
        name,
        description: "",
        type: "string",
      };
      return {
        doc: { ...s.doc, flowVariables: [next, ...existing] },
      };
    });
  },

  updateFlowVariable: (id, patch) => {
    set((s) => ({
      doc: {
        ...s.doc,
        flowVariables: s.doc.flowVariables.map((v) =>
          v.id === id ? { ...v, ...patch } : v
        ),
      },
    }));
  },

  removeFlowVariable: (id) => {
    set((s) => ({
      doc: {
        ...s.doc,
        flowVariables: s.doc.flowVariables.filter((v) => v.id !== id),
      },
    }));
  },

  applyNodeChanges: (changes) => {
    // The Start node is the workflow entry point and must always exist.
    // Drop any 'remove' change targeting it before delegating to RF.
    const docNodes = get().doc.nodes;
    const filtered = changes.filter((c) => {
      if (c.type !== "remove") return true;
      const n = docNodes.find((dn) => dn.id === c.id);
      return !(n && n.data.type === "start");
    });
    if (filtered.length === 0) return;
    const rf = applyNodeChanges(filtered, toRFNodes(docNodes));
    set((s) => ({ doc: { ...s.doc, nodes: fromRFNodes(rf as Node<WorkflowNodeData>[]) } }));
  },

  applyEdgeChanges: (changes) => {
    const rf = applyEdgeChanges(changes, toRFEdges(get().doc.edges));
    set((s) => ({ doc: { ...s.doc, edges: fromRFEdges(rf) } }));
  },

  connect: (connection) => {
    if (!connection.source || !connection.target) return;
    const newEdge: WorkflowEdge = {
      id: `edge_${nanoid(8)}`,
      source: connection.source,
      sourceHandle: connection.sourceHandle ?? null,
      target: connection.target,
      targetHandle: connection.targetHandle ?? null,
    };
    set((s) => ({ doc: { ...s.doc, edges: [...s.doc.edges, newEdge] } }));
  },

  updateEdgeConnection: (oldEdge, newConnection) => {
    if (!newConnection.source || !newConnection.target) return;
    set((s) => {
      const next = rfUpdateEdge(
        oldEdge,
        newConnection,
        toRFEdges(s.doc.edges),
        // Keep the original edge id so external references stay valid
        // (HandoffListField looks up edges by source + sourceHandle).
        { shouldReplaceId: false }
      );
      return { doc: { ...s.doc, edges: fromRFEdges(next) } };
    });
  },

  updateEdgeData: (edgeId, patch) => {
    set((s) => ({
      doc: {
        ...s.doc,
        edges: s.doc.edges.map((e) =>
          e.id === edgeId
            ? { ...e, data: { ...(e.data ?? {}), ...patch } }
            : e
        ),
      },
    }));
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  addNodeFromPalette: (typeKey, position) => {
    const def = nodeRegistry[typeKey];
    if (!def) return;
    const name = uniqueName(def.defaultNamePrefix, get().doc.nodes);
    const node: WorkflowNode = {
      id: `node_${nanoid(8)}`,
      type: "dynamic",
      position,
      data: {
        type: def.type,
        name,
        description: "",
        config: structuredClone(def.defaultConfig),
        inputs: {},
        outputs: {},
        advanced: {},
      },
    };
    set((s) => ({
      doc: { ...s.doc, nodes: [...s.doc.nodes, node] },
      selectedNodeId: node.id,
    }));
  },

  updateNodeData: (id, patch) => {
    set((s) => ({
      doc: {
        ...s.doc,
        nodes: s.doc.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
        ),
      },
    }));
  },

  setNodeFieldByPath: (id, path, value) => {
    set((s) => ({
      doc: {
        ...s.doc,
        nodes: s.doc.nodes.map((n) => {
          if (n.id !== id) return n;
          const nextData = structuredClone(n.data);
          setByPath(nextData as unknown as Record<string, unknown>, path, value);
          return { ...n, data: nextData };
        }),
      },
    }));
  },

  removeNode: (id) => {
    set((s) => {
      const target = s.doc.nodes.find((n) => n.id === id);
      if (!target || target.data.type === "start") return s;
      return {
        doc: {
          ...s.doc,
          nodes: s.doc.nodes.filter((n) => n.id !== id),
          edges: s.doc.edges.filter((e) => e.source !== id && e.target !== id),
        },
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      };
    });
  },

  removeEdge: (id) => {
    set((s) => ({
      doc: { ...s.doc, edges: s.doc.edges.filter((e) => e.id !== id) },
    }));
  },

  replaceDoc: (doc) =>
    set({ doc, selectedNodeId: null, saveError: null }),

  setDocName: (name) =>
    set((s) => ({ doc: { ...s.doc, name } })),

  save: async () => {
    const doc = get().doc;
    const result = validateWorkflow(doc);
    if (!result.ok) {
      const summary = result.issues.map((i) => i.message).join("\n• ");
      const message = `Cannot save — workflow is invalid:\n• ${summary}`;
      set({ saveError: message });
      return { ok: false, issues: result.issues };
    }

    // First-time save → POST. Subsequent saves → PUT. The presence of the
    // doc's id in the in-memory index is the source of truth — it's
    // refreshed from the backend on bootstrap, switch, and after any save.
    const isPersisted = get().workflowsIndex.some((w) => w.id === doc.id);

    try {
      const response = isPersisted
        ? await apiUpdateWorkflow(doc.id, doc, doc.version)
        : await apiCreateWorkflow(doc);

      // Adopt the server's canonical id + version, but keep all the local
      // doc fields (including React Flow runtime measurements on nodes) so
      // the canvas doesn't have to re-measure after every save.
      const nextDoc: WorkflowDoc = {
        ...doc,
        id: response.doc.id,
        version: response.meta.current_version,
      };
      // Build the index summary from the doc we just saved — its `name` is
      // what the user sees in the header. `response.meta.name` can lag the
      // rename if the backend doesn't mirror it.
      const summary: WorkflowSummary = {
        id: nextDoc.id,
        name: nextDoc.name,
        updatedAt: Date.parse(response.meta.updated_at) || Date.now(),
      };
      set((s) => ({
        doc: nextDoc,
        lastSavedAt: Date.now(),
        saveError: null,
        workflowsIndex: s.workflowsIndex.some((w) => w.id === summary.id)
          ? s.workflowsIndex.map((w) => (w.id === summary.id ? summary : w))
          : [summary, ...s.workflowsIndex],
      }));
      return { ok: true, issues: [] };
    } catch (e) {
      const message =
        e instanceof WorkflowApiError
          ? e.code === "CONFLICT"
            ? `Could not save — the workflow was modified elsewhere. Reload and try again.`
            : `Could not save: ${e.message}`
          : `Could not save: ${e instanceof Error ? e.message : String(e)}`;
      set({ saveError: message });
      return { ok: false, issues: [], error: message };
    }
  },

  exportToFile: () => {
    exportWorkflowToFile(get().doc);
  },

  importFromFile: async (file) => {
    const result = await importWorkflowFromFile(file);
    if (!result.ok || !result.doc) {
      set({ saveError: result.error ?? "Import failed." });
      return { ok: false, error: result.error };
    }
    set({
      doc: result.doc,
      selectedNodeId: null,
      saveError: null,
      lastSavedAt: null,
    });
    return { ok: true };
  },

  resetToEmpty: () => {
    set({
      doc: createEmptyWorkflow(),
      selectedNodeId: null,
      saveError: null,
      lastSavedAt: null,
    });
  },

  getRFNodes: () => toRFNodes(get().doc.nodes),
  getRFEdges: () => toRFEdges(get().doc.edges),
}));

/** Convenience selector: the currently selected workflow node, if any. */
export const selectSelectedNode = (s: WorkflowState): WorkflowNode | null =>
  s.selectedNodeId
    ? s.doc.nodes.find((n) => n.id === s.selectedNodeId) ?? null
    : null;
