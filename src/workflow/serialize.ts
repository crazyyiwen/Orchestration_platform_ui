/**
 * Workflow JSON serialization.
 *
 * `serializeWorkflow` drops the React-Flow runtime fields (width, height,
 * positionAbsolute, dragging) so the saved JSON stays tidy and matches
 * the schema in the spec. `deserializeWorkflow` is the inverse plus a
 * couple of robustness fixes — it retrofits a Start node when an older
 * import lacks one, and dedupes node names.
 */

import type { WorkflowDoc, WorkflowNode } from "./types";
import { createStartNode } from "./defaultWorkflow";
import { dedupeNodeNames } from "./validation";

export function serializeWorkflow(doc: WorkflowDoc): WorkflowDoc {
  const nodes: WorkflowNode[] = doc.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }));
  return { ...doc, nodes };
}

export function deserializeWorkflow(parsed: WorkflowDoc): WorkflowDoc {
  let doc = parsed;
  const hasStart = doc.nodes.some((n) => n.data.type === "start");
  if (!hasStart) {
    doc = { ...doc, nodes: [createStartNode(), ...doc.nodes] };
  }
  return dedupeNodeNames(doc);
}
