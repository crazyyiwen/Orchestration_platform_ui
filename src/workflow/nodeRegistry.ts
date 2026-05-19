/**
 * Single source of truth for every node type in the builder.
 *
 * Adding a new node type should be a JSON-only change:
 *   1. Append an entry below.
 *   2. Add its icon name to `IconName` in `types.ts` and map it in `Icon.tsx`.
 *
 * No new React component should be required. The palette, canvas card, and
 * properties panel all read from this object.
 */

import type {
  FieldSchema,
  FormSection,
  NodeRegistry,
  NodeTypeDefinition,
} from "./types";

/* ------------------------------------------------------------------ */
/* Reusable schema fragments                                           */
/* ------------------------------------------------------------------ */

/** Build a "Definition" section. `name` and `description` live in the
 *  PropertiesPanel header — schemas only own type-specific config. */
const definition = (fields: FieldSchema[]): FormSection => ({
  id: "definition",
  title: "Definition",
  fields,
});

const advanced = (extra: FieldSchema[] = []): FormSection => ({
  id: "advanced",
  title: "Advanced",
  defaultCollapsed: true,
  fields: [
    {
      key: "advanced.errorHandling",
      label: "Error handling",
      type: "switch",
      defaultValue: false,
    },
    ...extra,
  ],
});

/** Generic post-execution state-update section — injected into every node
 *  (except Start and Variable Update) by the post-processing pass at the
 *  bottom of this file. After the node's main work finishes, the executor
 *  applies each row, optionally gated by `stateUpdatesRunOnlyWhen`. */
const stateUpdateSection: FormSection = {
  id: "stateUpdate",
  title: "State Update",
  defaultCollapsed: true,
  fields: [
    {
      key: "config.stateUpdates",
      label: "Manage state updates",
      description:
        "Updates applied after this node finishes. Target paths like flow.<name>, system.<name>, or any dot-path on the runtime context.",
      type: "mapping-list",
      meta: { withOperation: true },
    },
    {
      key: "config.stateUpdatesRunOnlyWhen",
      label: "Run only when",
      description:
        "Optional expression — when truthy, updates run. Leave blank to always apply.",
      type: "variable-reference",
    },
  ],
};

const responseFormatField: FieldSchema = {
  key: "advanced.responseFormat",
  label: "Response Format",
  type: "select",
  defaultValue: "text",
  options: [
    { label: "Plain Text", value: "text" },
    { label: "JSON", value: "json" },
  ],
};

const stateUpdateField: FieldSchema = {
  key: "advanced.stateUpdates",
  label: "State Update",
  type: "mapping-list",
  meta: { withOperation: true },
};

