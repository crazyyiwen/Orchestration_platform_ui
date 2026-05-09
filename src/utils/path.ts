/**
 * Tiny path utilities used by the dynamic form renderer.
 *
 * Everything in the form schema is keyed by a dot path into `node.data`
 * (e.g. "config.model", "advanced.errorHandling"). These helpers are the
 * read/write companions to the path-based mutator on the workflow store.
 */

export function getByPath<T = unknown>(
  obj: unknown,
  path: string
): T | undefined {
  if (!path) return obj as T | undefined;
  if (obj == null) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur as T | undefined;
}
