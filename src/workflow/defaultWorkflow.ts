import { nanoid } from "nanoid";
import type { WorkflowDoc, WorkflowNode } from "./types";

/** Build a Start node — every workflow gets exactly one of these as its
 *  entry point. Kept as a small helper so importers (Phase 6) can also use
 *  it to retrofit older workflow JSON that was saved without one. */
export function createStartNode(): WorkflowNode {
  return {
    id: `node_${nanoid(8)}`,
    type: "dynamic",
    position: { x: 120, y: 240 },
    data: {
      type: "start",
      name: "start",
      description: "Starting point of the workflow.",
      config: {},
      inputs: {},
      outputs: {},
      advanced: {},
    },
  };
}

/** Returns a fresh empty workflow document with a Start node already in it. */
export function createEmptyWorkflow(): WorkflowDoc {
  return {
    id: `wf_${nanoid(10)}`,
    name: "Untitled workflow",
    version: 1,
    nodes: [createStartNode()],
    edges: [],
    variables: {
      system: {
        userQuery: "",
        attachments: [],
        files: [],
        humanInput: "",
      },
      runtime: {
        workflowMetaData: {
          workflowId: "",
          agentName: "",
        },
      },
    },
    flowVariables: [],
  };
}
