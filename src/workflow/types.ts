/**
 * Core types for the workflow builder.
 *
 * The whole app is registry-driven: a node type is described once in
 * `nodeRegistry.ts` and every UI surface (palette, canvas card, properties
 * panel) reads from that single source of truth. The shapes below are kept
 * intentionally serializable — saving a workflow is just JSON.stringify on
 * `WorkflowDoc`.
 */

import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Form schema (used by the dynamic properties panel in Phase 3)       */
/* ------------------------------------------------------------------ */

export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "multi-select"
  | "switch"
  | "number"
  | "code"
  | "json"
  | "variable-reference"
  | "variable-reference-list"
  | "key-value-list"
  | "message-list"
  | "mapping-list"
  | "condition-builder"
  | "schema-builder"
  | "accordion-section"
  | "script-runner"
  | "handoff-list"
  | "ui-view-preview"
  | "typed-params"
  | "workflow-select";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldSchema {
  /** Dot-path into `node.data` where this field's value is stored. Empty for
   *  layout-only field types like "accordion-section". */
  key: string;
  label: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: FieldOption[];
  /** Look up options dynamically from a named source (e.g. "models"). */
  optionsSource?: string;
  /** Free-form metadata for specialised renderers (codeLanguage, rows,
   *  shape: "blocks" | "flat", etc.) */
  meta?: Record<string, unknown>;
  /** Nested fields for layout-only types (accordion-section). */
  fields?: FieldSchema[];
}

export interface FormSection {
  id: string;
  title: string;
  /** When true, section starts collapsed. */
  defaultCollapsed?: boolean;
  fields: FieldSchema[];
}

/* ------------------------------------------------------------------ */
/* Node registry                                                       */
/* ------------------------------------------------------------------ */

export interface HandleSpec {
  id: string;
  label?: string;
  /** Optional kind for dynamic handles (e.g. agent handoffs are tinted). */
  kind?: "default" | "handoff" | "branch";
}

/** Names map to lucide-react icons via `components/ui/Icon.tsx`. */
export type IconName =
  | "sparkles"
  | "bot"
  | "globe"
  | "code-2"
  | "send"
  | "shield-check"
  | "git-branch"
  | "workflow"
  | "variable"
  | "log-out"
  | "check-circle-2"
  | "user"
  | "play"
  | "layout-template"
  | "circle";

/** Tailwind-friendly accent palette used for the icon block on each card. */
export type NodeColor =
  | "purple"
  | "indigo"
  | "blue"
  | "sky"
  | "teal"
  | "emerald"
  | "amber"
  | "orange"
  | "rose"
  | "pink"
  | "slate";

export interface NodeTypeDefinition {
  /** Unique key, e.g. "llm". Matches `WorkflowNode.data.type`. */
  type: string;
  /** Human label shown in the palette and node card. */
  label: string;
  /** Icon name resolved by `Icon` component. */
  icon: IconName;
  /** Accent color used for the icon block / category badge. */
  color: NodeColor;
  /** Category shown as a section header in the palette. */
  category: string;
  /** Short description shown in the palette tooltip / properties header. */
  description: string;
  /** Default `name` prefix used when creating a new node ("llm" -> "llm_0"). */
  defaultNamePrefix: string;
  /** Initial config object stored at `node.data.config`. */
  defaultConfig: Record<string, unknown>;
  /** Static input handles. Dynamic outputs (e.g. rule branches) are computed
   *  in `DynamicWorkflowNode` from the node's data. */
  handles: {
    inputs: HandleSpec[];
    outputs: HandleSpec[];
  };
  /** Schema-driven properties panel sections. Filled out in Phase 3. */
  formSections: FormSection[];
}

export type NodeRegistry = Record<string, NodeTypeDefinition>;

/** Convenience type for the icon component lookup map. */
export type IconMap = Record<IconName, LucideIcon>;

/* ------------------------------------------------------------------ */
/* Workflow document (the serializable JSON)                           */
/* ------------------------------------------------------------------ */

export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkflowNodeData {
  /** Registry key, duplicated here so the document is self-describing. */
  type: string;
  /** User-editable display name; must be unique across the workflow. */
  name: string;
  description: string;
  config: Record<string, unknown>;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  advanced: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  /** Always "dynamic" — the registry decides what to render. */
  type: "dynamic";
  position: NodePosition;
  data: WorkflowNodeData;
  /* React Flow runtime fields. Persisted across re-renders so the canvas
   * doesn't keep re-measuring the node on every doc update. They're stripped
   * on JSON export (Phase 5). */
  width?: number | null;
  height?: number | null;
  positionAbsolute?: NodePosition;
  dragging?: boolean;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
  /** Optional per-edge runtime fields. `routingOffset` is set when a user
   *  drags the wire's midpoint to reroute it manually. */
  data?: {
    routingOffset?: { x: number; y: number };
  };
}

export interface WorkflowVariables {
  system: {
    userQuery: string;
    attachments: unknown[];
    files: unknown[];
    humanInput: string;
    /** Running list of messages across the workflow, typically appended to
     *  by agent/LLM nodes via their State Update section. Referenced as
     *  `{{system.conversationHistory}}`. */
    conversationHistory: unknown[];
  };
  runtime: {
    workflowMetaData: {
      workflowId: string;
      agentName: string;
    };
  };
}

/** User-defined flow-scoped state variable, referenced as `{{flow.<name>}}`. */
export type FlowVariableType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object";

export interface FlowVariable {
  id: string;
  name: string;
  description?: string;
  type: FlowVariableType;
  /** Optional initial value, used to seed `ctx.flow` at run start. */
  defaultValue?: unknown;
}

export interface WorkflowDoc {
  id: string;
  name: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariables;
  /** Global flow-scoped variables shared across every node via `{{flow.<name>}}`. */
  flowVariables: FlowVariable[];
}
