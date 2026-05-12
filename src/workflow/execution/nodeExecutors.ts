/**
 * One mock executor per node type. Pure functions that take a node + the
 * current runtime context and return either a synchronous `done` result
 * (with an optional `nextHandle` to pick a branch and optional context
 * patches) or a `pause` envelope when the node needs human interaction.
 *
 * **All executors are demos.** No real LLMs are called, no real HTTP
 * requests fire, no real script sandbox is used. The Script node does
 * call `new Function`, mirroring the Phase 4 ScriptRunner — guarded by
 * the same "demo only" caveat.
 */

import type { WorkflowNode } from "@/workflow/types";
import { sanitizeHtml } from "@/utils/sanitizeHtml";
import {
  resolveDeep,
  resolveString,
  resolveValue,
  type VariableContext,
} from "./resolveVariables";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface AwaitingInput {
  kind: "humanInput" | "approval";
  nodeId: string;
  nodeName: string;
  prompt: string;
}

export interface StateUpdate {
  /** Dot-path inside the runtime context (e.g. "system.humanInput"). */
  path: string;
  value: unknown;
}

export type ExecutorResult =
  | {
      kind: "done";
      result: unknown;
      /** Selects the source handle when the node has more than one. */
      nextHandle?: string;
      /** Optional patches into the runtime context (Variable Update). */
      stateUpdates?: StateUpdate[];
    }
  | { kind: "pause"; awaiting: AwaitingInput };

export interface ExecuteContext {
  ctx: VariableContext;
  node: WorkflowNode;
}

export type NodeExecutor = (ec: ExecuteContext) => ExecutorResult;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface RuleCondition {
  field: string;
  operator: string;
  value: string;
  joiner?: "AND" | "OR";
}

interface RuleBlock {
  id: string;
  kind: "if" | "elseIf" | "else";
  label?: string;
  conditions: RuleCondition[];
}

interface MappingRow {
  key: string;
  type?: string;
  value: string;
  operation?: "set" | "append" | "merge" | "increment" | "remove";
}

function evaluateCondition(c: RuleCondition, ctx: VariableContext): boolean {
  const left = resolveValue(c.field, ctx);
  const right = resolveValue(c.value, ctx);
  switch (c.operator) {
    case "equals":
      return String(left ?? "") === String(right ?? "");
    case "not_equals":
      return String(left ?? "") !== String(right ?? "");
    case "contains":
      return String(left ?? "").includes(String(right ?? ""));
    case "greater_than":
      return Number(left) > Number(right);
    case "less_than":
      return Number(left) < Number(right);
    case "exists":
      return left !== null && left !== undefined && left !== "";
    case "empty":
      return (
        left === null ||
        left === undefined ||
        left === "" ||
        (Array.isArray(left) && left.length === 0)
      );
    default:
      return false;
  }
}

function evaluateConditions(
  conditions: RuleCondition[] | undefined,
  ctx: VariableContext
): boolean {
  if (!conditions || conditions.length === 0) return true;
  let acc = evaluateCondition(conditions[0], ctx);
  for (let i = 1; i < conditions.length; i++) {
    const cur = evaluateCondition(conditions[i], ctx);
    acc = conditions[i].joiner === "OR" ? acc || cur : acc && cur;
  }
  return acc;
}

function asConfig(node: WorkflowNode): Record<string, unknown> {
  return (node.data.config ?? {}) as Record<string, unknown>;
}

function asAdvanced(node: WorkflowNode): Record<string, unknown> {
  return (node.data.advanced ?? {}) as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Executors                                                           */
/* ------------------------------------------------------------------ */

const start: NodeExecutor = () => ({
  kind: "done",
  result: { startedAt: new Date().toISOString() },
});

const llm: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const adv = asAdvanced(node);
  const model = String(cfg.model ?? "mock-model");
  const userQuery = resolveString(String(cfg.userQuery ?? ""), ctx);
  const instructions = resolveString(String(cfg.instructions ?? ""), ctx);
  const responseFormat = String(adv.responseFormat ?? "text");
  const answer =
    responseFormat === "json"
      ? { mock: true, model, query: userQuery }
      : `Mock LLM (${model}) response${userQuery ? ` for: ${userQuery}` : ""}.`;
  return { kind: "done", result: { model, answer, instructions } };
};

const agent: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const model = String(cfg.model ?? "mock-model");
  const strategy = String(cfg.strategy ?? "ReAct");
  const tools = Array.isArray(cfg.tools) ? (cfg.tools as string[]) : [];
  const userQuery = resolveString(String(cfg.userQuery ?? ""), ctx);
  return {
    kind: "done",
    result: {
      model,
      strategy,
      toolsUsed: tools.slice(0, 3),
      answer: `Mock Agent (${model}, ${strategy}) handled${userQuery ? `: ${userQuery}` : " the request."}`,
    },
  };
};

const externalAgent: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  return {
    kind: "done",
    result: {
      mock: true,
      endpoint: cfg.endpoint,
      response: `Mock external agent response for ${resolveString(String(cfg.endpoint ?? ""), ctx) || "<no endpoint>"}`,
    },
  };
};

const script: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const code = String(cfg.code ?? "");
  // Build the input object from the most recent node result, falling back
  // to system variables. Demo-only — real scripts would receive a typed
  // payload assembled per the schema.
  const lastNode = lastResult(ctx);
  const input = (typeof lastNode === "object" && lastNode !== null)
    ? lastNode
    : { ...ctx.system };

  // eslint-disable-next-line no-new-func
  const fn = new Function("input", code);
  const result = fn(input);
  return { kind: "done", result };
};