const outputVariablesField: FieldSchema = {
  key: "config.outputVariables",
  label: "Output Variables",
  description:
    "Declare the fields this node produces. Reference them as {{nodes.<name>.result.<field>}} downstream.",
  type: "schema-builder",
};

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export const nodeRegistry: NodeRegistry = {
  /**
   * The Start node is auto-added to every workflow (see createEmptyWorkflow)
   * and is the entry point for execution. It is intentionally NOT listed in
   * `paletteOrder` so users can't drag a second one in, and the store +
   * canvas + properties panel all refuse to delete it.
   */
  start: {
    type: "start",
    label: "Start",
    icon: "play",
    color: "emerald",
    category: "System",
    description: "Starting point of the workflow.",
    defaultNamePrefix: "start",
    defaultConfig: {},
    handles: {
      inputs: [],
      outputs: [{ id: "out", label: "Start" }],
    },
    formSections: [],
  },

  llm: {
    type: "llm",
    label: "LLM",
    icon: "sparkles",
    color: "purple",
    category: "AI",
    description: "Call an LLM model with a prompt.",
    defaultNamePrefix: "llm",
    defaultConfig: {
      model: "OpenAI GPT-5 mini",
      instructions: "",
      messages: [],
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      definition([
        {
          key: "config.model",
          label: "Model",
          type: "select",
          required: true,
          optionsSource: "models",
          defaultValue: "OpenAI GPT-5 mini",
        },
        {
          key: "config.instructions",
          label: "Instructions",
          type: "textarea",
          placeholder: "You are a helpful assistant…",
        },
      ]),
      {
        id: "messages",
        title: "Messages",
        fields: [{ key: "config.messages", label: "Messages", type: "message-list" }],
      },
      {
        id: "outputs",
        title: "Output Variables",
        fields: [outputVariablesField],
      },
      // Demonstrates accordion-section: nested fields inside Advanced.
      advanced([
        responseFormatField,
        {
          key: "advanced.io",
          label: "State Update",
          type: "accordion-section",
          fields: [stateUpdateField],
        },
      ]),
    ],
  },

  agent: {
    type: "agent",
    label: "Agent",
    icon: "bot",
    color: "indigo",
    category: "AI",
    description: "Run an agent loop with tools and skills.",
    defaultNamePrefix: "agent",
    defaultConfig: {
      strategy: "ReAct",
      model: "OpenAI GPT-5 mini",
      instructions: "",
      messages: [],
      attachments: "{{system.attachments}}",
      tools: [],
      libraries: [],
      skills: [],
      widgets: [],
      // Handoff configurations — each handoff exposes a labeled output handle
      // on the canvas card, mapping to LangGraph's add_node + edge pattern.
      handoffs: [],
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      definition([
        {
          key: "config.strategy",
          label: "Agent Strategy",
          type: "select",
          defaultValue: "ReAct",
          options: [
            { label: "ReAct", value: "ReAct" },
            { label: "Plan & Execute", value: "PlanExecute" },
            { label: "Tool Calling", value: "ToolCalling" },
          ],
        },
        {
          key: "config.model",
          label: "Model",
          type: "select",
          required: true,
          optionsSource: "models",
        },
        {
          key: "config.instructions",
          label: "Instructions",
          type: "textarea",
        },
        {
          key: "config.attachments",
          label: "Attachments",
          type: "variable-reference",
          defaultValue: "{{system.attachments}}",
        },
      ]),
      {
        id: "messages",
        title: "Messages",
        fields: [{ key: "config.messages", label: "Messages", type: "message-list" }],
      },
      {
        id: "tools",
        title: "Tools",
        fields: [
          {
            key: "config.tools",
            label: "Tools",
            description:
              "Bound function tools the agent may call. These don't add canvas connections.",
            type: "multi-select",
            optionsSource: "tools",
          },
        ],
      },
      {
        id: "handoffs",
        title: "Handoffs",
        fields: [
          {
            key: "config.handoffs",
            label: "Handoffs",
            description:
              "Each handoff adds an output handle on the canvas. Drag from it to the target node.",
            type: "handoff-list",
          },
        ],
      },
      {
        id: "libraries",
        title: "Libraries",
        fields: [
          {
            key: "config.libraries",
            label: "Libraries",
            type: "multi-select",
            optionsSource: "libraries",
          },
        ],
      },
      {
        id: "skills",
        title: "Skills",
        fields: [
          {
            key: "config.skills",
            label: "Skills",
            type: "multi-select",
            optionsSource: "skills",
          },
        ],
      },
      {
        id: "widgets",
        title: "Widgets",
        fields: [
          {
            key: "config.widgets",
            label: "Widgets",
            type: "multi-select",
            optionsSource: "widgets",
          },
        ],
      },
      {
        id: "outputs",
        title: "Output Variables",
        fields: [outputVariablesField],
      },
      advanced(),
    ],
  },

  externalAgent: {
    type: "externalAgent",
    label: "External Agent",
    icon: "globe",
    color: "sky",
    category: "AI",
    description: "Call a remote agent endpoint.",
    defaultNamePrefix: "external_agent",
    defaultConfig: {
      endpoint: "",
      auth: { type: "none", token: "" },
      inputMapping: [],
      outputMapping: [],
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      definition([
        {
          key: "config.endpoint",
          label: "Endpoint or Agent ID",
          type: "text",
          required: true,
        },
      ]),
      {
        id: "auth",
        title: "Auth",
        fields: [
          {
            key: "config.auth",
            label: "Authentication",
            type: "accordion-section",
            fields: [
              {
                key: "config.auth.type",
                label: "Type",
                type: "select",
                defaultValue: "none",
                options: [
                  { label: "None", value: "none" },
                  { label: "Bearer Token", value: "bearer" },
                  { label: "API Key", value: "apiKey" },
                ],
              },
              {
                key: "config.auth.token",
                label: "Token / Key",
                type: "text",
              },
            ],
          },
        ],
      },
      {
        id: "inputs",
        title: "Inputs",
        fields: [
          { key: "config.inputMapping", label: "Inputs", type: "mapping-list" },
        ],
      },
      {
        id: "outputs",
        title: "Output Mapping",
        fields: [
          {
            key: "config.outputMapping",
            label: "Outputs",
            type: "mapping-list",
          },
        ],
      },
      advanced(),
    ],
  },

  script: {
    type: "script",
    label: "Script",
    icon: "code-2",
    color: "amber",
    category: "Logic",
    description: "Run custom code with typed inputs and outputs.",
    defaultNamePrefix: "script",
    defaultConfig: {
      params: [],
      code: "// inputs are available as input.<field>\nreturn { result: input };",
      outputSchema: [],
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      {
        id: "params",
        title: "Input Params",
        fields: [
          { key: "config.params", label: "Params", type: "schema-builder" },
        ],
      },
      {
        id: "code",
        title: "Code",
        fields: [
          {
            key: "config.code",
            label: "Code",
            type: "code",
            meta: { language: "javascript", rows: 10 },
          },
        ],
      },
      {
        id: "test",
        title: "Test",
        fields: [
          {
            key: "config._test",
            label: "Test runner",
            type: "script-runner",
            meta: { codeKey: "config.code" },
          },
        ],
      },
      {
        id: "outputSchema",
        title: "Output Schema",
        fields: [
          {
            key: "config.outputSchema",
            label: "Output Schema",
            type: "schema-builder",
          },
        ],
      },
      advanced(),
    ],
  },

  http: {
    type: "http",
    label: "HTTP Request",
    icon: "send",
    color: "teal",
    category: "Integration",
    description: "Call an external HTTP API.",
    defaultNamePrefix: "http_request",
    defaultConfig: {
      method: "GET",
      url: "",
      headers: [],
      query: [],
      // Body is a typed-params tree, not a raw JSON string. Each entry
      // is `{ id, name, type, value?, fields? }` — object params can have
      // nested fields recursively, primitives bind a literal or {{variable}}.
      body: [],
      auth: { type: "none", token: "" },
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      definition([
        {
          key: "config.method",
          label: "Method",
          type: "select",
          defaultValue: "GET",
          options: [
            { label: "GET", value: "GET" },
            { label: "POST", value: "POST" },
            { label: "PUT", value: "PUT" },
            { label: "PATCH", value: "PATCH" },
            { label: "DELETE", value: "DELETE" },
          ],
        },
        { key: "config.url", label: "URL", type: "text", required: true },
      ]),
      {
        id: "headers",
        title: "Headers",
        fields: [
          { key: "config.headers", label: "Headers", type: "key-value-list" },
        ],
      },
      {
        id: "query",
        title: "Query Params",
        fields: [
          { key: "config.query", label: "Query", type: "key-value-list" },
        ],
      },
      {
        id: "body",
        title: "Body",
        fields: [
          {
            key: "config.body",
            label: "Body",
            description:
              "Structured body parameters. Add primitives, or define an object with nested fields. Object params without nested fields fall back to a raw JSON editor.",
            type: "typed-params",
          },
        ],
      },
      {
        id: "auth",
        title: "Auth",
        fields: [
          {
            key: "config.auth",
            label: "Authentication",
            type: "accordion-section",
            fields: [
              {
                key: "config.auth.type",
                label: "Type",
                type: "select",
                defaultValue: "none",
                options: [
                  { label: "None", value: "none" },
                  { label: "Bearer Token", value: "bearer" },
                  { label: "API Key", value: "apiKey" },
                ],
              },
              {
                key: "config.auth.token",
                label: "Token / Key",
                type: "text",
              },
            ],
          },
        ],
      },
      {
        id: "response",
        title: "Response Mapping",
        fields: [
          {
            key: "config.responseMapping",
            label: "Map response fields",
            description:
              "Pull fields out of the response payload. Reference them later as {{nodes.<name>.result.<key>}}.",
            type: "mapping-list",
          },
        ],
      },
      advanced(),
    ],
  },

  guardrail: {
    type: "guardrail",
    label: "Guardrail",
    icon: "shield-check",
    color: "rose",
    category: "Logic",
    description: "Validate inputs and allow or block.",
    defaultNamePrefix: "guardrail",
    defaultConfig: {
      input: "",
      rules: [],
      reasonExpression: "",
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [
        { id: "allow", label: "Allow" },
        { id: "block", label: "Block" },
      ],
    },
    formSections: [
      definition([
        { key: "config.input", label: "Input", type: "variable-reference" },
      ]),
      {
        id: "rules",
        title: "Validation Rules",
        fields: [
          {
            key: "config.rules",
            label: "Rules",
            type: "condition-builder",
            meta: { shape: "flat" },
          },
        ],
      },
      {
        id: "reason",
        title: "Reason",
        fields: [
          {
            key: "config.reasonExpression",
            label: "Reason output",
            description:
              "Expression evaluated when the rules block. Available as {{nodes.<name>.result.reason}} downstream.",
            type: "variable-reference",
          },
        ],
      },
      advanced(),
    ],
  },

  rule: {
    type: "rule",
    label: "Rule",
    icon: "git-branch",
    color: "amber",
    category: "Logic",
    description: "Branch the workflow based on conditions.",
    defaultNamePrefix: "rule",
    defaultConfig: {
      blocks: [
        { id: "case_1", kind: "if", label: "case_1", conditions: [] },
        { id: "else", kind: "else", label: "else", conditions: [] },
      ],
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      // Outputs are computed dynamically from `data.config.blocks`.
      outputs: [],
    },
    formSections: [
      {
        id: "blocks",
        title: "Rule Blocks",
        fields: [
          {
            key: "config.blocks",
            label: "Blocks",
            type: "condition-builder",
            meta: { shape: "blocks" },
          },
        ],
      },
      advanced(),
    ],
  },

  subFlow: {
    type: "subFlow",
    label: "Sub Flow",
    icon: "workflow",
    color: "blue",
    category: "Composition",
    description: "Run another workflow as a step.",
    defaultNamePrefix: "sub_flow",
    defaultConfig: {
      application: "",
      module: "",
      agentId: "",
      loadDynamically: false,
      inputMapping: [],
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      definition([
        {
          key: "config.application",
          label: "Application",
          type: "select",
          optionsSource: "applications",
        },
        {
          key: "config.module",
          label: "Module",
          type: "select",
          optionsSource: "modules",
        },
        {
          key: "config.agentId",
          label: "Agent",
          description:
            "Pick a saved workflow to run as this sub-flow step.",
          type: "workflow-select",
        },
        {
          key: "config.loadDynamically",
          label: "Load dynamically",
          type: "switch",
          defaultValue: false,
        },
      ]),
      {
        id: "inputs",
        title: "Inputs",
        fields: [
          { key: "config.inputMapping", label: "Inputs", type: "mapping-list" },
        ],
      },
      {
        id: "outputs",
        title: "Output Variables",
        fields: [outputVariablesField],
      },
      advanced(),
    ],
  },

  variableUpdate: {
    type: "variableUpdate",
    label: "Variable Update",
    icon: "variable",
    color: "emerald",
    category: "State",
    description: "Set, append, merge, or update a state variable.",
    defaultNamePrefix: "variable_update",
    defaultConfig: { updates: [], runOnlyWhen: "" },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      {
        id: "updates",
        title: "State Updates",
        fields: [
          {
            key: "config.updates",
            label: "Updates",
            type: "mapping-list",
            meta: { withOperation: true },
          },
        ],
      },
      {
        id: "runOnlyWhen",
        title: "Run only when",
        fields: [
          {
            key: "config.runOnlyWhen",
            label: "Condition",
            type: "variable-reference",
          },
        ],
      },
      advanced(),
    ],
  },

  uiView: {
    type: "uiView",
    label: "UI View",
    icon: "layout-template",
    color: "sky",
    category: "I/O",
    description:
      "Render a custom HTML view. Supports {{variable.path}} interpolation.",
    defaultNamePrefix: "ui_view",
    defaultConfig: {
      html:
        '<div style="padding: 16px; font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a;">\n' +
        '  <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600;">Result</h2>\n' +
        '  <p style="margin: 0; color: #475569;">You asked: <strong>{{system.userQuery}}</strong></p>\n' +
        "</div>",
      sanitize: true,
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      {
        id: "html",
        title: "HTML Template",
        fields: [
          {
            key: "config.html",
            label: "HTML",
            description:
              "Write any HTML. Use {{variable.path}} placeholders — they're resolved at runtime.",
            type: "code",
            meta: { language: "html", rows: 12 },
          },
        ],
      },
      {
        id: "preview",
        title: "Preview",
        fields: [
          {
            key: "config.html",
            label: "Live preview",
            type: "ui-view-preview",
          },
        ],
      },
      advanced([
        {
          key: "config.sanitize",
          label: "Sanitize HTML",
          description:
            "Strips <script>, <iframe>, and inline event handlers. Recommended.",
          type: "switch",
          defaultValue: true,
        },
      ]),
    ],
  },

  output: {
    type: "output",
    label: "Output",
    icon: "log-out",
    color: "slate",
    category: "I/O",
    description: "Produce the final workflow output.",
    defaultNamePrefix: "output",
    defaultConfig: {
      renderImages: false,
      mappings: [],
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [],
    },
    formSections: [
      definition([
        {
          key: "config.renderImages",
          label: "Render images",
          type: "switch",
          defaultValue: false,
        },
      ]),
      {
        id: "mappings",
        title: "Output Mapping",
        fields: [
          {
            key: "config.mappings",
            label: "Mappings",
            type: "mapping-list",
          },
        ],
      },
    ],
  },

  approval: {
    type: "approval",
    label: "Approval",
    icon: "check-circle-2",
    color: "orange",
    category: "Human",
    description: "Pause for human approval.",
    defaultNamePrefix: "approval",
    defaultConfig: {
      message: "",
      approver: "",
      saveResponseAs: "",
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [
        { id: "approved", label: "Approved" },
        { id: "rejected", label: "Rejected" },
      ],
    },
    formSections: [
      definition([
        { key: "config.message", label: "Approval message", type: "textarea" },
        { key: "config.approver", label: "Approver", type: "text" },
        {
          key: "config.saveResponseAs",
          label: "Save response as",
          type: "text",
        },
      ]),
      advanced(),
    ],
  },

  humanInput: {
    type: "humanInput",
    label: "Human Input",
    icon: "user",
    color: "pink",
    category: "Human",
    description: "Pause and wait for input from a person.",
    defaultNamePrefix: "human_input",
    defaultConfig: {
      question: "",
      saveResponseAs: "system.humanInput",
    },
    handles: {
      inputs: [{ id: "in", label: "Input" }],
      outputs: [{ id: "out", label: "Output" }],
    },
    formSections: [
      definition([
        {
          key: "config.question",
          label: "Question",
          type: "textarea",
          required: true,
          placeholder: "Please provide your input.",
        },
        {
          key: "config.saveResponseAs",
          label: "Save Response As",
          type: "text",
          defaultValue: "system.humanInput",
        },
      ]),
      advanced(),
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Inject the generic State Update section into every applicable node. */
/* ------------------------------------------------------------------ */

const NO_STATE_UPDATE_SECTION = new Set<string>([
  // Start has no main work and never produces state. No need.
  "start",
  // Variable Update's whole purpose is state mutation — its `config.updates`
  // already drives the same engine; a second "State Update" section here
  // would be redundant + confusing.
  "variableUpdate",
]);

for (const key of Object.keys(nodeRegistry)) {
  const def = nodeRegistry[key];
  if (NO_STATE_UPDATE_SECTION.has(def.type)) continue;

  // Insert State Update directly before Advanced if present, else at the end.
  const advancedIdx = def.formSections.findIndex((s) => s.id === "advanced");
  if (advancedIdx === -1) {
    def.formSections = [...def.formSections, stateUpdateSection];
  } else {
    def.formSections = [
      ...def.formSections.slice(0, advancedIdx),
      stateUpdateSection,
      ...def.formSections.slice(advancedIdx),
    ];
  }

  // Seed default config so freshly dropped nodes have valid fields to read.
  const cfg = def.defaultConfig as Record<string, unknown>;
  if (!Array.isArray(cfg.stateUpdates)) cfg.stateUpdates = [];
  if (typeof cfg.stateUpdatesRunOnlyWhen !== "string")
    cfg.stateUpdatesRunOnlyWhen = "";
}

/** Stable list ordering for the palette. Kept here so it's data, not UI logic. */
export const paletteOrder: string[] = [
  "llm",
  "agent",
  "externalAgent",
  "script",
  "http",
  "guardrail",
  "rule",
  "subFlow",
  "variableUpdate",
  "uiView",
  "output",
  "approval",
  "humanInput",
];

export function getNodeDefinition(type: string): NodeTypeDefinition | undefined {
  return nodeRegistry[type];
}
