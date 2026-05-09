# Supported Functionalities

A summary of everything the Agent Workflow Builder currently supports, grouped by area. Every feature is registry- or schema-driven — no per-node-type React code exists.

---

## 1. Application shell

- Three-column layout: **Header** + **Node Palette** + **Canvas** + **Properties Panel**.
- Canvas reclaims the right panel's width when nothing is selected.
- Run modal (`RunPanel`) mounted at the app root, toggled via the store.
- Tailwind CSS theme with consistent ink/canvas/brand color tokens, `:focus-visible` ring, custom soft scrollbars.

## 2. Header / toolbar

- **Editable workflow name** (top-left input, persisted to the doc).
- **Status banner** with four states:
  - Amber "Editing draft · changes are local until you save" (default).
  - Green "Saved at HH:MM" (flash for 2.5 s on save).
  - Neutral "Last saved at HH:MM" (after the flash).
  - Red "Save blocked — see details" (validation failure, full message in the alert).
- **Toolbar icons** — View / Search / Undo / Settings (cosmetic placeholders matching the screenshots).
- **Import** (upload icon) — opens hidden file picker, parses & schema-validates JSON, replaces the doc.
- **Export** (download icon) — downloads the current workflow as a slugified `.json`.
- **Run** — opens the run-simulation modal.
- **Save** — validates and writes to `localStorage` (and surfaces validation issues if any).

## 3. Node palette (left)

- **Tabs:** Nodes / Tools (Tools is a placeholder).
- **Search filter** across label, type, and category.
- **Registry-driven** — list comes from `paletteOrder` × `nodeRegistry`. Adding a node type to the registry makes it appear here automatically.
- **Visual category grouping** — 1 px hairline separator between AI / Logic / Integration / Composition / State / I/O / Human.
- **Drag-and-drop** onto the canvas with a custom MIME type (`application/x-workflow-node-type`).
- **Start node is excluded** from the palette so it can't be duplicated.

## 4. Canvas

- React Flow 11 canvas with **light dotted grid background**.
- **Pan / zoom / multi-select** (Shift+drag selection rectangle).
- **Drop zone** wired so palette items create new nodes at the drop position (via `screenToFlowPosition`).
- **Node selection** opens the right properties panel.
- **Edge selection** turns the edge brand-blue and thickens the stroke.
- **Connections via handles** with a brand-blue smoothstep preview line during drag.
- **Edge arrowheads** (`MarkerType.ArrowClosed`).
- **Delete** key removes nodes and edges (Start is protected; the executor refuses to drop it).
- **Empty-state hint** appears only when the workflow contains the Start node alone.
- **MiniMap** (bottom-right) renders each node in its registry color.
- **Zoom controls** (bottom-left) — zoom in / zoom out / fit view.

## 5. Node card (`DynamicWorkflowNode`)

- **One generic component** registered with React Flow. Reads `nodeRegistry[data.type]` for icon, color, handles.
- White card, rounded corners, soft shadow.
- **Brand-blue 2 px ring + glow when selected.**
- **Hover lift** (1 px elevation) + ink-300 border transition.
- **Icon block** on the left in registry color (lucide-react icon at `strokeWidth: 2.25`).
- **Sublabel** auto-derived from config (model name for LLM/Agent, URL/method for HTTP).
- **Multi-handle layout**: Rule, Approval, and Guardrail nodes grow vertically with one row per branch, each row hosting its own labeled handle.
- **Handles**: hover scales them 1.15×, brand-blue when connecting, green on a valid drop target.

## 6. Node types (13 — Start + 12 user-facing)

Every node has: registry entry, default config, input/output handles, dynamic form sections, editable through the properties panel, optional declared `Output Variables` schema for the variable picker.