const http: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const url = resolveString(String(cfg.url ?? ""), ctx);
  const method = String(cfg.method ?? "GET");
  return {
    kind: "done",
    result: {
      mock: true,
      url,
      method,
      status: 200,
      headers: { "content-type": "application/json" },
      body: { mock: true, source: url, method },
    },
  };
};

const guardrail: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const rules = Array.isArray(cfg.rules) ? (cfg.rules as RuleCondition[]) : [];
  const reasonExpr = String(cfg.reasonExpression ?? "");
  const passed = evaluateConditions(rules, ctx);
  if (passed) {
    return { kind: "done", result: { allowed: true }, nextHandle: "allow" };
  }
  const reason =
    resolveString(reasonExpr, ctx) || "Blocked by guardrail rules.";
  return {
    kind: "done",
    result: { allowed: false, reason },
    nextHandle: "block",
  };
};

const rule: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const blocks = Array.isArray(cfg.blocks) ? (cfg.blocks as RuleBlock[]) : [];

  for (const b of blocks) {
    if (b.kind === "else") continue;
    if (evaluateConditions(b.conditions, ctx)) {
      return {
        kind: "done",
        result: { matched: b.id, label: b.label ?? b.id },
        nextHandle: b.id,
      };
    }
  }
  const elseBlock = blocks.find((b) => b.kind === "else");
  return {
    kind: "done",
    result: {
      matched: elseBlock?.id ?? "else",
      label: elseBlock?.label ?? "else",
    },
    nextHandle: elseBlock?.id ?? "else",
  };
};

const subFlow: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const inputMapping = Array.isArray(cfg.inputMapping)
    ? (cfg.inputMapping as MappingRow[])
    : [];
  const inputs: Record<string, unknown> = {};
  for (const m of inputMapping) {
    if (!m.key) continue;
    inputs[m.key] = resolveValue(m.value, ctx);
  }
  return {
    kind: "done",
    result: {
      mock: true,
      application: cfg.application,
      module: cfg.module,
      agentId: cfg.agentId,
      inputs,
      response: "Mock sub-flow response",
    },
  };
};

const variableUpdate: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const condition = String(cfg.runOnlyWhen ?? "").trim();
  if (condition) {
    const v = resolveValue(condition, ctx);
    if (!v) {
      return { kind: "done", result: { skipped: true, reason: "condition false" } };
    }
  }
  const updates = Array.isArray(cfg.updates) ? (cfg.updates as MappingRow[]) : [];
  const applied: Array<{ path: string; operation: string; value: unknown }> = [];
  const stateUpdates: StateUpdate[] = [];
  for (const u of updates) {
    if (!u.key) continue;
    const value = resolveDeep(u.value, ctx);
    const op = u.operation ?? "set";
    // For the demo, every operation collapses to a final value at the path.
    // A production executor would distinguish append/merge/increment/remove
    // against the resolved current value.
    stateUpdates.push({ path: u.key, value });
    applied.push({ path: u.key, operation: op, value });
  }
  return {
    kind: "done",
    result: { applied },
    stateUpdates,
  };
};

const uiView: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const template = String(cfg.html ?? "");
  const sanitize = cfg.sanitize !== false;
  const resolved = resolveString(template, ctx);
  const html = sanitize ? sanitizeHtml(resolved) : resolved;
  // The `kind: "ui-view"` marker tells the RunPanel to render the HTML
  // inside a sandboxed iframe instead of dumping it as JSON.
  return {
    kind: "done",
    result: {
      kind: "ui-view",
      html,
      sanitized: sanitize,
    },
  };
};

const output: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const mappings = Array.isArray(cfg.mappings)
    ? (cfg.mappings as MappingRow[])
    : [];
  const out: Record<string, unknown> = {};
  for (const m of mappings) {
    if (!m.key) continue;
    out[m.key] = resolveValue(m.value, ctx);
  }
  return {
    kind: "done",
    result: { output: out, renderImages: !!cfg.renderImages },
  };
};

const approval: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const message = resolveString(String(cfg.message ?? ""), ctx);
  return {
    kind: "pause",
    awaiting: {
      kind: "approval",
      nodeId: node.id,
      nodeName: node.data.name,
      prompt: message || "Approve to continue?",
    },
  };
};

const humanInput: NodeExecutor = ({ node, ctx }) => {
  const cfg = asConfig(node);
  const question = resolveString(String(cfg.question ?? ""), ctx);
  return {
    kind: "pause",
    awaiting: {
      kind: "humanInput",
      nodeId: node.id,
      nodeName: node.data.name,
      prompt: question || "Please provide input to continue.",
    },
  };
};

/** Pull the most recently produced node result from the runtime ctx. */
function lastResult(ctx: VariableContext): unknown {
  const entries = Object.entries(ctx.nodes);
  if (entries.length === 0) return null;
  return entries[entries.length - 1][1].result;
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export const nodeExecutors: Record<string, NodeExecutor> = {
  start,
  llm,
  agent,
  externalAgent,
  script,
  http,
  guardrail,
  rule,
  subFlow,
  variableUpdate,
  uiView,
  output,
  approval,
  humanInput,
};
