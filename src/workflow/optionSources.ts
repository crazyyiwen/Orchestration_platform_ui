/**
 * Named option sources referenced by `FieldSchema.optionsSource`.
 *
 * Keeping these in one place makes it trivial to swap them for an API call
 * later — every dropdown that uses `optionsSource: "models"` will pick up
 * the change without touching any field renderer.
 */

import type { FieldOption } from "./types";

const sources: Record<string, FieldOption[]> = {
  models: [
    { label: "OpenAI GPT-5 mini", value: "OpenAI GPT-5 mini" },
    { label: "OpenAI GPT-5", value: "OpenAI GPT-5" },
    { label: "OpenAI GPT-4o", value: "OpenAI GPT-4o" },
    { label: "Claude Opus 4.7", value: "Claude Opus 4.7" },
    { label: "Claude Sonnet 4.6", value: "Claude Sonnet 4.6" },
    { label: "Claude Haiku 4.5", value: "Claude Haiku 4.5" },
  ],
  tools: [
    { label: "Web Search", value: "web_search" },
    { label: "Code Interpreter", value: "code_interpreter" },
    { label: "File Reader", value: "file_reader" },
    { label: "SQL Query", value: "sql_query" },
  ],
  libraries: [
    { label: "Procurement Docs", value: "procurement_docs" },
    { label: "Supplier Catalog", value: "supplier_catalog" },
  ],
  skills: [
    { label: "Summarize", value: "summarize" },
    { label: "Translate", value: "translate" },
    { label: "Extract entities", value: "extract_entities" },
  ],
  widgets: [
    { label: "Card", value: "card" },
    { label: "Table", value: "table" },
    { label: "Chart", value: "chart" },
  ],
  applications: [
    { label: "Procurement", value: "procurement" },
    { label: "Finance", value: "finance" },
  ],
  modules: [
    { label: "Buying", value: "buying" },
    { label: "Approvals", value: "approvals" },
  ],
};

export function resolveOptionsSource(source: string): FieldOption[] {
  return sources[source] ?? [];
}