| Type | Handles | Notable features |
|---|---|---|
| **Start** | 0 in / 1 out | Auto-added to every workflow; protected from deletion; not in palette. |
| **LLM** | 1 in / 1 out | Model select, instructions, user query, message list, output schema, advanced (response format + nested state-update accordion). |
| **Agent** | 1 in / 1 out | Strategy, model, tools/libraries/skills/widgets multi-selects, messages, output schema. |
| **External Agent** | 1 in / 1 out | Endpoint, auth accordion, input/output mapping. |
| **Script** | 1 in / 1 out | Input params (schema-builder), code editor, **Test button** (`new Function` sandbox), output schema. |
| **HTTP Request** | 1 in / 1 out | Method, URL, headers, query, JSON body, auth accordion, response mapping. |
| **Guardrail** | 1 in / 2 out (allow + block) | Input variable, validation rules (flat condition-builder), reason expression. |
| **Rule** | 1 in / N out (per branch) | IF / ELSE IF / ELSE blocks; each block creates its own labeled output handle on the canvas. |
| **Sub Flow** | 1 in / 1 out | Application/module/agent selectors, load-dynamically toggle, input mapping, output schema. |
| **Variable Update** | 1 in / 1 out | State updates with `set / append / merge / increment / remove` operations + run-only-when condition. |
| **Output** | 1 in / 0 out | Render-images toggle, dynamic output mappings (key + type + variable expression). |
| **Approval** | 1 in / 2 out (approved + rejected) | Pause for human approval; resumes via the Run modal. |
| **Human Input** | 1 in / 1 out | Question, save-response variable path; pauses execution for input. |

## 7. Properties panel (right)

- Generic. Never branches on node type.
- **Header**: icon + editable node name (live duplicate-name warning) + delete (hidden for Start) + close.
- **Description** textarea.
- **Schema-driven body** (`DynamicFormRenderer`) walks `def.formSections` and emits collapsible sections.
- Sections support **collapsible** state and **default-collapsed** flag (used for Advanced).
- All field paths bind to `node.data.<dot-path>` via `setNodeFieldByPath`; per-field `useFieldValue` hook prevents cross-field re-renders.

## 8. Field types (17, dispatched in `FieldRenderer`)

| Type | Use |
|---|---|
| `text`, `textarea` | Strings — both backed by ExpressionInput, so `{{...}}` chips work out of the box. |
| `number` | Number input. |
| `switch` | Toggle (Tailwind-styled). |
| `select` | Dropdown with inline `options` or via `optionsSource` (`models`, `tools`, `libraries`, etc.). |
| `multi-select` | Chip-list with add-via-dropdown. |
| `code` | Monospace textarea with language label header. |
| `json` | Monospace textarea with live JSON parse error feedback. |
| `variable-reference` | ExpressionInput, monospace, chip preview. |
| `variable-reference-list` | Repeated ExpressionInputs. |
| `key-value-list` | HTTP headers / query params. |
| `message-list` | Role + content rows (uses ExpressionInput for content). |
| `mapping-list` | Output mapping, sub-flow input, variable updates. Optional `withOperation` adds a per-row operation column. |
| `condition-builder` | Two shapes via `meta.shape`: `blocks` (Rule — drives canvas branch handles) or `flat` (Guardrail rules). |
| `schema-builder` | Script params, output schema, declared output variables. |
| `accordion-section` | Layout-only — recurses into FieldRenderer for nested fields (e.g. HTTP Auth, External Agent Auth). |
| `script-runner` | Test runner button: parses test input JSON, runs `new Function("input", code)`, displays result + ms (demo only). |

## 9. Variable reference system

