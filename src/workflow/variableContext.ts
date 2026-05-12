/**
 * Dynamic variable reference system.
 *
 * The workflow supports `{{...}}` references that resolve against three
 * scopes:
 *   - `system.*` — values supplied by the runtime (userQuery, attachments,
 *     files, humanInput).
 *   - `runtime.workflowMetaData.*` — workflow-level metadata.
 *   - `nodes.<nodeName>.result.<field>` — the result of a previously
 *     executed node, keyed by the node's user-facing name (not its id).
 *
 * This module owns:
 *   1. The shape of the runtime context against which references resolve.
 *   2. The resolver (used by Phase 6 execution).
 *   3. The "available variables" introspection used by the picker — this
 *      walks the *current* workflow doc and lists every variable a user
 *      could insert into a field.
 */

import { getByPath } from "@/utils/path";
import type { WorkflowDoc } from "./types";

/* ------------------------------------------------------------------ */
/* Runtime context                                                     */
/* ------------------------------------------------------------------ */

export interface VariableContext {
  system: {
    userQuery: string;
    attachments: unknown[];
    files: unknown[];
    humanInput: string;
  };
  runtime: {
    workflowMetaData: {
      workflowId: string;
      agentName: string;
    };
  };
  /** Populated as nodes execute. Keyed by node `data.name`. */
  nodes: Record<string, { result?: unknown }>;
  /** User-defined flow-scoped state, keyed by FlowVariable.name. Seeded from
   *  `doc.flowVariables.defaultValue` at execution start; mutable through
   *  Variable Update nodes. */
  flow: Record<string, unknown>;
}

const VAR_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Match a template that is *only* a single `{{path}}` reference. */
const SINGLE_PATTERN = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

/** Replace each `{{path}}` segment with the resolved value as a string. */
export function resolveString(template: string, ctx: VariableContext): string {
  return template.replace(VAR_PATTERN, (_, rawPath) => {
    const value = getByPath<unknown>(ctx, String(rawPath).trim());
    if (value == null) return "";
    return typeof value === "string" ? value : safeStringify(value);
  });
}

/**
 * Resolve a template, preserving the underlying value when the template is
 * a single `{{var}}` reference. Use this anywhere a non-string value
 * (array, number, object) might be expected — e.g. `attachments` should
 * stay an array, not be JSON-stringified.
 */
export function resolveValue(template: unknown, ctx: VariableContext): unknown {
  if (typeof template !== "string") return template;
  const single = SINGLE_PATTERN.exec(template);
  if (single) return getByPath<unknown>(ctx, single[1].trim());
  return resolveString(template, ctx);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* ------------------------------------------------------------------ */
/* Available-variables introspection                                   */
/* ------------------------------------------------------------------ */

export interface AvailableVariable {
  /** Path placed inside the `{{...}}` reference. */
  path: string;
  /** Display label in the picker (omits the surrounding braces). */
  label: string;
  /** Optional human-readable description. */
  description?: string;
  /** Optional declared output type (e.g. "string", "array"). */
  valueType?: string;
}

export interface VariableGroup {
  id: string;
  title: string;
  variables: AvailableVariable[];
}

const SYSTEM_VARS: AvailableVariable[] = [
  {
    path: "system.userQuery",
    label: "system.userQuery",
    description: "Free-form query supplied at run start.",
  },
  {
    path: "system.attachments",
    label: "system.attachments",
    description: "List of attachment objects.",
    valueType: "array",
  },
  {
    path: "system.files",
    label: "system.files",
    description: "List of file references.",
    valueType: "array",
  },
  {
    path: "system.humanInput",
    label: "system.humanInput",
    description: "Most recent Human Input response.",
  },
];

const RUNTIME_VARS: AvailableVariable[] = [
  {
    path: "runtime.workflowMetaData.workflowId",
    label: "runtime.workflowMetaData.workflowId",
    description: "Identifier of this workflow.",
  },
  {
    path: "runtime.workflowMetaData.agentName",
    label: "runtime.workflowMetaData.agentName",
    description: "Display name of this workflow.",
  },
];

interface DeclaredOutputField {
  name: string;
  type?: string;
  description?: string;
}

/** Walk every node in the doc and emit one variable per declared output. */
function collectNodeVariables(
  doc: WorkflowDoc,
  excludeNodeId?: string | null
): AvailableVariable[] {
  const out: AvailableVariable[] = [];
  for (const node of doc.nodes) {
    if (node.id === excludeNodeId) continue;
    const name = node.data.name;
    if (!name) continue;

    const declared =
      ((node.data.config as { outputVariables?: DeclaredOutputField[] })
        .outputVariables ?? []).filter((f) => f.name);

    if (declared.length === 0) {
      out.push({
        path: `nodes.${name}.result`,
        label: `nodes.${name}.result`,
        description: `Result of ${node.data.type} node`,
      });
    } else {
      out.push({
        path: `nodes.${name}.result`,
        label: `nodes.${name}.result`,
        description: `Full result of ${node.data.type} node`,
        valueType: "object",
      });
      for (const f of declared) {
        out.push({
          path: `nodes.${name}.result.${f.name}`,
          label: `nodes.${name}.result.${f.name}`,
          description: f.description,
          valueType: f.type,
        });
      }
    }
  }
  return out;
}

/** Build picker entries for user-defined flow variables. */
function collectFlowVariables(doc: WorkflowDoc): AvailableVariable[] {
  return (doc.flowVariables ?? [])
    .filter((v) => v.name)
    .map((v) => ({
      path: `flow.${v.name}`,
      label: `flow.${v.name}`,
      description: v.description,
      valueType: v.type,
    }));
}

/**
 * Build the grouped list shown in the variable picker. `excludeNodeId`
 * suppresses self-references (a node shouldn't reference its own result).
 */
export function getAvailableVariables(
  doc: WorkflowDoc,
  excludeNodeId?: string | null
): VariableGroup[] {
  return [
    { id: "system", title: "System", variables: SYSTEM_VARS },
    { id: "runtime", title: "Runtime", variables: RUNTIME_VARS },
    { id: "flow", title: "Flow", variables: collectFlowVariables(doc) },
    {
      id: "nodes",
      title: "Node Results",
      variables: collectNodeVariables(doc, excludeNodeId),
    },
  ];
}
