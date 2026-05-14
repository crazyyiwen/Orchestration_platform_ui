/**
 * Zod-based validation for the workflow document.
 *
 * Two layers:
 *   1. `workflowDocSchema` — structural shape (matches WorkflowDoc).
 *   2. `validateWorkflow(doc)` — runs the schema + semantic checks
 *      (unique node names, edge endpoints exist, exactly one Start).
 *
 * The save flow uses this to refuse a save when the workflow is invalid;
 * the import flow uses it to reject corrupt JSON before it reaches the
 * store.
 */

import { z } from "zod";
import type { WorkflowDoc } from "./types";

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const nodeDataSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  config: z.record(z.unknown()),
  inputs: z.record(z.unknown()),
  outputs: z.record(z.unknown()),
  advanced: z.record(z.unknown()),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("dynamic"),
  position: positionSchema,
  data: nodeDataSchema,
  // Runtime fields are tolerated on input but stripped when serializing.
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  positionAbsolute: positionSchema.optional(),
  dragging: z.boolean().optional(),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  data: z
    .object({
      routingOffset: z
        .object({ x: z.number(), y: z.number() })
        .optional(),
    })
    .partial()
    .optional(),
});

const variablesSchema = z.object({
  system: z
    .object({
      userQuery: z.string(),
      attachments: z.array(z.unknown()),
      files: z.array(z.unknown()),
      humanInput: z.string(),
      // Tolerant on read — older saved docs predate conversationHistory.
      conversationHistory: z.array(z.unknown()).optional(),
    })
    .transform((s) => ({
      ...s,
      conversationHistory: s.conversationHistory ?? [],
    })),
  runtime: z.object({
    workflowMetaData: z.object({
      workflowId: z.string(),
      agentName: z.string(),
    }),
  }),
});

const flowVariableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["string", "number", "boolean", "array", "object"]),
  defaultValue: z.unknown().optional(),
});

export const workflowDocSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.number().int().nonnegative(),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    variables: variablesSchema,
    // Tolerant on read — older saved docs predate flowVariables. We coerce
    // to [] in `deserializeWorkflow`.
    flowVariables: z.array(flowVariableSchema).optional(),
  })
  .transform((doc) => ({
    ...doc,
    flowVariables: doc.flowVariables ?? [],
  }));

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Present when the structural schema passed (semantic issues may still exist). */
  data?: WorkflowDoc;
}

/** Structural + semantic validation. Returns the issue list either way. */
export function validateWorkflow(doc: unknown): ValidationResult {
  const parsed = workflowDocSchema.safeParse(doc);
  const issues: ValidationIssue[] = [];

  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push({ path: e.path.join("."), message: e.message });
    }
    return { ok: false, issues };
  }

  const data = parsed.data as WorkflowDoc;

  // Unique flow-variable names (case-sensitive).
  const flowNames = new Set<string>();
  for (const v of data.flowVariables) {
    if (flowNames.has(v.name)) {
      issues.push({
        path: `flowVariables.${v.id}.name`,
        message: `Duplicate flow variable: "${v.name}"`,
      });
    }
    flowNames.add(v.name);
  }

  // Unique node names.
  const seen = new Set<string>();
  for (const n of data.nodes) {
    if (seen.has(n.data.name)) {
      issues.push({
        path: `nodes.${n.id}.data.name`,
        message: `Duplicate node name: "${n.data.name}"`,
      });
    }
    seen.add(n.data.name);
  }

  // Edge endpoints reference existing nodes.
  const ids = new Set(data.nodes.map((n) => n.id));
  for (const e of data.edges) {
    if (!ids.has(e.source)) {
      issues.push({
        path: `edges.${e.id}.source`,
        message: `Edge ${e.id} references missing source ${e.source}`,
      });
    }
    if (!ids.has(e.target)) {
      issues.push({
        path: `edges.${e.id}.target`,
        message: `Edge ${e.id} references missing target ${e.target}`,
      });
    }
  }

  // Exactly one Start node.
  const starts = data.nodes.filter((n) => n.data.type === "start");
  if (starts.length === 0) {
    issues.push({ path: "nodes", message: "Workflow must contain a Start node." });
  } else if (starts.length > 1) {
    issues.push({
      path: "nodes",
      message: "Workflow must contain exactly one Start node.",
    });
  }

  return { ok: issues.length === 0, issues, data };
}

/**
 * Returns a copy of the doc with any duplicate `data.name` values renamed by
 * suffixing `_1`, `_2`, … Stable: the first occurrence keeps the original
 * name. Used by `deserializeWorkflow` so imports never produce dupes.
 */
export function dedupeNodeNames(doc: WorkflowDoc): WorkflowDoc {
  const taken = new Set<string>();
  const nodes = doc.nodes.map((n) => {
    const base = n.data.name || n.data.type || "node";
    if (!taken.has(base)) {
      taken.add(base);
      return n;
    }
    let i = 1;
    while (taken.has(`${base}_${i}`)) i++;
    const next = `${base}_${i}`;
    taken.add(next);
    return { ...n, data: { ...n.data, name: next } };
  });
  return { ...doc, nodes };
}