- **Reference grammar**: `{{system.userQuery}}`, `{{system.attachments}}`, `{{system.files}}`, `{{system.humanInput}}`, `{{runtime.workflowMetaData.workflowId}}`, `{{runtime.workflowMetaData.agentName}}`, `{{nodes.<nodeName>.result}}`, `{{nodes.<nodeName>.result.<field>}}`.
- **`VariableChip`** — blue pill, optional remove button, max-width truncation with full-path tooltip.
- **`VariableChipsPreview`** — splits a string and renders chips inline, plain text in between.
- **`VariablePicker`** — portal-rendered popover (escapes the panel's `overflow`), viewport-aware (auto-flips above when no room below), search across path/label/description, three collapsible groups (System / Runtime / Node Results).
- **Dynamic node introspection** — `getAvailableVariables(doc)` walks every node's declared `outputVariables` schema and emits picker entries; the current node is excluded from "Node Results".
- **`ExpressionInput`** — input or textarea + `{ x }` button; insertion preserves caret position; chip preview below.
- **Wired into**: text, textarea, variable-reference, variable-reference-list, mapping-list values, message-list content, condition-builder field + value.
- **Resolver** — `resolveString` (interpolates), `resolveValue` (single ref preserves type), `resolveDeep` (walks arrays/objects).

## 10. Workflow document & persistence

- **Pure JSON** doc shape: `{ id, name, version, nodes[], edges[], variables: { system, runtime } }` — matches the spec exactly.
- **Runtime fields stripped on save** (`width`, `height`, `positionAbsolute`, `dragging`).
- **Auto-load from `localStorage`** on store boot (key `workflow-builder:doc`).
- **Save** — Zod validation gate, writes to localStorage, status reflected in the banner.
- **Export** — downloads `slugified-name.json`.
- **Import** — file picker → parse → schema-validate → retrofit Start node if missing → dedupe duplicate node names → replace doc.
- **Reset to empty** action available in the store.

## 11. Validation

- **Zod-based structural schema** for every shape in the doc.
- **Semantic checks**:
  - Unique node names across the workflow.
  - All edge endpoints reference existing node ids.
  - Exactly one Start node.
- **Live duplicate-name warning** under the panel's name input (visual, non-blocking).
- **Save and import refuse** when validation fails; the alert lists every issue.
- **`dedupeNodeNames`** auto-suffixes (`name`, `name_1`, `name_2`, …) on import so older JSONs always land in a valid state.

## 12. Runtime simulation (Run button)

- **Modal-based runner** (`RunPanel`, portal-rendered).
- **Initial seed**: user supplies `system.userQuery`; `runtime.workflowMetaData` is filled from the doc id + name.
- **Traversal**: starts at the Start node; at each step picks the next edge by matching `(edge.sourceHandle ?? "out")` against the executor's `nextHandle`.
- **`MAX_STEPS = 100`** loop guard.
- **Live execution log** — one row per step with icon, name, type, JSON result, and the chosen `nextHandle` for branching nodes.
- **Pause flows**:
  - **Human Input** — modal shows the question, accepts a textarea response, writes it to the configured `saveResponseAs` path.
  - **Approval** — modal shows the message, Approve / Reject buttons route to the matching handle.
- **Variable resolution before each executor runs** — every node sees a fully resolved view of `system.*`, `runtime.*`, and prior `nodes.*.result`.
- **Output node terminates** the run with its mapping as the workflow's final output (green panel, formatted JSON).
- **Errors** (script throw, missing executor, runaway loop, unreachable edge) end the run with a red panel and the message.
- **Reset** button to start over without closing.

### Mock executors

Each of the 13 node types has its own executor in `nodeExecutors.ts`. All are mocked — no real LLMs, no real HTTP, no real sub-flow execution. The Script executor really runs the user's code via `new Function`, marked **demo only** in the UI.

## 13. Visual polish (Phase 8)

- Light dotted grid background, brand-blue smoothstep edges with arrowheads.
- Color-coded MiniMap nodes matching the registry palette.
- Node card hover-lift, brand-blue selection ring + glow.
- Handle hover scale, connection-state colors, valid-drop green.
- Refined React Flow controls (rounded, single shadow, ink-100 hover).
- Section headers with `tracking-[0.06em]` uppercase labels and smooth chevron rotation.
- Custom soft scrollbar (`.scrollbar-soft`) on palette and right panel.
- OpenType font features (`ss01`, `cv11`) for crisper letterforms.
- Global `:focus-visible` ring for keyboard-first usability.

## 14. Architecture invariants (verified)

- **Adding a new node type** = append one entry to `nodeRegistry.ts` + map a new lucide icon in `Icon.tsx`. **Zero new React components.**
- **Adding a new field type** = add a literal to `FieldType` in `types.ts` + a `case` in `FieldRenderer.tsx`.
- **No per-node-type forms** — `LlmForm.tsx`, `AgentForm.tsx`, etc. do not exist.
- **Workflow doc stays serializable at all times** — runtime fields are stripped on serialize, semantic checks gate every save and import.
- **`tsc --noEmit`** clean. **`vite build`** clean (1793 modules, 437 KB / 130 KB gzipped).
