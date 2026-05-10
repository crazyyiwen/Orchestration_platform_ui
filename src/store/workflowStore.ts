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
  loadFromLocalStorage,
  saveToLocalStorage,
} from "@/workflow/storage";
import {
  validateWorkflow,
  type ValidationIssue,
} from "@/workflow/validation";
import type {
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

  /** Persistence */
  save: () => { ok: boolean; issues: ValidationIssue[] };
  exportToFile: () => void;
  importFromFile: (file: File) => Promise<{ ok: boolean; error?: string }>;
  resetToEmpty: () => void;

  /* React-Flow-shaped derived getters (computed in component for now). */
  getRFNodes: () => Node<WorkflowNodeData>[];
  getRFEdges: () => Edge[];
}

/** Resolve the initial doc — restore from localStorage when available. */
function resolveInitialDoc(): WorkflowDoc {
  return loadFromLocalStorage() ?? createEmptyWorkflow();
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  doc: resolveInitialDoc(),
  selectedNodeId: null,
  lastSavedAt: null,
  saveError: null,
  runOpen: false,
  openRun: () => set({ runOpen: true }),
  closeRun: () => set({ runOpen: false }),

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

  save: () => {
    const doc = get().doc;
    const result = validateWorkflow(doc);
    if (!result.ok) {
      const summary = result.issues.map((i) => i.message).join("\n• ");
      const message = `Cannot save — workflow is invalid:\n• ${summary}`;
      set({ saveError: message });
      return { ok: false, issues: result.issues };
    }
    saveToLocalStorage(doc);
    set({ lastSavedAt: Date.now(), saveError: null });
    return { ok: true, issues: [] };
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
