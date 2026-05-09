/**
 * Workflow runtime — Phase 7 simulation.
 *
 * Two entry points:
 *   - `startExecution(doc, seed)` — initialises a `RuntimeState`, finds the
 *     Start node, and traverses until the workflow finishes, errors, or
 *     pauses (Human Input / Approval).
 *   - `resumeExecution(doc, state, response)` — applies the user's response
 *     to the awaiting node, then continues traversal.
 *
 * Traversal picks the next edge by matching `(edge.sourceHandle ?? "out")`
 * against the executor's `nextHandle`. Rule and Guardrail nodes return
 * branch handle ids; Approval, after resume, returns "approved" or
 * "rejected". Output nodes terminate the run with their result as the
 * workflow's `output`.
 */

import type { WorkflowDoc, WorkflowEdge, WorkflowNode } from "@/workflow/types";
import { setByPath } from "@/workflow/execution/setByPath";
import {
  nodeExecutors,
  type AwaitingInput,
  type ExecutorResult,
  type StateUpdate,
} from "./nodeExecutors";
import type { VariableContext } from "./resolveVariables";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type RunStatus =
  | "idle"
  | "running"
  | "paused"
  | "finished"
  | "error";

export interface LogEntry {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  ts: number;
  /** Present when the node finished synchronously. */
  result?: unknown;
  /** Present when the node paused. */
  pause?: AwaitingInput["kind"];
  /** Present when the node errored. */
  error?: string;
  /** When the node has multiple outputs, which handle was followed. */
  nextHandle?: string;
}

export interface RuntimeState {
  ctx: VariableContext;
  log: LogEntry[];
  status: RunStatus;
  /** Node currently being executed, or about to be. */
  currentNodeId: string | null;
  /** Set when `status === 'paused'`. */
  awaiting: AwaitingInput | null;
  /** Final Output node result. */
  output: unknown;
  error: string | null;
}

export type RunTick =
  | { kind: "finished"; state: RuntimeState }
  | { kind: "paused"; state: RuntimeState }
  | { kind: "error"; state: RuntimeState };

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function makeInitialState(seed?: { userQuery?: string }): RuntimeState {
  return {
    ctx: {
      system: {
        userQuery: seed?.userQuery ?? "",
        attachments: [],
        files: [],
        humanInput: "",
      },
      runtime: {
        workflowMetaData: { workflowId: "", agentName: "" },
      },
      nodes: {},
    },
    log: [],
    status: "idle",
    currentNodeId: null,
    awaiting: null,
    output: undefined,
    error: null,
  };
}

export function startExecution(
  doc: WorkflowDoc,
  seed?: { userQuery?: string }
): RunTick {
  const state = makeInitialState(seed);
  state.ctx.runtime.workflowMetaData.workflowId = doc.id;
  state.ctx.runtime.workflowMetaData.agentName = doc.name;

  const startNode = doc.nodes.find((n) => n.data.type === "start");
  if (!startNode) {
    return finishWithError(state, "No Start node found.");
  }
  state.currentNodeId = startNode.id;
  state.status = "running";
  return tick(doc, state);
}

export function resumeExecution(
  doc: WorkflowDoc,
  state: RuntimeState,
  response: string
): RunTick {
  if (state.status !== "paused" || !state.awaiting) {
    return { kind: "error", state: { ...state, status: "error", error: "Not paused." } };
  }

  const node = doc.nodes.find((n) => n.id === state.awaiting!.nodeId);
  if (!node) {
    return finishWithError(state, "Awaiting node not found.");
  }

  if (state.awaiting.kind === "humanInput") {
    const cfg = (node.data.config ?? {}) as Record<string, unknown>;
    const saveAs = String(cfg.saveResponseAs ?? "system.humanInput");
    setByPath(state.ctx as unknown as Record<string, unknown>, saveAs, response);

    state.ctx.nodes[node.data.name] = { result: { response } };
    state.log.push({
      nodeId: node.id,
      nodeName: node.data.name,
      nodeType: node.data.type,
      ts: Date.now(),
      result: { response },
    });
    state.awaiting = null;
    state.status = "running";
    state.currentNodeId = followEdge(doc, node, "out");
    return tick(doc, state);
  }

  // Approval: response is "approved" or "rejected".
  const decision =
    response.toLowerCase() === "rejected" ? "rejected" : "approved";
  state.ctx.nodes[node.data.name] = { result: { decision } };
  state.log.push({
    nodeId: node.id,
    nodeName: node.data.name,
    nodeType: node.data.type,
    ts: Date.now(),
    result: { decision },
    nextHandle: decision,
  });
  state.awaiting = null;
  state.status = "running";
  state.currentNodeId = followEdge(doc, node, decision);
  return tick(doc, state);
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

const MAX_STEPS = 100;

function tick(doc: WorkflowDoc, state: RuntimeState): RunTick {
  let steps = 0;
  while (state.currentNodeId && steps < MAX_STEPS) {
    steps++;
    const node = doc.nodes.find((n) => n.id === state.currentNodeId);
    if (!node) {
      return finishWithError(state, `Node ${state.currentNodeId} not found.`);
    }

    const exec = nodeExecutors[node.data.type];
    if (!exec) {
      return finishWithError(
        state,
        `No executor for node type "${node.data.type}".`
      );
    }

    let result: ExecutorResult;
    try {
      result = exec({ ctx: state.ctx, node });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      state.log.push({
        nodeId: node.id,
        nodeName: node.data.name,
        nodeType: node.data.type,
        ts: Date.now(),
        error: msg,
      });
      return finishWithError(state, `${node.data.name}: ${msg}`);
    }

    if (result.kind === "pause") {
      state.status = "paused";
      state.awaiting = result.awaiting;
      state.log.push({
        nodeId: node.id,
        nodeName: node.data.name,
        nodeType: node.data.type,
        ts: Date.now(),
        pause: result.awaiting.kind,
      });
      return { kind: "paused", state };
    }

    // Done — record result, apply state updates, advance.
    state.ctx.nodes[node.data.name] = { result: result.result };
    if (result.stateUpdates) {
      applyStateUpdates(state, result.stateUpdates);
    }
    state.log.push({
      nodeId: node.id,
      nodeName: node.data.name,
      nodeType: node.data.type,
      ts: Date.now(),
      result: result.result,
      nextHandle: result.nextHandle,
    });

    if (node.data.type === "output") {
      const r = result.result as { output?: unknown };
      state.output = r?.output ?? result.result;
      state.status = "finished";
      state.currentNodeId = null;
      return { kind: "finished", state };
    }

    state.currentNodeId = followEdge(doc, node, result.nextHandle ?? "out");
  }

  if (steps >= MAX_STEPS) {
    return finishWithError(
      state,
      `Maximum step count (${MAX_STEPS}) reached. Possible loop.`
    );
  }

  // Walked off the graph cleanly.
  state.status = "finished";
  return { kind: "finished", state };
}

function followEdge(
  doc: WorkflowDoc,
  node: WorkflowNode,
  handle: string
): string | null {
  const edge = doc.edges.find(
    (e: WorkflowEdge) =>
      e.source === node.id && (e.sourceHandle ?? "out") === handle
  );
  return edge?.target ?? null;
}

function applyStateUpdates(state: RuntimeState, updates: StateUpdate[]) {
  for (const u of updates) {
    setByPath(state.ctx as unknown as Record<string, unknown>, u.path, u.value);
  }
}

function finishWithError(state: RuntimeState, error: string): RunTick {
  state.status = "error";
  state.error = error;
  state.currentNodeId = null;
  return { kind: "error", state };
}
