/**
 * Execution-time facade over the Phase 5 variable resolver.
 *
 * Re-exports the existing `resolveString` / `resolveValue` and adds a
 * `resolveDeep` that walks arrays and plain objects, resolving every
 * embedded `{{...}}` reference. The executor uses this when feeding
 * structured values (e.g. an HTTP body, a sub-flow input mapping)
 * downstream — leaving leaf strings interpolated and non-strings intact.
 */

import { resolveValue, type VariableContext } from "@/workflow/variableContext";

export { resolveString, resolveValue } from "@/workflow/variableContext";
export type { VariableContext } from "@/workflow/variableContext";

export function resolveDeep<T = unknown>(value: T, ctx: VariableContext): T {
  if (typeof value === "string") {
    return resolveValue(value, ctx) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveDeep(v, ctx)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveDeep(v, ctx);
    }
    return out as unknown as T;
  }
  return value;
}
