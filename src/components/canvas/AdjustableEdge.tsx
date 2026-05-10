import { memo, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from "reactflow";

import { useWorkflowStore } from "@/store/workflowStore";

/**
 * Custom edge with a draggable midpoint that bends the wire freely in any
 * direction. The wire is a two-segment cubic Bezier that passes exactly
 * through the user-controlled bend point, so the drag handle is *always*
 * on the wire (not just at default — also after dragging up, down, or
 * sideways).
 *
 *  - Drag → reroute. Offset is in flow coords, so the path is stable at
 *    any zoom.
 *  - Double-click → reset to the auto-computed midpoint.
 *
 * Each Bezier segment exits/enters its endpoint horizontally, so arrow
 * markers stay oriented along the horizontal axis at the target node.
 */
interface AdjustableEdgeData {
  routingOffset?: { x: number; y: number };
}

function AdjustableEdgeBase({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
  selected,
}: EdgeProps<AdjustableEdgeData>) {
  const { screenToFlowPosition } = useReactFlow();
  const updateEdgeData = useWorkflowStore((s) => s.updateEdgeData);
  const removeEdge = useWorkflowStore((s) => s.removeEdge);

  // Hover state with a small grace period so moving from the wire to the
  // delete button (across an SVG → HTML transition) doesn't flicker the
  // controls off.
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const enterHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHovered(true);
  };
  const leaveHover = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setHovered(false);
      hoverTimer.current = null;
    }, 120);
  };
  useEffect(() => {
    return () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    };
  }, []);

  const offset = data?.routingOffset ?? { x: 0, y: 0 };

  const defaultBendX = (sourceX + targetX) / 2;
  const defaultBendY = (sourceY + targetY) / 2;
  const bendX = defaultBendX + offset.x;
  const bendY = defaultBendY + offset.y;

  // Two cubic Beziers joined at (bendX, bendY). Horizontal control points
  // at each end keep the wire entering/exiting nodes horizontally so the
  // arrow marker stays sensible.
  const ctrlAX = (sourceX + bendX) / 2;
  const ctrlBX = (bendX + targetX) / 2;
  const path = [
    `M ${sourceX},${sourceY}`,
    `C ${ctrlAX},${sourceY} ${ctrlAX},${bendY} ${bendX},${bendY}`,
    `C ${ctrlBX},${bendY} ${ctrlBX},${targetY} ${targetX},${targetY}`,
  ].join(" ");

  // Drag state lives in a ref so re-renders during the drag don't reset it.
  const drag = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffset: { x: number; y: number };
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    drag.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffset: { ...offset },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const flowStart = screenToFlowPosition({
      x: d.startClientX,
      y: d.startClientY,
    });
    const flowNow = screenToFlowPosition({ x: e.clientX, y: e.clientY });

    updateEdgeData(id, {
      routingOffset: {
        x: d.startOffset.x + (flowNow.x - flowStart.x),
        y: d.startOffset.y + (flowNow.y - flowStart.y),
      },
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateEdgeData(id, { routingOffset: { x: 0, y: 0 } });
  };

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeEdge(id);
  };

  const isAdjusted = offset.x !== 0 || offset.y !== 0;
  const showDelete = hovered || selected;

  return (
    <>
      {/* Wrap the path in a <g> so we can detect hover on the wire (and the
          wider invisible interaction area created by `interactionWidth`). */}
      <g onMouseEnter={enterHover} onMouseLeave={leaveHover}>
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          style={style}
          interactionWidth={24}
        />
      </g>
      <EdgeLabelRenderer>
        {/* `nopan nodrag` opts this element out of React Flow's pan + node-drag
            handlers, which are registered on parent elements. Without these
            classes, dragging the marker would pan the whole viewport. */}
        <div
          className="nopan nodrag"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${bendX}px, ${bendY}px)`,
            pointerEvents: "all",
          }}
          onMouseEnter={enterHover}
          onMouseLeave={leaveHover}
        >
          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            // Belt-and-braces: stop the bare mousedown from reaching the pane
            // even on browsers that fire it before the pointerdown handler.
            onMouseDown={(e) => e.stopPropagation()}
            className={clsx(
              "block h-3 w-3 cursor-grab rounded-full border-2 bg-white shadow-sm transition-all hover:scale-150 active:cursor-grabbing active:scale-150",
              selected || isAdjusted
                ? "border-brand-500"
                : "border-ink-300 hover:border-brand-500"
            )}
            title="Drag to reroute · Double-click to reset"
            aria-label="Adjust edge routing"
          />
          {showDelete && (
            <button
              type="button"
              onClick={onDelete}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute left-full top-1/2 ml-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              title="Delete connection"
              aria-label="Delete connection"
            >
              <X size={11} strokeWidth={2.75} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const AdjustableEdge = memo(AdjustableEdgeBase);
