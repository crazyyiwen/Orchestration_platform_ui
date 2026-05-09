/**
 * Hooks that bind a `FieldSchema` to the workflow store.
 *
 * `useFieldValue` subscribes to a single dot-path on the selected node so
 * editing one field doesn't re-render every other field. `useFieldSetter`
 * returns a stable setter that writes through `setNodeFieldByPath`.
 */

import { useCallback } from "react";

import { useWorkflowStore } from "@/store/workflowStore";
import { getByPath } from "@/utils/path";

export function useFieldValue<T = unknown>(
  nodeId: string,
  key: string
): T | undefined {
  return useWorkflowStore((s) => {
    const node = s.doc.nodes.find((n) => n.id === nodeId);
    if (!node) return undefined;
    return getByPath<T>(node.data, key);
  });
}

export function useFieldSetter(nodeId: string, key: string) {
  const setNodeFieldByPath = useWorkflowStore((s) => s.setNodeFieldByPath);
  return useCallback(
    (value: unknown) => setNodeFieldByPath(nodeId, key, value),
    [setNodeFieldByPath, nodeId, key]
  );
}
