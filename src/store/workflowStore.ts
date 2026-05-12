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
  bootstrapInitialDoc,
  deleteSavedWorkflow,
  exportWorkflowToFile,
  importWorkflowFromFile,
  listSavedWorkflows,
  loadSavedWorkflow,
  setActiveWorkflowId,
  type WorkflowSummary,
} from "@/workflow/storage";
import {
  apiCreateWorkflow,
  apiUpdateWorkflow,
  WorkflowApiError,
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

  /** Multi-workflow management. */
  workflowsListOpen: boolean;
  workflowsIndex: WorkflowSummary[];
  openWorkflowsList: () => void;
  closeWorkflowsList: () => void;
  refreshWorkflowsIndex: () => void;
  /** Replace the current doc with a new empty workflow (auto-unique name).
   *  Persists the new workflow to the backend via POST /api/workflows. */
  createNewWorkflow: () => Promise<{ ok: boolean; error?: string }>;
  /** Replace the current doc with the saved workflow at `id`. */
  switchWorkflow: (id: string) => void;
  /** Delete a saved workflow. If it was the active one, falls through to
   *  another saved workflow or a fresh empty one. */
  deleteWorkflowFromIndex: (id: string) => void;

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

/** Resolve the initial doc — restore from localStorage when available. */
function resolveInitialDoc(): WorkflowDoc {
  return bootstrapInitialDoc();
}

/** Pick a default name that doesn't collide with anything already saved. */
function uniqueWorkflowName(taken: Set<string>): string {
  const base = "Untitled workflow";
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  doc: resolveInitialDoc(),
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
  workflowsIndex: listSavedWorkflows(),
  openWorkflowsList: () =>
    set({ workflowsListOpen: true, workflowsIndex: listSavedWorkflows() }),
  closeWorkflowsList: () => set({ workflowsListOpen: false }),
  refreshWorkflowsIndex: () => set({ workflowsIndex: listSavedWorkflows() }),

  createNewWorkflow: async () => {
    const taken = new Set(listSavedWorkflows().map((s) => s.name));
    const doc = createEmptyWorkflow();
    doc.name = uniqueWorkflowName(taken);

    try {
      const response = await apiCreateWorkflow(doc);
      // The backend may rewrite the workflow_id (e.g., normalize casing); trust
      // its echoed doc as the source of truth so subsequent PUTs target the
      // record we just created.
      const persisted = response.doc;
      setActiveWorkflowId(persisted.id);
      set({
        doc: persisted,
        selectedNodeId: null,
        saveError: null,
        lastSavedAt: Date.now(),
        workflowsListOpen: false,
        workflowsIndex: listSavedWorkflows(),
      });
      return { ok: true };
    } catch (e) {
      const message =
        e instanceof WorkflowApiError
          ? `Could not create workflow: ${e.message}`
          : `Could not create workflow: ${
              e instanceof Error ? e.message : String(e)
            }`;
      set({ saveError: message });
      return { ok: false, error: message };
    }
  },

  switchWorkflow: (id) => {
    const doc = loadSavedWorkflow(id);
    if (!doc) return;
    setActiveWorkflowId(id);
    set({
      doc,
      selectedNodeId: null,
      saveError: null,
      lastSavedAt: null,
      workflowsListOpen: false,
      workflowsIndex: listSavedWorkflows(),
    });
  },

  deleteWorkflowFromIndex: (id) => {
    const wasActive = get().doc.id === id;
    deleteSavedWorkflow(id);
    set({ workflowsIndex: listSavedWorkflows() });
    if (!wasActive) return;

    const remaining = listSavedWorkflows();
    if (remaining.length > 0) {
      get().switchWorkflow(remaining[0].id);
    } else {
      void get().createNewWorkflow();
    }
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

    try {
      const response = await apiUpdateWorkflow(doc.id, doc, doc.version);
      // Bump the local doc version to match what the server returned so the
      // next save's If-Match header lines up.
      const nextDoc: WorkflowDoc = {
        ...doc,
        version: response.meta.current_version,
      };
      setActiveWorkflowId(nextDoc.id);
      set({
        doc: nextDoc,
        lastSavedAt: Date.now(),
        saveError: null,
        workflowsIndex: listSavedWorkflows(),
      });
      return { ok: true, issues: [] };
    } catch (e) {
      const message =
        e instanceof WorkflowApiError
          ? e.code === "NOT_FOUND"
            ? `Could not save — this workflow does not exist on the server yet. Create it first.`
            : e.code === "CONFLICT"
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
    setActiveWorkflowId(null);
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
