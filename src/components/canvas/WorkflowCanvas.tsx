import { useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";

import { useWorkflowStore } from "@/store/workflowStore";
import { nodeRegistry } from "@/workflow/nodeRegistry";
import { MINIMAP_COLORS } from "@/components/ui/colorTokens";
import type { WorkflowNodeData } from "@/workflow/types";
import { DynamicWorkflowNode } from "./DynamicWorkflowNode";
import { AdjustableEdge } from "./AdjustableEdge";
import { PALETTE_DND_TYPE } from "@/components/layout/NodePalette";

/**
 * The canvas. Wraps React Flow with our store as the source of truth.
 *
 * `DynamicWorkflowNode` is the single registered node type. It introspects
 * `nodeRegistry` at render time, which means new node types only require a
 * registry entry — never a new component or canvas wiring.
 */
export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function CanvasInner() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance<WorkflowNodeData> | null>(null);

  const nodes = useWorkflowStore((s) => s.doc.nodes);
  const edges = useWorkflowStore((s) => s.doc.edges);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);

  const applyNodeChanges = useWorkflowStore((s) => s.applyNodeChanges);
  const applyEdgeChanges = useWorkflowStore((s) => s.applyEdgeChanges);
  const connect = useWorkflowStore((s) => s.connect);
  const updateEdgeConnection = useWorkflowStore(
    (s) => s.updateEdgeConnection
  );
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const addNodeFromPalette = useWorkflowStore((s) => s.addNodeFromPalette);
  const removeNode = useWorkflowStore((s) => s.removeNode);
  const removeEdge = useWorkflowStore((s) => s.removeEdge);

  // Tracks whether a drag of an edge endpoint landed on a valid target.
  // If false at drag end, the user dropped the endpoint on empty canvas →
  // remove the edge (standard React Flow "drag-to-delete" pattern).
  const edgeUpdateSuccessful = useRef(true);

  const onEdgeUpdateStart = useCallback(() => {
    edgeUpdateSuccessful.current = false;
  }, []);

  const onEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeUpdateSuccessful.current = true;
      updateEdgeConnection(oldEdge, newConnection);
    },
    [updateEdgeConnection]
  );

  const onEdgeUpdateEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeUpdateSuccessful.current) {
        removeEdge(edge.id);
      }
      edgeUpdateSuccessful.current = true;
    },
    [removeEdge]
  );

  const { screenToFlowPosition } = useReactFlow();

  // React Flow needs Node[]/Edge[]; we mirror the store doc into that shape.
  // Forwarding width/height/positionAbsolute keeps RF's internal measurement
  // state stable — otherwise every dimensions update from RF feeds back into
  // the store and re-renders the node as "unmeasured", which made it invisible.
  const rfNodes = useMemo<Node<WorkflowNodeData>[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "dynamic",
        position: n.position,
        data: n.data,
        width: n.width ?? undefined,
        height: n.height ?? undefined,
        positionAbsolute: n.positionAbsolute,
        dragging: n.dragging,
        selected: n.id === selectedNodeId,
        // Start is the workflow entry point — disable RF's delete affordance.
        deletable: n.data.type !== "start",
      })),
    [nodes, selectedNodeId]
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        type: "adjustable",
        source: e.source,
        sourceHandle: e.sourceHandle ?? undefined,
        target: e.target,
        targetHandle: e.targetHandle ?? undefined,
        data: e.data,
      })),
    [edges]
  );

  const nodeTypes = useMemo(
    () => ({ dynamic: DynamicWorkflowNode }),
    []
  );

  const edgeTypes = useMemo(
    () => ({ adjustable: AdjustableEdge }),
    []
  );

  // Always allow drop — checking `dataTransfer.types` here is unreliable
  // (Safari and some Firefox versions hide custom MIME types during
  // dragover), so we accept everything and defer the type check to onDrop.
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const typeKey = e.dataTransfer.getData(PALETTE_DND_TYPE);
      if (!typeKey) return;
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      addNodeFromPalette(typeKey, position);
    },
    [addNodeFromPalette, screenToFlowPosition]
  );

  return (
    // Drag handlers live on the wrapper, not on <ReactFlow>, because
    // ReactFlow's pointer-event capture interferes with native HTML5 DnD.
    <div
      ref={wrapperRef}
      className="relative h-full min-h-0 flex-1"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(instance) => {
          rfInstanceRef.current = instance;
        }}
        onNodesChange={applyNodeChanges}
        onEdgesChange={applyEdgeChanges}
        onConnect={connect}
        onEdgeUpdate={onEdgeUpdate}
        onEdgeUpdateStart={onEdgeUpdateStart}
        onEdgeUpdateEnd={onEdgeUpdateEnd}
        edgeUpdaterRadius={14}
        onNodeClick={(_, n) => selectNode(n.id)}
        onPaneClick={() => selectNode(null)}
        onNodesDelete={(deleted) => deleted.forEach((n) => removeNode(n.id))}
        onEdgesDelete={(deleted) => deleted.forEach((e) => removeEdge(e.id))}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.4, maxZoom: 1.5 }}
        defaultEdgeOptions={{
          type: "adjustable",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#94a3b8",
            width: 18,
            height: 18,
          },
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        }}
        connectionLineStyle={{ stroke: "#2563eb", strokeWidth: 1.5 }}
        connectionLineType={"smoothstep" as never}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1.2}
          color="#cbd5e1"
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(n) => {
            const data = n.data as WorkflowNodeData | undefined;
            const def = data ? nodeRegistry[data.type] : undefined;
            return def ? MINIMAP_COLORS[def.color] : "#cbd5e1";
          }}
          nodeStrokeColor="rgba(15, 23, 42, 0.15)"
          nodeStrokeWidth={2}
          maskColor="rgba(241, 245, 249, 0.65)"
        />
      </ReactFlow>

      {nodes.length === 1 && nodes[0].data.type === "start" && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
          <div className="rounded-full border border-dashed border-ink-300 bg-white/80 px-4 py-1.5 text-[11px] text-ink-500 shadow-sm backdrop-blur-sm">
            Drag a node from the left to begin →
          </div>
        </div>
      )}
    </div>
  );
}
